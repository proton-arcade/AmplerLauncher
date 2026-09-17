#!/usr/bin/env bash
# Start the local EaglerXServer so the bundled clients have somewhere to
# connect for multiplayer with no internet involved.
set -euo pipefail
cd "$(dirname "$0")"

JAR="EaglerXServer.jar"

if [ ! -f "$JAR" ]; then
    echo "$JAR not found. Run ./fetch-server.sh first (needs internet once),"
    echo "or build it from eaglerxserver-1.1.1-src.zip."
    exit 1
fi

if ! command -v java >/dev/null 2>&1; then
    echo "java not found on PATH. Install Java 8 or newer."
    exit 1
fi

echo "Starting EaglerXServer on port 25565 (LAN)..."
echo "In-game: Multiplayer > Add Server > ws://<your-lan-ip>:8081/"
exec java -Xmx2G -jar "$JAR"
