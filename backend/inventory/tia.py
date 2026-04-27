import asyncio
import json
import os
import shlex
import sys
import tempfile
import time
from datetime import timedelta
from ipaddress import ip_address
from pathlib import Path
from typing import Any

from django.conf import settings
from django.utils import timezone


class TiaMcpError(Exception):
    """Raised when the S7 MCP read path cannot provide live data."""


DEFAULT_TIA_TAGS = [
    {
        "name": "marcha_motor",
        "label": "Marcha motor",
        "description": "Estado de marcha del motor principal de linea.",
        "category": "Accionamiento",
        "area": "db",
        "db": 1,
        "byte": 0,
        "bit": 0,
        "type": "bool",
        "access": "read",
        "unit": "",
        "normal_state": True,
    },
    {
        "name": "fallo_motor",
        "label": "Fallo motor",
        "description": "Bandera de falla activa reportada por el PLC.",
        "category": "Diagnostico",
        "area": "db",
        "db": 1,
        "byte": 0,
        "bit": 1,
        "type": "bool",
        "access": "read",
        "unit": "",
        "normal_state": False,
    },
    {
        "name": "contador_piezas",
        "label": "Contador de piezas",
        "description": "Conteo acumulado de piezas procesadas.",
        "category": "Produccion",
        "area": "db",
        "db": 1,
        "byte": 2,
        "type": "int",
        "access": "read",
        "unit": "pzs",
    },
    {
        "name": "temperatura",
        "label": "Temperatura",
        "description": "Temperatura de proceso tomada desde DB de monitoreo.",
        "category": "Proceso",
        "area": "db",
        "db": 1,
        "byte": 4,
        "type": "real",
        "access": "read",
        "unit": "C",
        "warning_min": 45,
        "critical_min": 65,
    },
]

RUNTIME_CONFIG_FILENAME = "mcp_config.json"
RUNTIME_LOG_FILENAME = "connection_logs.json"
MAX_LOG_ITEMS = 180


