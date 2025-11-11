# Build script for publishing backend as self-contained executables for all platforms (PowerShell)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$BackendDir = Join-Path $ProjectRoot "backend\SQLStressTest.Service"
$ExtensionDir = Join-Path $ProjectRoot "extension"
$ResourcesDir = Join-Path $ExtensionDir "resources\backend"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building Backend for All Platforms" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create resources directory structure
$platforms = @(
    "win32-x64",
    "darwin-x64",
    "darwin-arm64",
    "linux-x64"
)

foreach ($platform in $platforms) {
    $platformDir = Join-Path $ResourcesDir $platform
    if (-not (Test-Path $platformDir)) {
        New-Item -ItemType Directory -Path $platformDir -Force | Out-Null
    }
}

Push-Location $BackendDir

# Function to publish for a specific RID
function Publish-ForRid {
    param(
        [string]$Rid,
        [string]$OutputDir,
        [string]$PlatformName
    )
    
    Write-Host "Publishing for $PlatformName ($Rid)..." -ForegroundColor Yellow
    
    dotnet publish `
        -c Release `
        -r $Rid `
        --self-contained true `
        -p:PublishSingleFile=true `
        -p:PublishTrimmed=true `
        -p:TrimMode=link `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:DebugType=none `
        -p:DebugSymbols=false `
        -o $OutputDir
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to publish for $PlatformName"
    }
    
    Write-Host "✓ Published $PlatformName" -ForegroundColor Green
    Write-Host ""
}

# Publish for each platform
try {
    Publish-ForRid "win-x64" (Join-Path $ResourcesDir "win32-x64") "Windows x64"
    Publish-ForRid "osx-x64" (Join-Path $ResourcesDir "darwin-x64") "macOS x64"
    Publish-ForRid "osx-arm64" (Join-Path $ResourcesDir "darwin-arm64") "macOS ARM64"
    Publish-ForRid "linux-x64" (Join-Path $ResourcesDir "linux-x64") "Linux x64"
    
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Backend build complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Executables are located in:" -ForegroundColor White
    Write-Host "  $ResourcesDir" -ForegroundColor Gray
    Write-Host ""
}
catch {
    Write-Host "ERROR: Build failed: $_" -ForegroundColor Red
    exit 1
}
finally {
    Pop-Location
}

