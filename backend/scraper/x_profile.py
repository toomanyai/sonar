"""One-time interactive X (Twitter) login.

Run this ONCE. It opens a real Chromium window; log into your X account by hand,
then press Enter in the terminal. crawl4ai saves the session (cookies/localStorage)
to a named profile that every later scrape reuses — no password is ever stored in
code.

    python -m scraper.x_profile

The profile name comes from env X_PROFILE_NAME (default: x-stock-kol).
"""
from __future__ import annotations

import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

PROFILE_NAME = os.getenv("X_PROFILE_NAME", "x-stock-kol")


async def main() -> None:
    from crawl4ai import BrowserProfiler

    profiler = BrowserProfiler()
    print(f"Creating/opening X login profile: {PROFILE_NAME}")
    print("A browser window will open. Log into https://x.com, then return here.")
    path = await profiler.create_profile(profile_name=PROFILE_NAME)
    print(f"\nProfile saved at: {path}")
    print("You can now run the scraper / pipeline.")


if __name__ == "__main__":
    asyncio.run(main())
