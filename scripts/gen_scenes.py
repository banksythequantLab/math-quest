"""Render the 6 location backgrounds on local ComfyUI (SD1.5), 896x512 → public/scenes/<id>.webp.
Prompts come from src/content.js LOCATIONS (kept in sync by hand below).
Usage: python scripts/gen_scenes.py [--force] [--only gate,hollow]
"""
import argparse, json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_monsters_comfy import submit, wait_for_image, to_webp, workflow, _get  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "public" / "scenes"
STYLE = ("stylized 3d animated movie background, wide establishing shot, no characters, no people, no text, "
         "rich color, soft volumetric light, painterly detail, disney pixar environment concept art, masterpiece, best quality")
NEG = "character, person, creature, monster, animal, text, watermark, logo, blurry, lowres, photo, realistic, dark and gloomy, scary"
SCENES = {
    "gate":   "a mossy stone archway wrapped in glowing blue mushrooms, fireflies drifting, twilight forest path",
    "hollow": "a sunken forest clearing of giant red-capped mushrooms with white spots, dappled light, soft green fog",
    "bridge": "a rickety rope bridge over a sparkling waterfall gorge, rainbow mist, distant cliffs",
    "caves":  "a cave of glowing purple crystals and dripping stalactites, underground pool reflecting light",
    "meadow": "a moonlit meadow of tall silver grass and floating dandelion seeds, low fog, big moon",
    "throne": "a wonky underground goblin throne room piled with stolen junk, a crooked throne made of spoons and teacups, torchlight",
}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--force", action="store_true"); ap.add_argument("--only", default="")
    a = ap.parse_args(); only = {s for s in a.only.split(",") if s}
    OUT.mkdir(parents=True, exist_ok=True); json.loads(_get("/system_stats"))
    for sid, desc in SCENES.items():
        if only and sid not in only: continue
        dest = OUT / f"{sid}.webp"
        if dest.exists() and not a.force: print("skip", dest.name); continue
        seed = sum(ord(c) * (i + 1) for i, c in enumerate(sid)) % 2_000_000_000
        wf = workflow("dreamshaper_8.safetensors", f"{desc}, {STYLE}", seed, 30, 7.0, 512, NEG)
        wf["4"]["inputs"].update({"width": 896, "height": 512})
        t = time.time(); to_webp(wait_for_image(submit(wf)), dest); print(f"ok   {dest.name} {time.time()-t:.0f}s {dest.stat().st_size//1024} KB")

if __name__ == "__main__":
    main()
