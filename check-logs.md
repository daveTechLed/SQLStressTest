# How to Check Extension Logs

## 1. VS Code Developer Console (Most Important)
- Open VS Code
- Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
- Type "Developer: Toggle Developer Tools"
- Click on "Console" tab
- Look for messages starting with `[SQL Stress Test]` or `[BackendServiceManager]`

## 2. VS Code Output Panel
- Press `Cmd+Shift+U` (Mac) or `Ctrl+Shift+U` (Windows/Linux)
- Select "SQL Stress Test - Extension" from the dropdown
- Look for log messages

## 3. Extension Log Files
- Check: `/Users/dave/repos/SQLStressTest/logs/`
- Files: `sql-stress-test-extension-YYYY-MM-DD.log`

## 4. Backend Log Files (if backend starts)
- Check: `/Users/dave/repos/SQLStressTest/logs/`
- Files: `backend-YYYYMMDD-HHMMSS.log`

## What to Look For:
- `[SQL Stress Test] Extension activating...` - Extension is loading
- `[SQL Stress Test] Calling backendServiceManager.start()...` - About to start backend
- `[BackendServiceManager] start() method called` - Backend manager is running
- `[BackendServiceManager] Executable found:` - Found the backend executable
- Any ERROR messages
