"""Pre-generate the Math Quest monster pack on Nebius Token Factory (FLUX.1 schnell).

Every monster gets 3 states (idle / surprised / dizzy) with a FIXED seed so the
same creature looks the same across states. Kid-safe: a negative prompt blocks
blood, gore, weapons and scary imagery at the model level.

Usage:
  python scripts/gen_monsters.py --dry-run          # print prompts, no API calls
  python scripts/gen_monsters.py                    # generate all missing images
  python scripts/gen_monsters.py --only goblin,orc  # subset
  python scripts/gen_monsters.py --force            # regenerate even if file exists
Output: public/monsters/<id>_<state>.webp + public/monsters/manifest.json
"""
import argparse, base64, json, os, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "monsters"

STYLE = ("cute 3D animated movie style character, chubby, big round eyes, soft rounded shapes, "
         "friendly smile, bright saturated colors, soft studio lighting, plain pastel background, "
         "full body, centered, high quality render")
NEGATIVE = ("blood, gore, wounds, weapons, sword, knife, scary, creepy, horror, realistic, dark, "
            "grim, teeth bared, angry, text, watermark, extra limbs, deformed")

STATES = {
    "idle":      "standing happily, relaxed pose",
    "surprised": "surprised expression, eyebrows up, mouth open in a little o, hands up",
    "dizzy":     "dizzy and giggling, eyes as swirls, little cartoon stars circling head, sitting down, unharmed",
}

# (id, band 1-5, description). Band = which math level the monster typically guards.
MONSTERS = [
    ("goblin",     1, "small green goblin with big floppy ears and a tiny leather vest"),
    ("orc",        3, "big burly orc with tusks, blue-grey skin, wearing a patched leather tunic"),
    ("troll",      4, "shaggy moss-covered troll with a flower growing on its head"),
    ("slime",      1, "bouncy translucent blue slime blob with a happy face"),
    ("bat",        1, "cartoon vampire bat monster, large purple leathery bat wings spread wide, pointed ears, fangs, hanging in the air"),
    ("mushroom",   2, "walking red-capped mushroom person with white spots"),
    ("skeleton",   2, "silly cartoon skeleton in a tiny knitted hat, wobbling"),
    ("gloomfang",  2, "the Gloomfang: shadowy many-legged lurker with glowing orange eyes, black and orange body, crouched in a dark web"),
    ("kobold",     2, "tiny lizard kobold in oversized armor made of pots and pans"),
    ("wolf",       3, "cartoon grey dire wolf monster, shaggy fur, glowing yellow eyes, red bandana"),
    ("ogre",       3, "cartoon ogre monster, huge round belly, yellow-green skin, one horn, holding a giant sandwich"),
    ("golem",      4, "stone golem made of stacked round pebbles with glowing rune eyes"),
    ("harpy",      4, "cartoon harpy monster, half bird half person, colorful parrot feathers, large wings, talon feet"),
    ("ghost",      3, "friendly bedsheet ghost with rosy cheeks"),
    ("gnome",      1, "grumpy garden gnome with a pointy red hat and a watering can"),
    ("wyrmling",   5, "baby dragon wyrmling with stubby wings hiccuping a tiny puff of smoke"),
    ("minotaur",   5, "cartoon minotaur monster, bull head with big horns, muscular, brown fur, cowbell necklace"),
    ("lich",       5, "cartoon skeletal lich sorcerer, purple robes, big wizard hat, glowing green eyes, crystal staff"),
    ("mimic",      4, "treasure chest mimic with a goofy tongue and googly eyes"),
    ("king",       5, "the Goblin King: goblin with a crooked golden paper crown and a cape"),
]

# Playable heroes — original characters, elegant 3D animated-movie style (no real-franchise names).
HERO_STATES = {
    "idle":  "confident heroic pose, gentle smile",
    "cast":  "casting a glowing magic spell, hands raised, sparkles of light",
    "cheer": "celebrating with a fist pump and a big happy grin",
}
HEROES = [
    ("nova",   "young sorceress with long dark curly hair in a braid, flowing violet and gold gown, glowing starlight staff"),
    ("ember",  "brave boy knight with short red hair and freckles, polished copper and cream armor, small flame floating in his palm"),
    ("kai",    "young ranger boy with tousled black hair, sea-green hooded cloak, glowing water bow"),
    ("willow", "kind forest guardian girl with auburn hair and a flower crown, leaf-green cloak, vine staff, small fox companion"),
]
# 2 girls (nova, willow) + 2 boys (ember, kai)

def build_prompt(desc: str, state: str) -> str:
    return f"{desc}, {STATES[state]}, {STYLE}"

def seed_for(mid: str) -> int:
    # stable per-monster seed so states share one design
    return sum(ord(c) * (i + 1) for i, c in enumerate(mid)) % 2_000_000_000

def generate_one(client, model: str, prompt: str, seed: int, dest: Path) -> None:
    resp = client.images.generate(
        model=model,
        prompt=prompt,
        response_format="b64_json",
        extra_body={
            "width": 768, "height": 768,
            "num_inference_steps": 4,          # schnell sweet spot
            "seed": seed,
            "negative_prompt": NEGATIVE,
            "response_extension": "webp",
        },
    )
    dest.write_bytes(base64.b64decode(resp.data[0].b64_json))

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", default="", help="comma-separated monster ids")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    OUT.mkdir(parents=True, exist_ok=True)

    client = model = None
    if not args.dry_run:
        from dotenv import load_dotenv
        from openai import OpenAI
        load_dotenv(ROOT / ".env")
        key = os.environ.get("NEBIUS_API_KEY")
        if not key:
            print("NEBIUS_API_KEY missing (put it in .env)", file=sys.stderr); return 2
        client = OpenAI(base_url=os.environ.get("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1"), api_key=key)
        model = os.environ.get("IMAGE_MODEL", "black-forest-labs/flux-schnell")

    manifest, done, skipped, failed = [], 0, 0, 0
    for mid, band, desc in MONSTERS:
        if only and mid not in only:
            continue
        entry = {"id": mid, "band": band, "seed": seed_for(mid), "states": {}}
        for state in STATES:
            dest = OUT / f"{mid}_{state}.webp"
            entry["states"][state] = dest.name
            prompt = build_prompt(desc, state)
            if args.dry_run:
                print(f"[dry] {dest.name} seed={entry['seed']}\n      {prompt}")
                continue
            if dest.exists() and not args.force:
                skipped += 1; continue
            for attempt in range(3):
                try:
                    generate_one(client, model, prompt, entry["seed"], dest)
                    print(f"ok   {dest.name} ({dest.stat().st_size // 1024} KB)")
                    done += 1; break
                except Exception as e:  # noqa: BLE001
                    print(f"err  {dest.name} attempt {attempt + 1}: {e}", file=sys.stderr)
                    time.sleep(2 * (attempt + 1))
            else:
                failed += 1
        manifest.append(entry)

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nmanifest: {OUT / 'manifest.json'}  generated={done} skipped={skipped} failed={failed}")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())
