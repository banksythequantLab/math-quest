# Math Quest: Goblin Grove

**Play:** https://math-quest.dj-b02.workers.dev · **Parent view:** https://math-quest.dj-b02.workers.dev/parent.html

A K-5 math adventure where every monster guards a math riddle. An **NVIDIA Nemotron**
Dungeon Master running on **Nebius Token Factory** narrates the quest; a deterministic
math engine sets and grades every problem; a per-child memory decides what comes next.

Built by Banksy AI LLC for the Nebius x NVIDIA Global AI Hackathon 2026 (Personal AI track).

## What the kid sees
Pick a hero (Nova, Willow, Ember, Kai — 2 girls, 2 boys), type a name, enter the grove.
A monster appears with a line from the DM and a problem: `7 + 8 = ?`. Right answer →
the hero casts, the monster goes dizzy (never hurt). Three in a row → next level.
Two misses → back down a level. Five levels: counting/addition, subtraction,
multiplication, division, fractions.

## What the parent sees
`/parent.html` — current level, accuracy, days played, **which fact families the child
keeps missing** ("7 times table", "taking away 9"), level over time, and a right/wrong
strip of the last 200 problems. This is the persistent memory the game runs on, shown
plainly.

## Architecture
```
browser (public/index.html, vanilla JS)
   │  POST /api/start  /api/answer      GET /api/profile
   ▼
Cloudflare Worker (worker/index.js)
   ├─ src/math-engine.js   deterministic problems (seeded PRNG), exact grading,
   │                       adaptive banding, weak-family tracking  ← single source of truth
   ├─ Workers KV "KIDS"    per-child profile: band, streak, weak{}, history[]
   └─ worker/dm.js ──────► Nebius Token Factory /chat/completions
                            nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B
                            JSON mode, thinking disabled (~1s/turn)
                            narrates only — never sees the answer, never grades
                            outage → canned lines, game keeps running
```
Design rule: **the LLM never does math.** Problems come from the engine with a seed; the
client sends the seed back; the Worker regenerates the problem and grades it. The answer
is never sent to the browser. Monster lines are checked for digits and replaced if the
model sneaks a number in.

## Art
20 monsters × 3 states (idle / surprised / dizzy) and 4 heroes × 3 states (idle / cast /
cheer), one fixed seed per character so states match. Prompts, seeds and kid-safe
negatives live in `scripts/gen_monsters.py`. Two interchangeable backends:
`gen_monsters.py` (Nebius `/v1/images/generations`, FLUX schnell) and
`gen_monsters_comfy.py` (local ComfyUI). The shipped pack was rendered locally because the
image endpoint returned 404 on our hackathon account at build time.

## Run it
```
cp .env.example .env            # NEBIUS_API_KEY=...
cp .env .dev.vars               # wrangler dev reads this
npm test                        # 9 tests: engine + worker (Nebius mocked, outage case)
npx wrangler dev --port 8787    # http://127.0.0.1:8787
python scripts/ui_smoke.py      # headless play-through + screenshots
```
Deploy: `npx wrangler kv namespace create KIDS` → id into `wrangler.jsonc`,
`npx wrangler secret put NEBIUS_API_KEY`, `npx wrangler deploy`.

## Verify the Nemotron settings yourself
`python scripts/smoke_dm.py` — prints JSON output, latency and token counts for
Nemotron Nano and Super with thinking on/off.

MIT · Banksy AI LLC
