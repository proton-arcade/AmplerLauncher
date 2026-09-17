# Local multiplayer server

Singleplayer in the bundled clients needs nothing from this folder — it already
works fully offline.

This is only for **multiplayer without the internet**. The stock clients reach
multiplayer through public websocket relays (`wss://relay.deev.is/` and
friends). Offline you host your own relay and server instead, using
[EaglerXServer](https://github.com/lax1dude/eaglerxserver) v1.1.1.

## What is in here

| File | Purpose |
|---|---|
| `eaglerxserver-1.1.1-src.zip` | EaglerXServer v1.1.1 source archive |
| `fetch-server.sh` / `fetch-server.bat` | One-time download of the prebuilt `EaglerXServer.jar` |
| `start-server.sh` / `start-server.bat` | Start the server |

## Setup

**1. Get the jar** (needs internet exactly once):

```bash
./fetch-server.sh        # or fetch-server.bat on Windows
```

**2. Install Java 8 or newer**, then start it:

```bash
./start-server.sh        # or start-server.bat on Windows
```

The first run writes `eula.txt`. Open it, set `eula=true`, and start again.

**3. Connect from the game.** In Eaglercraft: *Multiplayer → Add Server* and
use the websocket address the server prints on startup — on your own machine
that is `ws://127.0.0.1:8081/`, from another device on your LAN
`ws://<your-lan-ip>:8081/`.

## Building from source instead

If you would rather not download a binary:

```bash
unzip eaglerxserver-1.1.1-src.zip
cd eaglerxserver-1.1.1
./build_all.sh           # build_all.bat on Windows
```

The jar lands in the build output directory. This needs Gradle and network
access to Maven Central on the first build.

## Why the jar is not committed

GitHub serves release attachments from `release-assets.githubusercontent.com`.
That host is not reachable from the environment this repository was assembled
in, so the prebuilt jar could not be vendored here — only the source archive
was. `fetch-server.sh` fetches it in one step when you have a connection.
