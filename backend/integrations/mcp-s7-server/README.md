# mcp-s7-server

Base scaffold for an S7 MCP server.


# mcp-s7-server

Servidor MCP para exponer variables de PLC Siemens S7 mediante un catálogo controlado de tags.

## Primera etapa
- conexión a PLC S7
- lectura de variables desde DB
- validación por whitelist (`tag_map.yaml`)
- modo solo lectura

## Instalación

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt