"""PLC client implementation."""


import io
import logging
from contextlib import redirect_stderr, redirect_stdout
from typing import Any

import snap7
from snap7.type import Parameter
from snap7.util import get_bool, get_int, get_real, set_bool, set_int, set_real


for logger_name in ("snap7", "snap7.client", "snap7.connection", "snap7.s7protocol"):
    logger = logging.getLogger(logger_name)
    logger.handlers.clear()
    logger.propagate = False
    logger.setLevel(logging.ERROR)


class PLCClient:
    def __init__(self, host: str, rack: int, slot: int, tcp_port: int = 102):
        """Inicializa la instancia."""
        self.host = host
        self.rack = rack
        self.slot = slot
        self.tcp_port = tcp_port
        self.client = self._quiet_call(snap7.client.Client)
        for parameter in (Parameter.PingTimeout, Parameter.SendTimeout, Parameter.RecvTimeout):
            try:
                self._quiet_call(self.client.set_param, parameter, 1200)
            except Exception:
                pass

    @staticmethod
    def _quiet_call(func, *args, **kwargs):
        """Maneja quiet call."""
        sink = io.StringIO()
        with redirect_stdout(sink), redirect_stderr(sink):
            return func(*args, **kwargs)

    def connect(self) -> None:
        """Maneja connect."""
        self._quiet_call(self.client.connect, self.host, self.rack, self.slot, self.tcp_port)

    def disconnect(self) -> None:
        """Maneja disconnect."""
        try:
            if self.client.get_connected():
                self._quiet_call(self.client.disconnect)
        except Exception:
            return

    def is_connected(self) -> bool:
        """Verifica si connected."""
        return self.client.get_connected()

    def get_cpu_state(self) -> str:
        """Devuelve cpu state."""
        state = self._quiet_call(self.client.get_cpu_state)
        return str(state)

    def read_db(self, db_number: int, start: int, size: int) -> bytes:
        """Maneja read db."""
        return self._quiet_call(self.client.db_read, db_number, start, size)

    def write_db(self, db_number: int, start: int, data: bytes | bytearray) -> None:
        """Maneja write db."""
        self._quiet_call(self.client.db_write, db_number, start, data)

    def read_tag(self, tag_def: dict[str, Any]) -> Any:
        """Maneja read tag."""
        area = tag_def["area"].lower()
        data_type = tag_def["type"].lower()
        byte_index = int(tag_def["byte"])

        if area != "db":
            raise ValueError(f"Area no soportada todavia: {area}")

        db_number = int(tag_def["db"])

        if data_type == "bool":
            bit_index = int(tag_def["bit"])
            raw = self.read_db(db_number, byte_index, 1)
            return get_bool(raw, 0, bit_index)

        if data_type == "int":
            raw = self.read_db(db_number, byte_index, 2)
            return get_int(raw, 0)

        if data_type == "real":
            raw = self.read_db(db_number, byte_index, 4)
            return get_real(raw, 0)

        raise ValueError(f"Tipo no soportado todavia: {data_type}")

    def write_tag(self, tag_def: dict[str, Any], value: Any) -> None:
        """Maneja write tag."""
        area = tag_def["area"].lower()
        data_type = tag_def["type"].lower()
        byte_index = int(tag_def["byte"])

        if area != "db":
            raise ValueError(f"Area no soportada todavia: {area}")

        db_number = int(tag_def["db"])

        if data_type == "bool":
            bit_index = int(tag_def["bit"])
            raw = bytearray(self.read_db(db_number, byte_index, 1))
            set_bool(raw, 0, bit_index, bool(value))
            self.write_db(db_number, byte_index, raw)
            return

        if data_type == "int":
            raw = bytearray(2)
            set_int(raw, 0, int(value))
            self.write_db(db_number, byte_index, raw)
            return

        if data_type == "real":
            raw = bytearray(4)
            set_real(raw, 0, float(value))
            self.write_db(db_number, byte_index, raw)
            return

        raise ValueError(f"Tipo no soportado todavia: {data_type}")
