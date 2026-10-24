"""SSRF guard (blueprint Step 7): refuse targets that resolve to private, loopback, link-local or metadata addresses."""
from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlparse

BLOCKED_NETS = [ipaddress.ip_network(n) for n in (
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16", "100.64.0.0/10", "0.0.0.0/8",
    "::1/128", "fc00::/7", "fe80::/10")]


def allow_private() -> bool:
    return os.getenv("ALLOW_PRIVATE_TARGETS") == "1"


def check_url(url: str, resolve=socket.getaddrinfo) -> str | None:
    """None when the target is acceptable, otherwise a message naming the problem."""
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        return "Enter a full http(s) URL"
    if allow_private():
        return None
    try:
        addrs = {ipaddress.ip_address(a[4][0]) for a in resolve(u.hostname, u.port or (443 if u.scheme == "https" else 80))}
    except (socket.gaierror, ValueError):
        return f"Could not resolve {u.hostname}"
    for ip in addrs:
        if any(ip in n for n in BLOCKED_NETS):
            return f"{u.hostname} resolves to {ip}, a private or internal address"
    return None
