#!/bin/bash
# Build script for publishing backend as self-contained executables for all platforms

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend/SQLStressTest.Service"
EXTENSION_DIR="$PROJECT_ROOT/extension"
RESOURCES_DIR="$EXTENSION_DIR/resources/backend"

echo "=========================================="
echo "Building Backend for All Platforms"
echo "=========================================="
echo ""

# Create resources directory structure
mkdir -p "$RESOURCES_DIR/win32-x64"
mkdir -p "$RESOURCES_DIR/darwin-x64"
mkdir -p "$RESOURCES_DIR/darwin-arm64"
mkdir -p "$RESOURCES_DIR/linux-x64"

cd "$BACKEND_DIR"

# Function to publish for a specific RID
publish_for_rid() {
    local rid=$1
    local output_dir=$2
    local platform_name=$3
    
    echo "Publishing for $platform_name ($rid)..."
    
    dotnet publish \
        -c Release \
        -r "$rid" \
        --self-contained true \
        -p:PublishSingleFile=true \
        -p:PublishTrimmed=true \
        -p:TrimMode=link \
        -p:IncludeNativeLibrariesForSelfExtract=true \
        -p:DebugType=none \
        -p:DebugSymbols=false \
        -o "$output_dir"
    
    # On Unix systems, ensure executable has proper permissions
    if [[ "$rid" != win* ]]; then
        chmod +x "$output_dir/SQLStressTest.Service" 2>/dev/null || true
    fi
    
    echo "✓ Published $platform_name"
    echo ""
}

# Publish for each platform
publish_for_rid "win-x64" "$RESOURCES_DIR/win32-x64" "Windows x64"
publish_for_rid "osx-x64" "$RESOURCES_DIR/darwin-x64" "macOS x64"
publish_for_rid "osx-arm64" "$RESOURCES_DIR/darwin-arm64" "macOS ARM64"
publish_for_rid "linux-x64" "$RESOURCES_DIR/linux-x64" "Linux x64"

echo "=========================================="
echo "Backend build complete!"
echo "=========================================="
echo ""
echo "Executables are located in:"
echo "  $RESOURCES_DIR"
echo ""

