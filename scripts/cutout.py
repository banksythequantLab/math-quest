"""Cut characters out of their backgrounds → transparent PNG sprites for the stage.
public/monsters/*.webp → public/sprites/monsters/*.png ; public/heroes/*.webp → public/sprites/heroes/*.png
Uses rembg (u2net). Trims transparent margins and pads to a square so feet line up on the stage.
Usage: python scripts/cutout.py [--force] [--only goblin,nova]
"""
import argparse, io, sys, time
from pathlib import Path
from PIL import Image
from rembg import remove, new_session

ROOT = Path(__file__).resolve().parents[1] / "public"
SETS = [("monsters", ROOT / "monsters"), ("heroes", ROOT / "heroes")]

def bg_fraction(out: Image.Image) -> float:
    """Share of opaque pixels touching the image border — a clean cutout has almost none."""
    a = out.getchannel("A"); w, h = a.size
    edge = [a.getpixel((x, 0)) for x in range(w)] + [a.getpixel((x, h - 1)) for x in range(w)] + [a.getpixel((0, y)) for y in range(h)] + [a.getpixel((w - 1, y)) for y in range(h)]
    return sum(1 for v in edge if v > 128) / len(edge)

def cut(src: Path, dest: Path, session) -> None:
    img = Image.open(src).convert("RGBA")
    out = remove(img, session=session, alpha_matting=True, alpha_matting_foreground_threshold=240, alpha_matting_background_threshold=10, alpha_matting_erode_size=8)
    if bg_fraction(out) > 0.15:                      # background leaked in: retry without matting (hard mask)
        out = remove(img, session=session, alpha_matting=False, post_process_mask=True)
    bbox = out.getbbox()
    if bbox: out = out.crop(bbox)
    w, h = out.size; side = max(w, h) + 24
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(out, ((side - w) // 2, side - h - 12))          # bottom-aligned: feet on the floor
    canvas.thumbnail((512, 512)); canvas.save(dest, "PNG", optimize=True)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--force", action="store_true"); ap.add_argument("--only", default="")
    a = ap.parse_args(); only = {s for s in a.only.split(",") if s}
    session = new_session("u2net"); n = 0
    for name, folder in SETS:
        out_dir = ROOT / "sprites" / name; out_dir.mkdir(parents=True, exist_ok=True)
        for src in sorted(folder.glob("*.webp")):
            cid = src.stem.rsplit("_", 1)[0]
            if only and cid not in only: continue
            dest = out_dir / (src.stem + ".png")
            if dest.exists() and not a.force: continue
            t = time.time(); cut(src, dest, session); n += 1
            print(f"ok   sprites/{name}/{dest.name} {time.time()-t:.1f}s {dest.stat().st_size//1024} KB")
    print("done", n)

if __name__ == "__main__":
    main()
