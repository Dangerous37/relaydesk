import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parent / "docs"
with http.server.ThreadingHTTPServer(("127.0.0.1",0), functools.partial(http.server.SimpleHTTPRequestHandler,directory=root)) as server:
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(channel="chrome")
            page=browser.new_page()
            page.goto(f"http://127.0.0.1:{server.server_port}/")
            for guard, effects in [(True,"01"),(False,"02")]:
                page.get_by_label("Receiver deduplication").set_checked(guard)
                page.get_by_role("button",name="Queue booking").click()
                page.get_by_role("button",name="Deliver & inject crash").click()
                expect(page.locator("#worker")).to_contain_text("Crashed")
                page.reload()
                page.get_by_role("button",name="Restart worker & retry").click()
                expect(page.locator("#worker")).to_have_text("Acknowledged")
                expect(page.locator("#effects")).to_have_text(effects)
                expect(page.locator("#trace li")).to_have_count(5)
                page.set_viewport_size({"width":390,"height":844})
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                page.get_by_role("button",name="New experiment").click()
            browser.close()
            print("Both receiver policies passed after reload; mobile layout fits.")
    finally:
        server.shutdown()
