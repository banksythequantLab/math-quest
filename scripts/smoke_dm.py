"""Smoke test: can the Nemotron DM on Nebius return kid-safe structured JSON?
Usage: python scripts/smoke_dm.py [model_id ...]
Tries: (a) thinking off via chat_template_kwargs, (b) default, and prints raw fields.
"""
import json, os, sys, time
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
client = OpenAI(base_url=os.environ["NEBIUS_BASE_URL"], api_key=os.environ["NEBIUS_API_KEY"])
models = sys.argv[1:] or [os.environ["DM_MODEL"], "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"]

SYSTEM = (
    "You are a warm, silly Dungeon Master for a 7-year-old. A cute goblin blocks the path. "
    "No violence, no scary words. Reply ONLY with a JSON object: "
    '{"narration": "<2 kid-friendly sentences>", '
    '"goblin_line": "<one line the goblin says that asks the math problem 4 + 3 exactly>"}'
)
VARIANTS = [
    ("think_off", {"extra_body": {"chat_template_kwargs": {"enable_thinking": False}}}),
    ("default",   {}),
]

for m in models:
    for label, extra in VARIANTS:
        t = time.time()
        try:
            r = client.chat.completions.create(
                model=m, temperature=0.7, max_tokens=1500,
                response_format={"type": "json_object"},
                messages=[{"role": "system", "content": SYSTEM},
                          {"role": "user", "content": "The kid walks into the Goblin Grove."}],
                **extra,
            )
            msg = r.choices[0].message
            txt = msg.content
            reasoning = getattr(msg, "reasoning_content", None) or (msg.model_extra or {}).get("reasoning_content")
            ok = bool(txt) and "4 + 3" in txt and set(json.loads(txt)) == {"narration", "goblin_line"}
            print(f"{m} [{label}]  {time.time()-t:.1f}s  {r.usage.total_tokens} tok  "
                  f"finish={r.choices[0].finish_reason} schema_ok={ok} reasoning_len={len(reasoning or '')}")
            print(f"  content: {txt!r}"[:500], "\n")
        except Exception as e:  # noqa: BLE001
            print(f"{m} [{label}]  FAILED: {e}\n")
