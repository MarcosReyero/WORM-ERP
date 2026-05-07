"""Policy definitions."""


from typing import Any, Dict


class PolicyError(Exception):
    pass


def validate_tag_exists(tag_name: str, tag_map: Dict[str, Any]) -> Dict[str, Any]:
    """Valida tag exists."""
    tags = tag_map.get("tags", {})
    if tag_name not in tags:
        raise PolicyError(f"Tag no permitido o inexistente: {tag_name}")
    return tags[tag_name]


def validate_read_allowed(tag_name: str, tag_map: Dict[str, Any]) -> Dict[str, Any]:
    """Valida read allowed."""
    tag = validate_tag_exists(tag_name, tag_map)
    if tag.get("access") not in ("read", "read_write"):
        raise PolicyError(f"Lectura no permitida para el tag: {tag_name}")
    return tag


def validate_write_allowed(
    tag_name: str, tag_map: Dict[str, Any], read_only: bool
) -> Dict[str, Any]:
    """Valida write allowed."""
    if read_only:
        raise PolicyError("Escritura no permitida: servidor en modo solo lectura")

    tag = validate_tag_exists(tag_name, tag_map)
    if tag.get("access") not in ("write", "read_write"):
        raise PolicyError(f"Escritura no permitida para el tag: {tag_name}")
    return tag
