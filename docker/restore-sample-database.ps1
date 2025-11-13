# Restore Microsoft Sample Database (WideWorldImporters) to SQL Server 2025
# Usage: .\restore-sample-database.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Set-Location $ProjectRoot

# Connection details
$server = "localhost,1433"
$username = "sa"
$password = "YourStrong!Passw0rd123"
$databaseName = "WideWorldImporters"

Write-Host "Restoring Microsoft Sample Database to SQL Server 2025..." -ForegroundColor Cyan
Write-Host ""

# Check if container is running
$containerStatus = docker ps --filter "name=sqlserver2025" --format "{{.Status}}" 2>$null
if (-not $containerStatus) {
    Write-Host "Error: SQL Server 2025 container is not running!" -ForegroundColor Red
    Write-Host "Please start it first with: docker-compose up -d sqlserver2025" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ SQL Server container is running" -ForegroundColor Green
Write-Host ""

# Download WideWorldImporters sample database
$bakUrl = "https://github.com/Microsoft/sql-server-samples/releases/download/wide-world-importers-v1.0/WideWorldImporters-Full.bak"
$bakFile = "$ProjectRoot\WideWorldImporters-Full.bak"
$bakFileInContainer = "/var/opt/mssql/backup/WideWorldImporters-Full.bak"

Write-Host "Downloading WideWorldImporters sample database..." -ForegroundColor Yellow
Write-Host "This may take a few minutes (file is ~600MB)..." -ForegroundColor Yellow

try {
    # Create backup directory in container
    docker exec sqlserver2025 mkdir -p /var/opt/mssql/backup 2>$null
    
    # Download the file
    if (-not (Test-Path $bakFile)) {
        Write-Host "Downloading from: $bakUrl" -ForegroundColor Cyan
        Invoke-WebRequest -Uri $bakUrl -OutFile $bakFile -UseBasicParsing
        Write-Host "✓ Download complete" -ForegroundColor Green
    } else {
        Write-Host "✓ Backup file already exists, skipping download" -ForegroundColor Green
    }
    
    # Copy file into container
    Write-Host ""
    Write-Host "Copying backup file into container..." -ForegroundColor Yellow
    # Use forward slashes for container paths (works on both Windows and Unix)
    $bakFileNormalized = $bakFile -replace '\\', '/'
    docker cp $bakFileNormalized "sqlserver2025:$bakFileInContainer"
    Write-Host "✓ File copied to container" -ForegroundColor Green
    
} catch {
    Write-Host ""
    Write-Host "Error downloading or copying backup file: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternative: You can manually download the file and restore it:" -ForegroundColor Yellow
    Write-Host "1. Download from: $bakUrl" -ForegroundColor Yellow
    Write-Host "2. Copy to container: docker cp WideWorldImporters-Full.bak sqlserver2025:$bakFileInContainer" -ForegroundColor Yellow
    Write-Host "3. Then run this script again" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Restoring database..." -ForegroundColor Yellow

# SQL script to restore the database
$restoreScript = @"
USE [master]
GO

-- Drop database if it exists
IF EXISTS (SELECT name FROM sys.databases WHERE name = N'$databaseName')
BEGIN
    ALTER DATABASE [$databaseName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$databaseName];
END
GO

-- Restore the database
RESTORE DATABASE [$databaseName]
FROM DISK = N'$bakFileInContainer'
WITH 
    MOVE 'WWI_Primary' TO '/var/opt/mssql/data/${databaseName}.mdf',
    MOVE 'WWI_UserData' TO '/var/opt/mssql/data/${databaseName}_UserData.ndf',
    MOVE 'WWI_Log' TO '/var/opt/mssql/data/${databaseName}_Log.ldf',
    MOVE 'WWI_InMemory_Data_1' TO '/var/opt/mssql/data/${databaseName}_InMemory_Data_1',
    REPLACE,
    STATS = 10
GO

-- Verify the database was restored
SELECT name, state_desc, recovery_model_desc 
FROM sys.databases 
WHERE name = N'$databaseName'
GO
"@

# Write script to temp file
$tempScript = [System.IO.Path]::GetTempFileName() + ".sql"
$restoreScript | Out-File -FilePath $tempScript -Encoding UTF8
$tempScriptInContainer = "/tmp/restore-database.sql"

try {
    # Copy SQL script into container
    Write-Host "Preparing restore script..." -ForegroundColor Yellow
    $tempScriptNormalized = $tempScript -replace '\\', '/'
    docker cp $tempScriptNormalized "sqlserver2025:$tempScriptInContainer"
    
    # Execute restore using sqlcmd in container
    # SQL Server 2025 uses mssql-tools18, and we need -C to trust the server certificate
    Write-Host "Executing restore (this may take a few minutes)..." -ForegroundColor Yellow
    docker exec sqlserver2025 /opt/mssql-tools18/bin/sqlcmd -S localhost -U $username -P $password -C -i $tempScriptInContainer
    
    Write-Host ""
    Write-Host "✓ Database restored successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Database: $databaseName" -ForegroundColor Cyan
    Write-Host "Server: $server" -ForegroundColor Cyan
    Write-Host "Username: $username" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "You can now connect to the database using:" -ForegroundColor Yellow
    Write-Host "  Server: $server" -ForegroundColor White
    Write-Host "  Database: $databaseName" -ForegroundColor White
    Write-Host "  Username: $username" -ForegroundColor White
    Write-Host "  Password: $password" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "Error restoring database: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "You can try restoring manually:" -ForegroundColor Yellow
    Write-Host "1. Connect to SQL Server: $server" -ForegroundColor Yellow
    Write-Host "2. Use SQL Server Management Studio or Azure Data Studio" -ForegroundColor Yellow
    Write-Host "3. Restore from: $bakFileInContainer" -ForegroundColor Yellow
    exit 1
} finally {
    # Clean up temp files
    if (Test-Path $tempScript) {
        Remove-Item $tempScript -Force
    }
    # Clean up script in container
    docker exec sqlserver2025 rm -f $tempScriptInContainer 2>$null
}

