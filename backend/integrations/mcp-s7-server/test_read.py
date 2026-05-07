import yaml

from config import settings
from plc_client import PLCClient
from policies import validate_read_allowed


def load_tag_map(path: str) -> dict:
    """Carga tag map."""
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def main() -> None:
    """Maneja main."""
    tag_map = load_tag_map(settings.tag_map_path)

    plc = PLCClient(
        host=settings.plc_host,
        rack=settings.plc_rack,
        slot=settings.plc_slot,
        tcp_port=settings.plc_tcp_port,
    )

    try:
        plc.connect()
        print("Conectado:", plc.is_connected())

        for tag_name in tag_map.get("tags", {}):
            try:
                print(f"Leyendo {tag_name}...")
                tag_def = validate_read_allowed(tag_name, tag_map)
                value = plc.read_tag(tag_def)
                print(f"{tag_name} = {value}")
            except Exception as e:
                print(f"ERROR en {tag_name}: {e}")

    finally:
        plc.disconnect()
        print("Desconectado")


if __name__ == "__main__":
    main()