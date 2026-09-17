#!/usr/bin/env python3
"""
Ampler Launcher - OPTIONAL local server.

You do not need this to play. The bundled builds are the official Eaglercraft
"offline download" single files and are built to be opened directly, so
double-clicking index.html is the normal way to run the launcher. Nothing here
is a prerequisite.

Two cases where serving over http:// genuinely helps:

  1. SharedArrayBuffer. These headers

         Cross-Origin-Opener-Policy:   same-origin
         Cross-Origin-Embedder-Policy: require-corp

     are the only way a page can get SharedArrayBuffer, which the WASM-GC
     builds use when available. Every asset here is same-origin, so
     require-corp is safe to enable.

  2. Playing from another device on your LAN.

Still fully offline either way - nothing leaves the machine.

Usage
-----
    python3 tools/serve.py [--port 8080] [--host 0.0.0.0] [--no-isolation]

Dependencies: the Python 3 standard library. Nothing to install.
"""

import argparse
import functools
import http.server
import os
import socket
import socketserver
import sys

def _find_root():
    # Everything but README.md and index.html sits under app/, so walk up from
    # this file until we reach the directory that holds the launcher page.
    d = os.path.dirname(os.path.abspath(__file__))
    while d != os.path.dirname(d):
        if (os.path.exists(os.path.join(d, "index.html"))
                and os.path.exists(os.path.join(d, "README.md"))):
            return d
        d = os.path.dirname(d)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# The folder that contains index.html (the repo root).
ROOT = _find_root()

EXTRA_MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".epk": "application/octet-stream",
    ".epw": "application/octet-stream",
    ".wasm": "application/wasm",
    ".map": "application/json; charset=utf-8",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static file handler with isolation headers and correct MIME types."""

    isolation = True
    server_version = "AmplerOffline/2.0"

    def end_headers(self):
        if self.isolation:
            self.send_header("Cross-Origin-Opener-Policy", "same-origin")
            self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        # The game builds are 15-31 MB each; never let a browser cache a stale
        # one after an update.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        return EXTRA_MIME.get(ext, super().guess_type(path))

    def log_message(self, fmt, *args):
        sys.stdout.write("  %s\n" % (fmt % args))
        sys.stdout.flush()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def local_ip():
    """Best-effort LAN address, so other devices can join a local server."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    parser = argparse.ArgumentParser(description="Serve the Ampler Launcher offline.")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--no-isolation", action="store_true",
                        help="do not send COOP/COEP (disables SharedArrayBuffer)")
    parser.add_argument("--no-browser", action="store_true",
                        help="do not try to open a browser window")
    args = parser.parse_args()

    Handler.isolation = not args.no_isolation
    handler = functools.partial(Handler, directory=ROOT)

    try:
        httpd = Server((args.host, args.port), handler)
    except OSError as exc:
        print("Could not bind %s:%d - %s" % (args.host, args.port, exc))
        print("Try a different port:  python3 tools/serve.py --port 8090")
        return 1

    print("=" * 62)
    print(" Ampler Launcher - offline server")
    print("=" * 62)
    print("  Root         : %s" % ROOT)
    print("  Launcher     : http://localhost:%d/" % args.port)
    print("  From another device on your LAN:")
    print("                 http://%s:%d/" % (local_ip(), args.port))
    print("  Isolation hdrs: %s" % ("ON (SharedArrayBuffer enabled)"
                                      if Handler.isolation else "OFF"))
    print("  No internet connection is required or used.")
    print("  Press Ctrl+C to stop.")
    print("=" * 62)
    sys.stdout.flush()

    if not args.no_browser:
        try:
            import webbrowser
            webbrowser.open("http://localhost:%d/" % args.port)
        except Exception:
            pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
