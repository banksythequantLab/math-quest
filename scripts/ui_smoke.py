"""Headless UI smoke test against a running `wrangler dev` (http://127.0.0.1:8787).
Picks a hero, starts a quest, chooses 'fight', solves the roll, checks the next scene. Screenshots to scripts/_out/.
"""
import sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8787"; OUT = Path(__file__).resolve().parent / "_out"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

def solve(text: str) -> str:
    t = text.replace(" = ?", "").replace("×", "*").replace("÷", "/")
    if "/" in t and "+" in t:
        (a, d), (b, _) = [map(int, p.strip().split("/")) for p in t.split("+")]
        from math import gcd; n = a + b; g = gcd(n, d); return f"{n//g}/{d//g}"
    return str(int(eval(t)))  # engine-generated text only

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=EDGE, headless=True)
    pg = b.new_page(viewport={"width": 1000, "height": 980}); errors = []
    pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("response", lambda r: errors.append(f"{r.status} {r.url}") if r.status >= 400 and "/api/say" not in r.url else None)
    pg.goto(BASE); pg.wait_for_selector(".hero"); pg.fill("#kid", "Smoke" + str(int(time.time()) % 1000)); pg.click('.hero[data-id="ember"]')
    pg.click("#startBtn"); pg.wait_for_selector("#play.on", timeout=25000); pg.wait_for_selector(".choice", timeout=25000); pg.wait_for_timeout(1500)
    pg.screenshot(path=OUT / "ui_2_scene.png"); print("goal:", pg.text_content("#goal")); print("choices:", [c.text_content().strip()[:60] for c in pg.query_selector_all(".choice")])
    pg.click('.choice:nth-child(3)'); pg.wait_for_selector("#rollBox", state="visible", timeout=25000); pg.wait_for_timeout(600)
    prob = pg.text_content("#problem"); ans = solve(prob); print("roll:", prob, "->", ans); pg.screenshot(path=OUT / "ui_3_roll.png")
    pg.fill("#answer", ans); pg.click("#goBtn"); pg.wait_for_selector(".feedback .good, .feedback .bad", timeout=25000); pg.wait_for_timeout(400)
    pg.screenshot(path=OUT / "ui_4_result.png"); print("feedback:", pg.text_content("#feedback"))
    pg.wait_for_selector(".choice", timeout=30000); pg.wait_for_timeout(800)
    print("path:", pg.text_content("#path"), "| bag:", pg.text_content("#inv")[:60]); pg.screenshot(path=OUT / "ui_5_next.png")
    print("errors:", errors or "none"); b.close(); sys.exit(1 if errors else 0)
