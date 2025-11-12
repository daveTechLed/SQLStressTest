# Start SQL Server 2025 Docker container
# Usage: .\start-sqlserver.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Set-Location $ProjectRoot

Write-Host "Starting SQL Server 2025 Docker container..." -ForegroundColor Cyan
docker-compose up -d sqlserver2025

Write-Host ""
Write-Host "Waiting for SQL Server to be ready..." -ForegroundColor Yellow
Write-Host "This may take 30-60 seconds on first start..." -ForegroundColor Yellow

# Wait for health check
$maxAttempts = 60
$attempt = 0
while ($attempt -lt $maxAttempts) {
    $health = docker inspect --format='{{.State.Health.Status}}' sqlserver2025 2>$null
    if ($health -eq "healthy") {
        Write-Host ""
        Write-Host "✓ SQL Server 2025 is ready!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Connection details:" -ForegroundColor Cyan
        Write-Host "  Server: localhost,1433"
        Write-Host "  Username: sa"
        Write-Host "  Password: YourStrong!Passw0rd123"
        Write-Host ""
        exit 0
    }
    $attempt++
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "⚠ SQL Server container is running but may not be fully ready yet." -ForegroundColor Yellow
Write-Host "Check status with: docker ps" -ForegroundColor Yellow
Write-Host ""
Write-Host "Connection details:" -ForegroundColor Cyan
Write-Host "  Server: localhost,1433"
Write-Host "  Username: sa"
Write-Host "  Password: YourStrong!Passw0rd123"
Write-Host ""

