# F5 Debugging Setup

## Status: ✅ Ready

- Extension compiled: YES
- Backend executable: YES (27MB)
- Launch configuration: Created

## How to Debug with F5

1. **Open the project root** (`/Users/dave/repos/SQLStressTest`) in VS Code
2. **Press F5** or go to Run → Start Debugging
3. A new VS Code window will open (Extension Development Host)
4. The extension will activate automatically
5. Check the logs:
   - **Developer Console**: `Cmd+Shift+P` → "Developer: Toggle Developer Tools" → Console tab
   - **Output Panel**: `Cmd+Shift+U` → Select "SQL Stress Test - Extension"
   - **Log Files**: `/Users/dave/repos/SQLStressTest/logs/`

## What Happens on F5

1. Pre-launch task compiles the extension TypeScript
2. VS Code launches Extension Development Host
3. Extension activates (onStartupFinished event)
4. BackendServiceManager starts the backend executable
5. Backend finds an available port (5000-5100)
6. WebSocket client connects to backend
7. Status bar shows connection status

## Troubleshooting

If backend fails to start:
- Check Developer Console for `[BackendServiceManager]` messages
- Check Output Panel for detailed error logs
- Verify backend executable exists: `extension/resources/backend/darwin-arm64/SQLStressTest.Service`
- Check logs directory: `logs/backend-*.log`

## Rebuilding Backend

If you need to rebuild the backend executable:
```bash
cd extension
npm run build:backend
```

This builds for all platforms (Windows, macOS x64, macOS ARM64, Linux).
