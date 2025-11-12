# SQL Server 2025 Docker Setup

This directory contains Docker configuration for running SQL Server 2025 for development and testing.

## Quick Start

### Start SQL Server 2025

```bash
docker-compose up -d
```

### Stop SQL Server 2025

```bash
docker-compose down
```

### Stop and Remove Data Volumes

```bash
docker-compose down -v
```

## Connection Details

Once the container is running, you can connect using:

- **Server**: `localhost,1433` or `localhost`
- **Port**: `1433`
- **Authentication**: SQL Server Authentication
- **Username**: `sa`
- **Password**: `YourStrong!Passw0rd123`

### For Integrated Security (Windows Authentication)

If you're on Windows and want to use Windows Authentication, you'll need to configure the container to allow Windows Authentication. However, note that SQL Server in Docker typically uses SQL Authentication by default.

## Using with SQL Stress Test Extension

### Connection Configuration

When adding a new SQL Server connection in the extension:

1. **Name**: `SQL Server 2025 Docker`
2. **Server**: `localhost` or `localhost,1433`
3. **Port**: `1433` (default, can be omitted)
4. **Database**: `master` (or leave empty for default)
5. **Authentication**: SQL Server Authentication
6. **Username**: `sa`
7. **Password**: `YourStrong!Passw0rd123`

### Test Connection

Use the "Test Connection" button in the connection dialog to verify the connection works before saving.

## Security Note

⚠️ **Important**: The default password in `docker-compose.yml` is for development only. 

For production or shared environments:
1. Change the `MSSQL_SA_PASSWORD` environment variable
2. Update the healthcheck password to match
3. Consider using Docker secrets or environment files for sensitive data

## Troubleshooting

### Container won't start

Check logs:
```bash
docker-compose logs sqlserver2025
```

### Connection refused

1. Verify the container is running: `docker ps`
2. Check if port 1433 is already in use: `lsof -i :1433` (macOS/Linux) or `netstat -ano | findstr :1433` (Windows)
3. If port is in use, change the port mapping in `docker-compose.yml`:
   ```yaml
   ports:
     - "1434:1433"  # Use 1434 on host instead
   ```

### Password complexity requirements

SQL Server requires strong passwords. The default password meets these requirements:
- At least 8 characters
- Contains uppercase, lowercase, numbers, and special characters

## Data Persistence

Data is stored in a Docker volume named `sqlserver2025_data`. This means:
- Data persists even if you stop/remove the container
- To start fresh, use `docker-compose down -v` to remove the volume

## Health Check

The container includes a health check that verifies SQL Server is ready to accept connections. You can check the health status:

```bash
docker ps
```

Look for the "STATUS" column - it should show "healthy" when ready.

## Additional Resources

- [SQL Server 2025 Documentation](https://learn.microsoft.com/en-us/sql/sql-server/)
- [SQL Server on Docker](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-docker-container-configure)

