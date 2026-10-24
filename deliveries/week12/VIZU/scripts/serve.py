"""Serve this project's current UI, independent of cwd, old servers or browser cache."""
from __future__ import annotations
import argparse
import hashlib
import hmac
import json
import os
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
ROOT = APP_DIR.parents[2]
APP_URL = "/" + APP_DIR.relative_to(ROOT).as_posix() + "/"
APP = "vizu-us-accidents"
LAYOUT = "week12-one-screen-brush"
VERSION_FILES = ["index.html", "css/style.css", "js/config.js", "js/filter-core.js", "js/data-core.js", "js/filters.js", "js/charts.js", "js/geomap.js", "js/timeline.js", "js/app.js", "scripts/serve.py"]


def version():
    digest = hashlib.sha256()
    for filename in VERSION_FILES:
        digest.update(filename.encode())
        digest.update((APP_DIR / filename).read_bytes())
    return digest.hexdigest()[:16]


def metadata():
    return {"app": APP, "layout": LAYOUT, "root": str(ROOT), "version": version()}


def current_html():
    build = version()
    html = (APP_DIR / "index.html").read_text(encoding="utf-8")
    def asset(match):
        path = urllib.parse.urlsplit(match[2]).path
        return f'{match[1]}{path}?v={build}{match[3]}'
    html = re.sub(r'((?:src|href)=")((?:js|css)/[^"\s]+)(")', asset, html)
    html = html.replace("</head>", f'<meta name="vizzu-build" content="{build}">\n<meta name="vizzu-layout" content="{LAYOUT}">\n</head>')
    return html.encode("utf-8")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # File edits must be visible on reload; the app still uses its bounded LRU.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def special_response(self, head=False):
        path = urllib.parse.urlsplit(self.path).path
        if path == "/__vizzu_server__":
            body, mime = json.dumps(metadata()).encode("utf-8"), "application/json; charset=utf-8"
        elif path in ("/", "/index.html", APP_URL[:-1]):
            self.send_response(302)
            self.send_header("Location", APP_URL)
            self.end_headers()
            return True
        elif path in (APP_URL, APP_URL + "index.html"):
            body, mime = current_html(), "text/html; charset=utf-8"
        else:
            return False
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)
        return True

    def do_GET(self):
        if not self.special_response():
            super().do_GET()

    def do_HEAD(self):
        if not self.special_response(head=True):
            super().do_HEAD()

    def do_POST(self):
        # Only enabled for an owned automated test process; normal launches expose
        # no shutdown control. This lets the BAT test clean up its own Python child.
        expected = os.environ.get("VIZZU_TEST_SHUTDOWN_TOKEN", "")
        supplied = self.headers.get("X-Vizzu-Test-Token", "")
        if self.path == "/__vizzu_test_shutdown__" and expected and hmac.compare_digest(expected, supplied):
            self.send_response(204)
            self.end_headers()
            threading.Thread(target=self.server.shutdown, daemon=True).start()
        else:
            self.send_error(405)


def existing_server(port):
    if not port:
        return None
    # Use a direct loopback connection, unaffected by system HTTP proxy settings.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(f"http://127.0.0.1:{port}/__vizzu_server__", timeout=0.5) as response:
            data = json.load(response)
        if data.get("app") == APP and data.get("layout") == LAYOUT and Path(data.get("root", "")).resolve() == ROOT:
            return data
    except (OSError, urllib.error.URLError, ValueError):
        pass
    return None


def start(port, no_open=False):
    if not 0 <= port <= 65535:
        raise ValueError("Puerto fuera de rango")
    own_server = existing_server(port)
    if own_server:
        url = f"http://127.0.0.1:{port}{APP_URL}?v={version()}"
        print("El servidor de esta carpeta ya esta activo. Se abrira la version actual.", flush=True)
        print(f"VIZZU_URL={url}", flush=True)
        if not no_open:
            webbrowser.open(url)
        return
    server = None
    candidates = [0] if port == 0 else range(port, min(port + 20, 65536))
    for candidate in candidates:
        try:
            server = ThreadingHTTPServer(("127.0.0.1", candidate), Handler)
            break
        except OSError:
            continue
    if server is None:
        raise RuntimeError("No se pudo abrir un puerto local. Cierra una ventana anterior del servidor y vuelve a intentar.")
    actual_port = server.server_address[1]
    if port and actual_port != port:
        print(f"El puerto {port} esta ocupado; esta version usara el {actual_port}.", flush=True)
    url = f"http://127.0.0.1:{actual_port}{APP_URL}?v={version()}"
    print(f"Carpeta: {ROOT}", flush=True)
    print("VISTA ACTUAL: semana 12 · una pantalla, brush temporal, T1-T5", flush=True)
    print(f"VIZZU_URL={url}", flush=True)
    print("Mantén esta ventana abierta. Ctrl+C detiene este servidor.", flush=True)
    if not no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()
    start(args.port, args.no_open)
