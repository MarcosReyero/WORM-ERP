import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "inventary-dev-secret-key")
DEBUG = os.getenv("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = ["127.0.0.1","192.168.8.67", "localhost", "testserver"]
CSRF_TRUSTED_ORIGINS = ["http://127.0.0.1:5173", "http://localhost:5173", "http://192.168.8.67:5173"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "accounts",
    "communications",
    "inventory",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "es-ar"
TIME_ZONE = "America/Argentina/Buenos_Aires"

USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Email configuration para desarrollo
if DEBUG:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    EMAIL_HOST = "smtp.gmail.com"
    EMAIL_PORT = 587
    EMAIL_USE_TLS = True
    EMAIL_HOST_USER = os.getenv("DJANGO_EMAIL_HOST_USER", "reyeromateo@gmail.com")
    EMAIL_HOST_PASSWORD = os.getenv("DJANGO_EMAIL_HOST_PASSWORD", "pgtv dkkc eyao iovh")
else:
    EMAIL_BACKEND = "django.core.mail.backends.file.EmailBackend"
    EMAIL_FILE_PATH = BASE_DIR / "tmp" / "email-messages"

DEFAULT_FROM_EMAIL = os.getenv("DJANGO_DEFAULT_FROM_EMAIL", "inventario@erp.local")
INVENTORY_ALARM_EMAILS_ENABLED = (
    os.getenv("INVENTORY_ALARM_EMAILS_ENABLED", "true").lower() == "true"
)
INVENTORY_AUTOMATION_ENABLED = (
    os.getenv("INVENTORY_AUTOMATION_ENABLED", "true").lower() == "true"
)
INVENTORY_AUTOMATION_POLL_SECONDS = int(
    os.getenv("INVENTORY_AUTOMATION_POLL_SECONDS", "60")
)
INVENTORY_AUTOMATION_SCHEDULER_LEASE_SECONDS = int(
    os.getenv("INVENTORY_AUTOMATION_SCHEDULER_LEASE_SECONDS", "90")
)
INVENTORY_MINIMUM_STOCK_RECONCILE_SECONDS = int(
    os.getenv("INVENTORY_MINIMUM_STOCK_RECONCILE_SECONDS", "600")
)
INVENTORY_AUTOMATION_BATCH_SIZE = int(
    os.getenv("INVENTORY_AUTOMATION_BATCH_SIZE", "100")
)
INVENTORY_AUTOMATION_JOB_HEARTBEAT_SECONDS = int(
    os.getenv("INVENTORY_AUTOMATION_JOB_HEARTBEAT_SECONDS", "15")
)
INVENTORY_AUTOMATION_DIGEST_LEASE_SECONDS = int(
    os.getenv("INVENTORY_AUTOMATION_DIGEST_LEASE_SECONDS", "300")
)

TIA_MCP_ENABLED = os.getenv("TIA_MCP_ENABLED", "false").lower() == "true"
TIA_MCP_TRANSPORT = os.getenv("TIA_MCP_TRANSPORT", "stdio")
TIA_MCP_SERVER_NAME = os.getenv("TIA_MCP_SERVER_NAME", "mcp-s7-server")
TIA_MCP_SERVER_PATH = Path(
    os.getenv(
        "TIA_MCP_SERVER_PATH",
        str(BASE_DIR / "integrations" / "mcp-s7-server"),
    )
)
TIA_MCP_COMMAND = os.getenv("TIA_MCP_COMMAND", f'"{sys.executable}" server.py')
TIA_MCP_TIMEOUT_SECONDS = float(os.getenv("TIA_MCP_TIMEOUT_SECONDS", "4"))
TIA_MCP_READ_ONLY = os.getenv("TIA_MCP_READ_ONLY", "true").lower() == "true"
TIA_MCP_RUNTIME_DIR = Path(os.getenv("TIA_MCP_RUNTIME_DIR", str(BASE_DIR / "runtime" / "tia")))
TIA_S7_PLC_HOST = os.getenv("TIA_S7_PLC_HOST", os.getenv("PLC_HOST", "127.0.0.1"))
TIA_S7_PLC_RACK = int(os.getenv("TIA_S7_PLC_RACK", os.getenv("PLC_RACK", "0")))
TIA_S7_PLC_SLOT = int(os.getenv("TIA_S7_PLC_SLOT", os.getenv("PLC_SLOT", "2")))
TIA_S7_PLC_TCP_PORT = int(os.getenv("TIA_S7_PLC_TCP_PORT", os.getenv("PLC_TCP_PORT", "102")))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Logging configuration para desarrollo
if DEBUG:
    LOGGING = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "verbose": {
                "format": "[{levelname}] {name} - {message}",
                "style": "{",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "verbose",
            },
        },
        "loggers": {
            "inventory.automation": {
                "handlers": ["console"],
                "level": "INFO",
                "propagate": False,
            },
            "inventory.automation.digest": {
                "handlers": ["console"],
                "level": "INFO",
                "propagate": False,
            },
        },
    }
else:
    LOGGING = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "verbose": {
                "format": "[{levelname}] {name} - {message}",
                "style": "{",
            },
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "verbose",
            },
        },
        "loggers": {
            "inventory.automation": {
                "handlers": ["console"],
                "level": "WARNING",
                "propagate": False,
            },
        },
    }
