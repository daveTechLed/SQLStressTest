# Stop SQL Server 2025 Docker container
# Usage: .\stop-sqlserver.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Set-Location $ProjectRoot

Write-Host "Stopping SQL Server 2025 Docker container..." -ForegroundColor Cyan
docker-compose stop sqlserver2025

Write-Host "✓ SQL Server 2025 stopped" -ForegroundColor Green

