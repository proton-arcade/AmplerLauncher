#!/usr/bin/env bash
# Ampler Launcher - offline start (Linux / macOS)
# Needs python3. No internet connection is used.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8080}"

if ! command -v python3 >/dev/null 2>&1; then
    echo
    echo "  python3 was not found on PATH."
    echo "  Install Python 3 and run this file again."
    echo
    exit 1
fi

echo "Starting the Ampler Launcher offline server on port ${PORT}..."
exec python3 tools/serve.py --port "${PORT}"
