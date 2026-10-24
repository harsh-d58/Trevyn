"""Browser check against a local practice site; discovery must never submit its form."""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import pytest
from playwright.async_api import Error
from trevyn_runner.discover import discover


@pytest.mark.asyncio
async def test_discovery_maps_login_and_never_posts():
    posts: list[str] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/":
                body = '<html><title>Home</title><h1>Welcome</h1><a href="/login">Log in</a></html>'
            else:
                body = ('<html><title>Login</title><h1>Sign in</h1>'
                        '<form method="post" action="/submit"><label for="user">Username</label>'
                        '<input id="user" name="user"><label for="pass">Password</label>'
                        '<input id="pass" name="pass" type="password"><button>Sign in</button></form></html>')
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(body.encode())

        def do_POST(self):
            posts.append(self.path)
            self.send_response(200)
            self.end_headers()

        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        try:
            site = await discover(f"http://127.0.0.1:{server.server_port}/", ["127.0.0.1"])
        except Error as exc:
            if "Executable doesn't exist" in str(exc):
                pytest.skip("Playwright browser is not installed")
            raise
        assert [p.path for p in site.pages] == ["/", "/login"]
        login = site.pages[1]
        assert login.has_login_form
        assert {f["label"] for f in login.fields} == {"Username", "Password"}
        assert "Sign in" in login.buttons
        assert not posts
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
