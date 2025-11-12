#!/bin/bash

# Start SQL Server 2025 Docker container
# Usage: ./start-sqlserver.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "Starting SQL Server 2025 Docker container..."
docker-compose up -d sqlserver2025

echo ""
echo "Waiting for SQL Server to be ready..."
echo "This may take 30-60 seconds on first start..."

# Wait for health check
max_attempts=60
attempt=0
while [ $attempt -lt $max_attempts ]; do
    health=$(docker inspect --format='{{.State.Health.Status}}' sqlserver2025 2>/dev/null || echo "starting")
    if [ "$health" = "healthy" ]; then
        echo ""
        echo "✓ SQL Server 2025 is ready!"
        echo ""
        echo "Connection details:"
        echo "  Server: localhost,1433"
        echo "  Username: sa"
        echo "  Password: YourStrong!Passw0rd123"
        echo ""
        exit 0
    fi
    attempt=$((attempt + 1))
    echo -n "."
    sleep 2
done

echo ""
echo "⚠ SQL Server container is running but may not be fully ready yet."
echo "Check status with: docker ps"
echo ""
echo "Connection details:"
echo "  Server: localhost,1433"
echo "  Username: sa"
echo "  Password: YourStrong!Passw0rd123"
echo ""

