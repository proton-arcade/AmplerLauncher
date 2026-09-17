#!/usr/bin/env bash
# Ampler Launcher - offline start (macOS double-clickable).
# Same as start-offline.sh; the .command extension is what makes Finder
# run it in Terminal instead of opening it in a text editor.
set -euo pipefail
cd "$(dirname "$0")"
exec ./start-offline.sh "${1:-8080}"
