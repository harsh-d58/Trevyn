"""Launch the configured browser, using installed Chrome when Playwright's Chromium bundle is absent."""
from __future__ import annotations

import os

from playwright.async_api import Error


async def launch(pw, browser_name: str = "chromium", *, headless: bool = True):
    channel = os.getenv("PLAYWRIGHT_CHANNEL")
    if channel:
        return await getattr(pw, browser_name).launch(channel=channel, headless=headless)
    try:
        return await getattr(pw, browser_name).launch(headless=headless)
    except Error as exc:
        if browser_name != "chromium" or "Executable doesn't exist" not in str(exc):
            raise
        try:
            return await pw.chromium.launch(channel="chrome", headless=headless)
        except Error:
            raise exc
