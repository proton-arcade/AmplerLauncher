#!/usr/bin/env bash
# One-time setup: fetch the prebuilt EaglerXServer.jar.
#
# The launcher and all five game clients are 100% offline and need nothing from
# here. This is only for playing *multiplayer* on your own machine/LAN without
# touching the public Eaglercraft websocket relays.
#
# This step needs an internet connection once. After it runs, the server is
# fully local.
#
# Source: https://github.com/lax1dude/eaglerxserver/releases/tag/v1.1.1
set -euo pipefail
cd "$(dirname "$0")"

VERSION="v1.1.1"
JAR="EaglerXServer.jar"
URL="https://github.com/lax1dude/eaglerxserver/releases/download/${VERSION}/${JAR}"

if [ -f "$JAR" ]; then
    echo "Already present: $JAR"
    exit 0
fi

echo "Downloading ${JAR} (${VERSION})..."
if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 -o "$JAR" "$URL"
elif command -v wget >/dev/null 2>&1; then
    wget -O "$JAR" "$URL"
else
    echo "Need curl or wget. Or download manually from:"
    echo "  $URL"
    exit 1
fi

echo
echo "Done. Now run:  ./start-server.sh"
echo "Requires Java 8+ (java -version)."