def _runtime_dir():
    path = Path(getattr(settings, "TIA_MCP_RUNTIME_DIR", settings.BASE_DIR / "runtime" / "tia"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def _runtime_config_path():
    return _runtime_dir() / RUNTIME_CONFIG_FILENAME


def _runtime_log_path():
    return _runtime_dir() / RUNTIME_LOG_FILENAME


def _now_iso():
    return timezone.localtime(timezone.now()).isoformat()


def _tag_address(tag):
    address = f"DB{tag['db']}.DBX{tag['byte']}"
    if tag.get("type") == "bool":
        return f"{address}.{tag.get('bit', 0)}"
    if tag.get("type") == "int":
        return f"DB{tag['db']}.DBW{tag['byte']}"
    if tag.get("type") == "real":
        return f"DB{tag['db']}.DBD{tag['byte']}"
    return address


def _format_value(value, tag):
    if value is None:
        return "-"
    if tag["type"] == "bool":
        return "Activo" if bool(value) else "Inactivo"
    if tag["type"] == "real":
        return f"{float(value):.1f} {tag.get('unit', '')}".strip()
    return f"{value} {tag.get('unit', '')}".strip()


def _mock_value(tag, now):
    seconds = now.second
    if tag["name"] == "marcha_motor":
        return seconds % 45 < 34
    if tag["name"] == "fallo_motor":
        return False
    if tag["name"] == "contador_piezas":
        return 12840 + now.hour * 42 + now.minute
    if tag["name"] == "temperatura":
        return round(38.4 + (seconds % 11) * 0.27, 1)
    return None


def _coerce_value(value, tag):
    if value is None:
        return None
    if tag["type"] == "bool":
        if isinstance(value, str):
            return value.lower() in ("true", "1", "on", "activo")
        return bool(value)
    if tag["type"] == "int":
        return int(value)
    if tag["type"] == "real":
        return float(value)
    return value


def _tag_health(tag, value):
    if value is None:
        return {
            "state": "unknown",
            "label": "Sin lectura",
            "pill": "low",
        }

    if tag["name"] == "fallo_motor":
        return {
            "state": "alarm" if value else "ok",
            "label": "Fallo activo" if value else "Normal",
            "pill": "out" if value else "ok",
        }

    if tag["type"] == "bool":
        expected = tag.get("normal_state")
        if expected is None or bool(value) == expected:
            return {"state": "ok", "label": "Normal", "pill": "ok"}
        return {"state": "standby", "label": "En espera", "pill": "low"}

    if tag["type"] == "real":
        if tag.get("critical_min") is not None and value >= tag["critical_min"]:
            return {"state": "critical", "label": "Critico", "pill": "out"}
        if tag.get("warning_min") is not None and value >= tag["warning_min"]:
            return {"state": "warning", "label": "Atencion", "pill": "low"}

    return {"state": "ok", "label": "Normal", "pill": "ok"}


def _load_json_file(path, fallback):
    if not path.exists():
        return fallback
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except (OSError, json.JSONDecodeError):
        return fallback


def _write_json_file(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)


def append_tia_log(level, event, detail, config=None, extra=None):
    item = {
        "timestamp": _now_iso(),
        "level": level,
        "event": event,
        "detail": detail,
    }
    if config:
        item["plc"] = {
            "host": config.get("plc", {}).get("host"),
            "rack": config.get("plc", {}).get("rack"),
            "slot": config.get("plc", {}).get("slot"),
            "tcp_port": config.get("plc", {}).get("tcp_port"),
        }
        item["enabled"] = config.get("enabled")
        item["server_path"] = config.get("server_path")
    if extra:
        item.update(extra)

    logs = _load_json_file(_runtime_log_path(), [])
    logs.insert(0, item)
    _write_json_file(_runtime_log_path(), logs[:MAX_LOG_ITEMS])
    return item


def list_tia_logs(limit=80):
    logs = _load_json_file(_runtime_log_path(), [])
    return logs[:limit]


def _default_tia_mcp_config():
    server_path = str(getattr(settings, "TIA_MCP_SERVER_PATH", ""))
    return {
        "enabled": bool(getattr(settings, "TIA_MCP_ENABLED", False)),
        "transport": getattr(settings, "TIA_MCP_TRANSPORT", "stdio"),
        "server_name": getattr(settings, "TIA_MCP_SERVER_NAME", "mcp-s7-server"),
        "server_path": server_path,
        "command": getattr(settings, "TIA_MCP_COMMAND", f'"{sys.executable}" server.py'),
        "timeout_seconds": float(getattr(settings, "TIA_MCP_TIMEOUT_SECONDS", 4)),
        "read_only": bool(getattr(settings, "TIA_MCP_READ_ONLY", True)),
        "tag_map_path": str(Path(server_path) / "tag_map.yaml") if server_path else "tag_map.yaml",
        "plc": {
            "host": getattr(settings, "TIA_S7_PLC_HOST", "127.0.0.1"),
            "rack": getattr(settings, "TIA_S7_PLC_RACK", 0),
            "slot": getattr(settings, "TIA_S7_PLC_SLOT", 2),
            "tcp_port": getattr(settings, "TIA_S7_PLC_TCP_PORT", 102),
        },
        "tools": {
            "ping": "plc_ping",
            "list_tags": "plc_list_tags",
            "read_tag": "plc_read_tag",
            "read_tags": "plc_read_tags",
        },
    }


def _merge_runtime_config(default_config, runtime_config):
    if not isinstance(runtime_config, dict):
        return default_config

    merged = {**default_config}
    for key in (
        "enabled",
        "transport",
        "server_name",
        "server_path",
        "command",
        "timeout_seconds",
        "read_only",
        "tag_map_path",
    ):
        if key in runtime_config:
            merged[key] = runtime_config[key]

    merged["plc"] = {
        **default_config["plc"],
        **(runtime_config.get("plc") if isinstance(runtime_config.get("plc"), dict) else {}),
    }
    merged["tools"] = default_config["tools"]
    return merged


def _validate_tia_config_payload(payload):
    if not isinstance(payload, dict):
        raise TiaMcpError("Payload de configuracion invalido.")

    plc_payload = payload.get("plc") if isinstance(payload.get("plc"), dict) else payload
    host = str(plc_payload.get("host") or "").strip()
    try:
        ip_address(host)
    except ValueError as exc:
        raise TiaMcpError("La IP del PLC no es valida.") from exc

    def parse_int(name, minimum, maximum):
        try:
            value = int(plc_payload.get(name))
        except (TypeError, ValueError) as exc:
            raise TiaMcpError(f"{name} debe ser numerico.") from exc
        if value < minimum or value > maximum:
            raise TiaMcpError(f"{name} fuera de rango permitido.")
        return value

    server_path = str(payload.get("server_path") or get_tia_mcp_config()["server_path"]).strip()
    tag_map_path = str(payload.get("tag_map_path") or (Path(server_path) / "tag_map.yaml")).strip()

    return {
        "enabled": bool(payload.get("enabled")),
        "transport": "stdio",
        "server_name": str(payload.get("server_name") or "mcp-s7-server").strip(),
        "server_path": server_path,
        "command": str(payload.get("command") or f'"{sys.executable}" server.py').strip(),
        "timeout_seconds": max(1.0, min(float(payload.get("timeout_seconds") or 4), 30.0)),
        "read_only": True,
        "tag_map_path": tag_map_path,
        "plc": {
            "host": host,
            "rack": parse_int("rack", 0, 7),
            "slot": parse_int("slot", 0, 31),
            "tcp_port": parse_int("tcp_port", 1, 65535),
        },
    }


def save_tia_mcp_config(payload):
    config = _validate_tia_config_payload(payload)
    _write_json_file(_runtime_config_path(), config)
    merged = get_tia_mcp_config()
    append_tia_log(
        "info",
        "config_saved",
        "Configuracion MCP S7-300 actualizada desde frontend.",
        merged,
    )
    return merged


def get_tia_mcp_config():
    default_config = _default_tia_mcp_config()
    runtime_config = _load_json_file(_runtime_config_path(), {})
    config = _merge_runtime_config(default_config, runtime_config)
    config["server_path_exists"] = Path(config["server_path"]).exists()
    config["tag_map_exists"] = Path(config["tag_map_path"]).exists()
    return config


def test_tia_mcp_connection():
    config = get_tia_mcp_config()
    now = timezone.now()
    result = _read_tag_values(config, now, allow_mock=False)
    ok = result["connection_state"] == "online"
    append_tia_log(
        "success" if ok else "error",
        "connection_test",
        "Prueba de conexion MCP finalizada." if ok else "Prueba de conexion MCP fallida.",
        config,
        {
            "state": result["connection_state"],
            "latency_ms": result["latency_ms"],
            "source": result["source"],
            "diagnostics": result["diagnostics"],
        },
    )
    return {
        "ok": ok,
        "connection_state": result["connection_state"],
        "latency_ms": result["latency_ms"],
        "source": result["source"],
        "diagnostics": result["diagnostics"],
        "logs": list_tia_logs(),
    }


class S7McpReadOnlyClient:
    def __init__(self, config):
        self.config = config

    def read_tags(self, tag_names):
        if not self.config["enabled"]:
            raise TiaMcpError("MCP S7 deshabilitado por configuracion.")
        if not self.config["read_only"]:
            raise TiaMcpError("El cliente TIA solo opera en modo lectura en esta etapa.")
        if self.config["transport"] != "stdio":
            raise TiaMcpError("Solo esta preparado el transporte MCP stdio.")

        return self._read_tags_stdio(tag_names)

    def _read_tags_stdio(self, tag_names):
        command = self._resolve_command(self.config["command"])
        if not command:
            raise TiaMcpError("TIA_MCP_COMMAND no esta configurado.")
        server_path = Path(self.config["server_path"])
        if not server_path.exists():
            raise TiaMcpError(f"No existe la carpeta del servidor MCP: {server_path}")

        env = {
            **os.environ,
            "PLC_HOST": str(self.config["plc"]["host"]),
            "PLC_RACK": str(self.config["plc"]["rack"]),
            "PLC_SLOT": str(self.config["plc"]["slot"]),
            "PLC_TCP_PORT": str(self.config["plc"]["tcp_port"]),
            "TAG_MAP_PATH": str(self.config["tag_map_path"]),
            "READ_ONLY": "true",
        }

        try:
            return asyncio.run(self._call_mcp_tool(command, env, server_path, tag_names))
        except ModuleNotFoundError as exc:
            raise TiaMcpError(
                f"Falta dependencia Python para MCP S7: {exc.name}. Instala backend/requirements.txt."
            ) from exc
        except OSError as exc:
            raise TiaMcpError(f"No se pudo iniciar servidor MCP S7: {exc}") from exc

    async def _call_mcp_tool(self, command, env, server_path, tag_names):
        from mcp import ClientSession
        from mcp.client.stdio import StdioServerParameters, stdio_client

        server = StdioServerParameters(
            command=command[0],
            args=command[1:],
            env=env,
            cwd=str(server_path),
        )
        try:
            with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as errlog:
                try:
                    async with stdio_client(server, errlog=errlog) as (read_stream, write_stream):
                        async with ClientSession(read_stream, write_stream) as session:
                            await session.initialize()
                            result = await session.call_tool(
                                self.config["tools"]["read_tags"],
                                {"tag_names": tag_names},
                                read_timeout_seconds=timedelta(
                                    seconds=max(float(self.config["timeout_seconds"]) + 3, 10)
                                ),
                            )
                except BaseExceptionGroup as exc:
                    detail = self._format_mcp_exception(exc, self._read_errlog(errlog))
                    raise TiaMcpError(detail) from exc
                except Exception as exc:
                    detail = self._format_mcp_exception(exc, self._read_errlog(errlog))
                    raise TiaMcpError(detail) from exc
        except BaseExceptionGroup as exc:
            raise TiaMcpError(str(exc)) from exc
        except Exception as exc:
            raise TiaMcpError(str(exc)) from exc

        if result.isError:
            detail = self._tool_result_text(result) or "Error MCP S7."
            raise TiaMcpError(detail)

        payload = result.structuredContent or self._tool_result_payload(result)
        if payload.get("ok") is False:
            raise TiaMcpError(payload.get("error") or "Lectura MCP S7 rechazada.")
        return payload.get("results", payload)

    @staticmethod
    def _tool_result_text(result):
        fragments = []
        for item in result.content or []:
            text = getattr(item, "text", None)
            if text:
                fragments.append(text)
        return "\n".join(fragments)

    @staticmethod
    def _read_errlog(errlog):
        try:
            errlog.seek(0)
            return errlog.read().strip()
        except OSError:
            return ""

    @staticmethod
    def _format_mcp_exception(exc, stderr_text):
        parts = []
        if stderr_text:
            parts.append(stderr_text)
        parts.append(str(exc))
        return "\n".join(part for part in parts if part)

    @classmethod
    def _tool_result_payload(cls, result):
        text = cls._tool_result_text(result)
        if not text:
            return {}
        try:
            return json.loads(text)
        except json.JSONDecodeError as exc:
            raise TiaMcpError("Respuesta MCP no es JSON valido.") from exc

    @staticmethod
    def _resolve_command(command_text):
        command = shlex.split(command_text, posix=False)
        if not command:
            return command

        executable = command[0].strip('"')
        if executable.lower() in ("python", "python.exe", "py", "py.exe"):
            return [sys.executable, *command[1:]]
        return command


def _read_tag_values(config, now, allow_mock=True):
    started = time.perf_counter()
    diagnostics = []
    source = "mock"
    connection_state = "simulated"
    raw_results: dict[str, Any] = {}

    if config["enabled"]:
        try:
            append_tia_log(
                "info",
                "read_start",
                "Iniciando lectura de tags via MCP S7-300.",
                config,
            )
            raw_results = S7McpReadOnlyClient(config).read_tags(
                [tag["name"] for tag in DEFAULT_TIA_TAGS]
            )
            source = "mcp"
            connection_state = "online"
            append_tia_log(
                "success",
                "read_success",
                "Lectura MCP completada correctamente.",
                config,
            )
        except TiaMcpError as exc:
            connection_state = "offline"
            if not allow_mock:
                source = "none"
            append_tia_log(
                "error",
                "read_failed",
                str(exc),
                config,
            )
            diagnostics.append(
                {
                    "level": "warning",
                    "title": "MCP S7 no disponible",
                    "detail": str(exc),
                }
            )
    else:
        if allow_mock:
            diagnostics.append(
                {
                    "level": "info",
                    "title": "Modo lectura simulado",
                    "detail": "Activar MCP real para consultar el servidor S7-300 por TCP/IP.",
                }
            )
        else:
            source = "none"
            connection_state = "offline"
            diagnostics.append(
                {
                    "level": "warning",
                    "title": "MCP S7 deshabilitado",
                    "detail": "Habilita el modo MCP real antes de probar la conexion TCP/IP.",
                }
            )

    latency_ms = round((time.perf_counter() - started) * 1000, 1)
    tags = []
    for tag in DEFAULT_TIA_TAGS:
        raw_value = raw_results.get(tag["name"], {}).get("value")
        if source != "mcp" and allow_mock:
            raw_value = _mock_value(tag, now)
        value = _coerce_value(raw_value, tag)
        health = _tag_health(tag, value)
        tags.append(
            {
                **tag,
                "address": _tag_address(tag),
                "value": value,
                "formatted_value": _format_value(value, tag),
                "health": health,
                "quality": "live" if source == "mcp" else source,
                "last_updated_at": timezone.localtime(now).isoformat(),
            }
        )

    return {
        "connection_state": connection_state,
        "diagnostics": diagnostics,
        "latency_ms": latency_ms,
        "source": source,
        "tags": tags,
    }


def build_tia_overview(user=None):
    config = get_tia_mcp_config()
    now = timezone.now()
    read_result = _read_tag_values(config, now)
    tags = read_result["tags"]
    active_faults = sum(1 for tag in tags if tag["health"]["pill"] == "out")
    warnings = sum(1 for tag in tags if tag["health"]["pill"] == "low")
    bool_tags = [tag for tag in tags if tag["type"] == "bool"]
    numeric_tags = [tag for tag in tags if tag["type"] != "bool"]

    connection_labels = {
        "online": ("Conectado", "ok"),
        "offline": ("Sin enlace MCP", "out"),
        "simulated": ("Simulado", "low"),
    }
    connection_label, connection_pill = connection_labels[read_result["connection_state"]]

    diagnostics = [
        {
            "level": "ok" if config["read_only"] else "warning",
            "title": "Politica de escritura",
            "detail": "Cliente interno bloqueado en modo lectura.",
        },
        {
            "level": "ok",
            "title": "Catalogo de tags",
            "detail": f"{len(DEFAULT_TIA_TAGS)} tags definidos para S7-300.",
        },
        {
            "level": "ok" if config["server_path_exists"] else "warning",
            "title": "Servidor MCP embebido",
            "detail": config["server_path"] if config["server_path_exists"] else "No se encontro la carpeta del servidor.",
        },
        *read_result["diagnostics"],
    ]

    return {
        "header": {
            "title": "TIA",
            "subtitle": "Integracion Siemens S7-300, diagnostico operativo y lectura de tags.",
        },
        "connection": {
            **config,
            "state": read_result["connection_state"],
            "label": connection_label,
            "pill": connection_pill,
            "latency_ms": read_result["latency_ms"],
            "last_poll_at": timezone.localtime(now).isoformat(),
            "source": read_result["source"],
        },
        "kpis": [
            {
                "label": "Tags monitoreados",
                "value": len(tags),
                "hint": "Catalogo S7-300 en lectura",
            },
            {
                "label": "Booleanas activas",
                "value": sum(1 for tag in bool_tags if tag["value"]),
                "hint": "Senales digitales en true",
            },
            {
                "label": "Variables numericas",
                "value": len(numeric_tags),
                "hint": "Enteros y reales disponibles",
            },
            {
                "label": "Alertas",
                "value": active_faults + warnings,
                "hint": "Criticas o en atencion",
            },
        ],
        "tags": tags,
        "diagnostics": diagnostics,
        "logs": list_tia_logs(),
    }


def build_tia_ai_reports(user=None):
    overview = build_tia_overview(user)
    tags = overview["tags"]
    now = timezone.localtime(timezone.now())
    latest_run = now - timedelta(minutes=22)
    next_run = now + timedelta(minutes=38)
    active_issues = [tag for tag in tags if tag["health"]["pill"] in ("low", "out")]
    temperature = next((tag for tag in tags if tag["name"] == "temperatura"), None)
    motor_fault = next((tag for tag in tags if tag["name"] == "fallo_motor"), None)

    thermal_findings = [
        "Temperatura dentro de banda operativa." if temperature and temperature["health"]["pill"] == "ok"
        else "Temperatura requiere seguimiento por desvio de banda.",
        "No se detecta perdida de calidad en lectura del tag temperatura.",
    ]
    motor_findings = [
        "Fallo motor sin activar." if motor_fault and not motor_fault["value"]
        else "Fallo motor activo o sin lectura confiable.",
        "Marcha y falla quedan preparadas para correlacion de eventos.",
    ]

    return {
        "schedule": {
            "mode": "periodic_stub",
            "cadence": "Cada 60 minutos",
            "next_run_at": next_run.isoformat(),
            "engine": "IA operacional preparada para automatizacion futura",
        },
        "latest": {
            "status": "prepared",
            "label": "Ultimo analisis preparado",
            "last_run_at": latest_run.isoformat(),
            "issues_detected": len(active_issues),
            "source": overview["connection"]["source"],
        },
        "items": [
            {
                "id": "tia-ai-thermal-drift",
                "title": "Vigilancia termica de proceso",
                "scope": "temperatura",
                "status": "prepared",
                "severity": "normal" if not active_issues else "watch",
                "last_run_at": latest_run.isoformat(),
                "findings": thermal_findings,
                "anomalies": [
                    tag["label"] for tag in active_issues if tag["name"] == "temperatura"
                ],
                "recommendations": [
                    "Registrar tendencia historica para detectar deriva lenta.",
                    "Cruzar temperatura con contador de piezas cuando exista historico.",
                ],
            },
            {
                "id": "tia-ai-drive-health",
                "title": "Diagnostico de accionamiento",
                "scope": "marcha_motor, fallo_motor",
                "status": "prepared",
                "severity": "normal" if motor_fault and not motor_fault["value"] else "watch",
                "last_run_at": latest_run.isoformat(),
                "findings": motor_findings,
                "anomalies": [
                    tag["label"] for tag in active_issues if tag["category"] in ("Accionamiento", "Diagnostico")
                ],
                "recommendations": [
                    "Mantener lectura read-only hasta validar direccionamiento DB en planta.",
                    "Agregar eventos de arranque/parada para analisis de ciclos.",
                ],
            },
            {
                "id": "tia-ai-production-flow",
                "title": "Flujo de produccion y conteo",
                "scope": "contador_piezas",
                "status": "prepared",
                "severity": "normal",
                "last_run_at": latest_run.isoformat(),
                "findings": [
                    "Contador disponible para calculo de ritmo operativo.",
                    "Historico pendiente para estimar OEE o microparadas.",
                ],
                "anomalies": [],
                "recommendations": [
                    "Persistir snapshots periodicos para tendencia por turno.",
                    "Definir umbrales por receta o producto si aplica.",
                ],
            },
        ],
    }
