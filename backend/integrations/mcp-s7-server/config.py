"""Application configuration."""


from dataclasses import dataclass
import os
from dotenv import load_dotenv

load_dotenv()


@dataclass
class Settings:
    plc_host: str = os.getenv("PLC_HOST", "127.0.0.1")
    plc_rack: int = int(os.getenv("PLC_RACK", "0"))
    plc_slot: int = int(os.getenv("PLC_SLOT", "2"))
    plc_tcp_port: int = int(os.getenv("PLC_TCP_PORT", "102"))
    tag_map_path: str = os.getenv("TAG_MAP_PATH", "tag_map.yaml")
    read_only: bool = os.getenv("READ_ONLY", "true").lower() == "true"


settings = Settings()