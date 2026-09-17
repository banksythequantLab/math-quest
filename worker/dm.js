// Nemotron Dungeon Master on Nebius Token Factory.
// The DM only narrates — it never sees the answer and never grades.
// Verified settings (scripts/smoke_dm.py): thinking OFF via chat_template_kwargs, JSON mode.

const SYSTEM = `You are the Dungeon Master of "Math Quest: Goblin Grove", a game for children aged 5-10.
Voice: warm, silly, encouraging. Short sentences. No violence, no blood, nothing scary, no sarcasm.
Monsters are mischievous, not evil; when a monster is beaten it gets dizzy and giggles, never hurt.
Reply ONLY with a JSON object with exactly these keys:
{"narration": "<1-2 sentences of story, kid-friendly>",
 "monster_line": "<one short line the monster says, in character, daring the hero to solve 'my challenge'. The game shows the actual math problem separately, so this line must contain NO numbers, NO digits and NO math at all>",
 "hint_line": "<one short encouraging sentence the DM says if the kid gets stuck, without giving the answer>"}`;

const FALLBACK = (m, hero) => ({
  narration: `${cap(hero)} steps into the grove. A ${m} jumps out and blocks the path!`,
  monster_line: `Solve my riddle if you want to pass, ${cap(hero)}!`,
  hint_line: `Take your time — you've got this.`,
});

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "Hero");

export async function narrate(env, { hero, monster, monsterDesc, band, event, lastResult }, fetchImpl = fetch) {
  const look = monsterDesc ? ` The ${monster} looks like this (describe it faithfully, do not invent other colors or props): ${monsterDesc}.` : "";
  const user = (event === "start"
    ? `Hero: ${hero}. A ${monster} (math band ${band}/5) blocks the path. Introduce the encounter.`
    : lastResult?.correct
      ? `Hero: ${hero}. The hero beat the ${lastResult.monster}'s challenge and it went dizzy. Now a ${monster} (band ${band}/5) appears. Celebrate briefly, then introduce the new monster.`
      : `Hero: ${hero}. The hero missed the last challenge against the ${lastResult.monster}, the monster giggled, and the hero tries again with a ${monster} (band ${band}/5). Encourage, then introduce the monster.`) + look;
  try {
    const res = await fetchImpl(`${env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.NEBIUS_API_KEY}` },
      body: JSON.stringify({
        model: env.DM_MODEL || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
        temperature: 0.8, max_tokens: 300,
        response_format: { type: "json_object" },
        chat_template_kwargs: { enable_thinking: false },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`nebius ${res.status}`);
    const data = await res.json();
    const out = JSON.parse(data.choices[0].message.content);
    if (!out.narration || !out.monster_line) throw new Error("bad shape");
    // Guard: the engine's problem is the only math the kid should see.
    if (/\d/.test(out.monster_line)) out.monster_line = FALLBACK(monster, hero).monster_line;
    return { ...out, hint_line: out.hint_line || FALLBACK(monster, hero).hint_line, source: "nemotron" };
  } catch (e) {
    return { ...FALLBACK(monster, hero), source: "fallback", error: String(e.message || e) };
  }
}
