# SQL Stress Test VS Code Extension

A VS Code extension for SQL Server stress testing and monitoring with real-time performance graphs and query execution capabilities.

## Architecture

- **Frontend**: VS Code Extension (TypeScript)
- **Backend**: ASP.NET Core Web API (C#) with SignalR WebSocket support
- **Communication**: WebSocket (primary) + HTTP REST API (secondary)
- **Database**: SQL Server via Microsoft.Data.SqlClient

## Features

1. **SQL Server Explorer** - Tree view for managing SQL Server connections with persistence
2. **Performance Graph** - Real-time CPU% monitoring with Chart.js visualization
3. **SQL Query Editor** - Monaco editor with query execution and result display
4. **WebSocket Heartbeat** - Status bar indicator showing backend connection status

## Development Setup

### Prerequisites

- Docker Desktop (for Dev Containers)
- VS Code with Dev Containers extension

### Getting Started

1. Open the project in VS Code
2. When prompted, click "Reopen in Container" or run: `Dev Containers: Reopen in Container`
3. The Dev Container will automatically:
   - Set up Node.js 20+ for extension development
   - Set up .NET 8 SDK for backend development
   - Install dependencies

### Running the Backend

```bash
cd backend/SQLStressTest.Service
dotnet run
```

The backend will start on:
- HTTP: http://localhost:5000
- HTTPS: https://localhost:5001
- WebSocket: ws://localhost:5000/sqlhub

### Building the Extension

```bash
cd extension
npm install
npm run compile
```

### Testing

#### Extension Tests

```bash
cd extension
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

#### Backend Unit Tests

```bash
cd backend
dotnet test SQLStressTest.Service.Tests
```

#### Backend Integration Tests

```bash
cd backend
dotnet test SQLStressTest.Service.IntegrationTests
```

## Project Structure

```
SQLStressTest/
├── .devcontainer/          # Dev Container configuration
├── extension/              # VS Code extension (TypeScript)
│   ├── src/
│   │   ├── extension.ts   # Main entry point
│   │   ├── panes/         # Three main panes
│   │   ├── services/      # WebSocket, HTTP, Storage
│   │   └── __tests__/     # Unit tests
│   └── package.json
└── backend/               # C# ASP.NET Core service
    ├── SQLStressTest.Service/
    ├── SQLStressTest.Service.Tests/
    └── SQLStressTest.Service.IntegrationTests/
```

## Configuration

### Extension Settings

Configure the backend URL in VS Code settings:

```json
{
  "sqlStressTest.backendUrl": "http://localhost:5000"
}
```

### Backend Configuration

Edit `backend/SQLStressTest.Service/appsettings.json` to configure ports and logging.

## Testing Strategy

- **Frontend**: Vitest with 80%+ coverage requirement
- **Backend Unit**: xUnit with Moq for mocking
- **Backend Integration**: TestServer for end-to-end API and WebSocket testing
- All code follows SOLID principles with dependency injection

## License

MIT

