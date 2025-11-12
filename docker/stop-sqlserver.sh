#!/bin/bash

# Stop SQL Server 2025 Docker container
# Usage: ./stop-sqlserver.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "Stopping SQL Server 2025 Docker container..."
docker-compose stop sqlserver2025

echo "✓ SQL Server 2025 stopped"

