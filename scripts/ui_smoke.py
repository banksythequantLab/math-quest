"""Headless UI smoke test against a running `wrangler dev` (http://127.0.0.1:8787).
Picks a hero, starts, answers one problem correctly, screenshots each screen to scripts/_out/.
Usage: python scripts/ui_smoke.py
"""
import re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8787"
OUT = Path(__file__).resolve().parent / "_out"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

def solve(text: str) -> str:
    t = text.replace(" = ?", "").replace("×", "*").replace("÷", "/")
    if "/" in t and "+" in t:                      # fraction band: a/d + b/d
        (a, d), (b, _) = [map(int, p.strip().split("/")) for p in t.split("+")]
        from math import gcd; n = a + b; g = gcd(n, d); return f"{n//g}/{d//g}"
    return str(int(eval(t)))                        # trusted, engine-generated text only

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EDGE, headless=True)
    pg = b.new_page(viewport={"width": 1000, "height": 900})
    errors = []; pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.goto(BASE); pg.wait_for_selector(".hero")
    pg.fill("#kid", "Ava"); pg.click('.hero[data-id="ember"]'); pg.screenshot(path=OUT / "ui_1_pick.png")
    pg.click("#startBtn"); pg.wait_for_selector("#play.on", timeout=20000); pg.wait_for_timeout(2500)
    pg.screenshot(path=OUT / "ui_2_encounter.png")
    prob = pg.text_content("#problem"); ans = solve(prob); print("problem:", prob, "-> answering", ans)
    pg.fill("#answer", ans); pg.click("#goBtn"); pg.wait_for_selector(".feedback .good", timeout=15000); pg.wait_for_timeout(300)
    pg.screenshot(path=OUT / "ui_3_correct.png")
    assert "Correct" in pg.text_content("#feedback")
    pg.wait_for_timeout(2500); print("next problem:", pg.text_content("#problem"), "| streak", pg.text_content("#streak"))
    print("JS errors:", errors or "none"); b.close()
    sys.exit(1 if errors else 0)
