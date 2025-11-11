# Log Files Location and Contents

## Log File Locations

All logs are written to: **`/Users/dave/repos/SQLStressTest/logs/`**

### Extension Log File
- **File**: `sql-stress-test-extension-YYYY-MM-DD.log`
- **Contains**: All extension logs (activation, backend startup, errors, etc.)
- **Format**: `[TIMESTAMP] [LEVEL] MESSAGE | DATA`

### Backend Log File  
- **File**: `backend-YYYYMMDD-HHMMSS.log`
- **Contains**: All backend service logs (startup, requests, errors, etc.)
- **Format**: `[TIMESTAMP] [LEVEL] MESSAGE`

## What Gets Logged

### Extension Log File Includes:
✅ All `logger.info()`, `logger.log()`, `logger.error()`, `logger.warn()` calls
✅ Extension activation messages
✅ BackendServiceManager startup attempts
✅ Backend executable path lookups
✅ Port discovery and assignment
✅ Backend process stdout/stderr (full output)
✅ Backend process exit codes and signals
✅ Error messages with stack traces
✅ WebSocket connection attempts
✅ All console.log/error/warn messages (via logger)

### Backend Log File Includes:
✅ Backend service startup
✅ HTTP requests and responses
✅ CORS policy checks
✅ SQL query executions
✅ Performance data streaming
✅ All backend application logs

## Viewing Logs

### In VS Code:
1. **Output Panel**: `Cmd+Shift+U` → Select "SQL Stress Test - Extension"
2. **Developer Console**: `Cmd+Shift+P` → "Developer: Toggle Developer Tools" → Console tab
3. **Log Files**: Open files in `logs/` directory

### From Terminal:
```bash
# View extension log
tail -f logs/sql-stress-test-extension-$(date +%Y-%m-%d).log

# View latest backend log
ls -t logs/backend-*.log | head -1 | xargs tail -f

# Search for errors
grep -i error logs/*.log

# Search for backend startup
grep -i "starting\|backend" logs/*.log
```

## Log File Format

Each log entry includes:
- **Timestamp**: ISO 8601 format with milliseconds
- **Level**: LOG, INFO, WARN, ERROR
- **Message**: Human-readable message
- **Data**: Optional JSON data (formatted with 2-space indentation)

Example:
```
[2025-11-11T16:58:00.123Z] [INFO] Extension activating...
[2025-11-11T16:58:00.124Z] [INFO] Log file location | {
  "path": "/Users/dave/repos/SQLStressTest/logs/sql-stress-test-extension-2025-11-11.log"
}
[2025-11-11T16:58:00.125Z] [INFO] BackendServiceManager.start() called
[2025-11-11T16:58:00.126Z] [INFO] Executable found | {
  "path": "/Users/dave/repos/SQLStressTest/extension/resources/backend/darwin-arm64/SQLStressTest.Service"
}
```

## Important Notes

- **All console output is also written to log files** via the Logger class
- **Backend stdout/stderr is captured** and written to extension log file
- **Full error details** including stack traces are logged
- **Log files are created automatically** in the project root `logs/` directory
- **Log files are rotated daily** (new file per day for extension, per execution for backend)
