#!/usr/bin/env pwsh
# Script de desarrollo para ejecutar la automatización en modo local

param(
    [switch]$Verbose = $false,
    [switch]$Help = $false,
    [int]$PollSeconds = 60,
    [int]$ReconcileSeconds = 600
)

if ($Help) {
    Write-Host @"
🔧 Script de desarrollo para Automatización de Stock Mínimo

Uso:
    .\dev-automation.ps1                # Ejecutar con defaults (poll=60s)
    .\dev-automation.ps1 -Verbose       # Con logging DEBUG
    .\dev-automation.ps1 -PollSeconds 30 -ReconcileSeconds 300  # Personalizado
    .\dev-automation.ps1 -Help          # Ver esta ayuda

Opciones:
    -Verbose              Habilita logging DEBUG
    -PollSeconds <N>      Intervalo de polling en segundos (default 60)
    -ReconcileSeconds <N> Intervalo de reconciliación (default 600 = 10 min)
    -Help                 Muestra esta ayuda

Ejemplos:
    # Mode rápido: polling cada 15s para testing
    .\dev-automation.ps1 -PollSeconds 15 -ReconcileSeconds 30

    # Mode normal con debug
    .\dev-automation.ps1 -Verbose

Presiona Ctrl+C para detener.
"@
    exit 0
}

# Detecta si estamos en el directorio correcto
if (-not (Test-Path "backend\manage.py")) {
    Write-Host "❌ Error: Debes ejecutar este script desde la raíz del proyecto (el que contiene backend/)" -ForegroundColor Red
    exit 1
}

# Verifica que el venv esté activado
if ($null -eq $env:VIRTUAL_ENV) {
    Write-Host "⚠️  Activando virtual environment..." -ForegroundColor Yellow
    & ".\.venv\Scripts\Activate.ps1"
}

# Mensaje de bienvenida
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   MODO DESARROLLO - Automatización de Stock Mínimo      ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuración:" -ForegroundColor Green
Write-Host "  • Poll interval:      $PollSeconds segundos"
Write-Host "  • Reconcile interval: $ReconcileSeconds segundos"
Write-Host "  • Verbose logging:    $(if ($Verbose) { '✓ ENABLED' } else { '✗ disabled' })"
Write-Host ""
Write-Host "Presiona Ctrl+C para detener." -ForegroundColor Yellow
Write-Host ""

# Construir argumentos
$Args = @(
    "manage.py",
    "run_inventory_automation",
    "--poll-seconds", $PollSeconds,
    "--reconcile-interval", $ReconcileSeconds,
    "--dev"
)

if ($Verbose) {
    Write-Host "Iniciando con DEBUG logging..." -ForegroundColor Green
}

# Ejecutar
cd backend
python @Args
