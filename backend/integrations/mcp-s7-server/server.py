import yaml
from mcp.server.fastmcp import FastMCP

from config import settings
from plc_client import PLCClient
from policies import validate_read_allowed, validate_write_allowed

mcp = FastMCP("mcp-s7-server")


def load_tag_map(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_plc() -> PLCClient:
    return PLCClient(
        host=settings.plc_host,
        rack=settings.plc_rack,
        slot=settings.plc_slot,
        tcp_port=settings.plc_tcp_port,
    )


@mcp.tool()
def plc_ping() -> dict:
    plc = get_plc()
    try:
        plc.connect()
        return {
            "ok": plc.is_connected(),
            "host": settings.plc_host,
            "rack": settings.plc_rack,
            "slot": settings.plc_slot,
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "host": settings.plc_host,
            "rack": settings.plc_rack,
            "slot": settings.plc_slot,
        }
    finally:
        plc.disconnect()


@mcp.tool()
def plc_list_tags() -> dict:
    tag_map = load_tag_map(settings.tag_map_path)
    return tag_map


@mcp.tool()
def plc_read_tag(tag_name: str) -> dict:
    plc = get_plc()
    try:
        tag_map = load_tag_map(settings.tag_map_path)
        tag_def = validate_read_allowed(tag_name, tag_map)
        plc.connect()
        value = plc.read_tag(tag_def)
        return {
            "ok": True,
            "tag": tag_name,
            "value": value,
            "type": tag_def.get("type"),
            "db": tag_def.get("db"),
            "byte": tag_def.get("byte"),
            "bit": tag_def.get("bit"),
        }
    except Exception as exc:
        return {
            "ok": False,
            "tag": tag_name,
            "error": str(exc),
        }
    finally:
        plc.disconnect()


@mcp.tool()
def plc_read_tags(tag_names: list[str]) -> dict:
    results = {}

    plc = get_plc()
    try:
        tag_map = load_tag_map(settings.tag_map_path)
        plc.connect()
        for tag_name in tag_names:
            tag_def = validate_read_allowed(tag_name, tag_map)
            results[tag_name] = {
                "value": plc.read_tag(tag_def),
                "type": tag_def.get("type"),
                "db": tag_def.get("db"),
                "byte": tag_def.get("byte"),
                "bit": tag_def.get("bit"),
            }
        return {"ok": True, "results": results}
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "results": results,
        }
    finally:
        plc.disconnect()


@mcp.tool()
def plc_write_tag(tag_name: str, value: bool | int | float) -> dict:
    plc = get_plc()
    try:
        tag_map = load_tag_map(settings.tag_map_path)
        tag_def = validate_write_allowed(tag_name, tag_map, settings.read_only)
        plc.connect()
        plc.write_tag(tag_def, value)
        written_value = plc.read_tag(tag_def)
        return {
            "ok": True,
            "tag": tag_name,
            "requested_value": value,
            "written_value": written_value,
            "type": tag_def.get("type"),
            "db": tag_def.get("db"),
            "byte": tag_def.get("byte"),
            "bit": tag_def.get("bit"),
        }
    except Exception as exc:
        return {
            "ok": False,
            "tag": tag_name,
            "requested_value": value,
            "error": str(exc),
        }
    finally:
        plc.disconnect()


if __name__ == "__main__":
    mcp.run()
