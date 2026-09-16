# Math Quest: Goblin Grove

A kid-friendly (K-5) tabletop RPG where every skill check is a math problem.
The Dungeon Master is an NVIDIA Nemotron model running on Nebius Token Factory;
every monster is a cute, blood-free 3D-cartoon creature generated on Nebius (FLUX.1 schnell).

Built by Banksy AI LLC for the Nebius x NVIDIA Global AI Hackathon (Personal AI track).

## How it works
1. `src/math-engine.js` generates exact, deterministic problems in five bands
   (counting/addition → subtraction → multiplication → division → fractions).
2. The Cloudflare Worker (`worker/`) calls Nemotron on Nebius to narrate the
   problem into the story and voice the monsters; it never grades — the engine does.
3. A per-kid profile (band, streaks, weak fact families) persists in Worker KV,
   so the DM adapts the next encounter.
4. `scripts/gen_monsters.py` pre-generates the monster pack on Nebius so the
   game is fast and demo-safe.

## Setup
```
cp .env.example .env      # add NEBIUS_API_KEY
pip install openai python-dotenv
python scripts/gen_monsters.py --dry-run
python scripts/gen_monsters.py
npm test
```
