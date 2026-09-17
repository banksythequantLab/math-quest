"""Generate the Math Quest monster pack on a LOCAL ComfyUI (fallback for when
Nebius image generation is unavailable). Same monsters/prompts/seeds as
gen_monsters.py so the two backends are interchangeable.

Usage:
  python scripts/gen_monsters_comfy.py --only goblin
  python scripts/gen_monsters_comfy.py                  # all missing
  python scripts/gen_monsters_comfy.py --force --ckpt dreamshaper_8.safetensors
Env: COMFY_URL (default http://127.0.0.1:8188)
"""
import argparse, json, os, sys, time, urllib.request, urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_monsters import MONSTERS, STATES, NEGATIVE, OUT, HEROES, HERO_STATES, build_prompt, seed_for  # noqa: E402

HERO_OUT = OUT.parent / "heroes"
HERO_STYLE = ("elegant 3d animated movie hero style, stylized character, big expressive eyes, "
              "graceful, detailed magical costume, soft cinematic lighting, sparkles, "
              "full body, centered, enchanted forest background, masterpiece, best quality")
HERO_NEG = ("blood, gore, weapons, scary, realistic, photo, text, watermark, extra limbs, deformed, "
            "blurry, lowres, bad anatomy, nsfw, revealing, cleavage, chibi, baby")

COMFY = os.environ.get("COMFY_URL", "http://127.0.0.1:8188").rstrip("/")

# SD1.5-friendly style suffix (shorter than the FLUX one; SD1.5 has a 77-token window)
SD_STYLE = ("stylized 3d animated movie monster, dreamworks pixar villain style, expressive face, "
            "mischievous toothy grin, rugged textured skin, dramatic rim lighting, cinematic, "
            "detailed, dynamic pose, full body, centered, simple dark forest background, masterpiece, best quality")
SD_NEG = NEGATIVE + ", blurry, lowres, bad anatomy, nsfw, chibi, baby, plush toy, kawaii, sticker"

def sd_prompt(desc: str, state: str) -> str:
    return f"{desc}, {STATES[state]}, {SD_STYLE}"

def workflow(ckpt: str, prompt: str, seed: int, steps: int, cfg: float, size: int, neg: str = SD_NEG) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": prompt}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["1", 1], "text": neg}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": size, "height": size, "batch_size": 1}},
        "5": {"class_type": "KSampler", "inputs": {
            "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0], "latent_image": ["4", 0],
            "seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "mathquest/tmp"}},
    }

def _get(path: str):
    with urllib.request.urlopen(COMFY + path, timeout=30) as r:
        return r.read()

def submit(wf: dict) -> str:
    body = json.dumps({"prompt": wf, "client_id": "mathquest"}).encode()
    req = urllib.request.Request(COMFY + "/prompt", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["prompt_id"]

def wait_for_image(prompt_id: str, timeout: float = 600) -> bytes:
    t0 = time.time()
    while time.time() - t0 < timeout:
        hist = json.loads(_get(f"/history/{prompt_id}"))
        if prompt_id in hist:
            entry = hist[prompt_id]
            if entry.get("status", {}).get("status_str") == "error":
                raise RuntimeError(json.dumps(entry["status"].get("messages", []))[:500])
            for node in entry["outputs"].values():
                for im in node.get("images", []):
                    q = urllib.parse.urlencode({"filename": im["filename"], "subfolder": im.get("subfolder", ""), "type": im["type"]})
                    return _get(f"/view?{q}")
        time.sleep(1.5)
    raise TimeoutError(prompt_id)

def to_webp(png: bytes, dest: Path) -> None:
    try:
        from PIL import Image
        import io
        Image.open(io.BytesIO(png)).convert("RGB").save(dest, "WEBP", quality=88)
    except ImportError:  # no Pillow: keep png
        dest.with_suffix(".png").write_bytes(png)

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--ckpt", default="dreamshaper_8.safetensors")
    ap.add_argument("--steps", type=int, default=28)
    ap.add_argument("--cfg", type=float, default=7.0)
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--set", choices=["monsters", "heroes"], default="monsters")
    args = ap.parse_args()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    if args.set == "heroes":
        items = [(hid, 0, desc) for hid, desc in HEROES]
        states, out_dir, neg = HERO_STATES, HERO_OUT, HERO_NEG
        prompt_fn = lambda d, s: f"{d}, {HERO_STATES[s]}, {HERO_STYLE}"  # noqa: E731
    else:
        items, states, out_dir, neg, prompt_fn = MONSTERS, STATES, OUT, SD_NEG, sd_prompt
    out_dir.mkdir(parents=True, exist_ok=True)
    try:
        stats = json.loads(_get("/system_stats"))
        print("ComfyUI:", stats["devices"][0]["name"], "free VRAM MB:", stats["devices"][0]["vram_free"] // 2**20)
    except Exception as e:  # noqa: BLE001
        print(f"ComfyUI not reachable at {COMFY}: {e}", file=sys.stderr); return 2

    manifest, done, skipped, failed = [], 0, 0, 0
    for mid, band, desc in items:
        if only and mid not in only:
            continue
        entry = {"id": mid, "band": band, "seed": seed_for(mid), "backend": "comfyui/" + args.ckpt, "states": {}}
        for state in states:
            dest = out_dir / f"{mid}_{state}.webp"
            entry["states"][state] = dest.name
            if dest.exists() and not args.force:
                skipped += 1; continue
            t = time.time()
            try:
                pid = submit(workflow(args.ckpt, prompt_fn(desc, state), entry["seed"], args.steps, args.cfg, args.size, neg))
                to_webp(wait_for_image(pid), dest)
                print(f"ok   {dest.name} {time.time()-t:.0f}s {dest.stat().st_size // 1024} KB"); done += 1
            except Exception as e:  # noqa: BLE001
                print(f"err  {dest.name}: {e}", file=sys.stderr); failed += 1
        manifest.append(entry)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\ngenerated={done} skipped={skipped} failed={failed}")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())
