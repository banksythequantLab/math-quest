// Nemotron Dungeon Master on Nebius Token Factory.
// The DM narrates game state it is handed. It never sets or grades problems and never decides outcomes.
// Verified settings (scripts/smoke_dm.py): thinking OFF via chat_template_kwargs, JSON mode.

const SYSTEM = `You are the Dungeon Master of "Math Quest: Goblin Grove", a tabletop-style adventure for children aged 5-10.
Voice: warm, playful, a little dramatic — like a great babysitter running D&D. Short sentences. Second person ("you").
No violence, no blood, nothing scary, no sarcasm. Monsters are mischievous, never evil. A beaten monster is dizzy and giggling, never hurt.
In this game every action is decided by a "roll" — the game shows the child a math problem and grades it. You NEVER mention numbers, digits, math, riddles, or puzzles. You narrate what the hero does and what the monster does.
Remember the quest goal and the story so far; refer back to it.
Reply ONLY with a JSON object with exactly the keys requested.`;

const STAGE = (q) => q.scene.boss ? "the Goblin King's throne room at the end of the path"
  : ["the grove gate", "the mushroom hollow", "the crooked bridge", "the whispering caves", "the fog meadow", "the throne room"][q.step - 1] || "the path";

const HERO_DESC = {
  nova: "Nova, a young star sorceress in a violet and gold gown with a glowing starlight staff",
  ember: "Ember, a brave boy knight with red hair and freckles in copper armor who carries a small flame in his palm",
  kai: "Kai, a young ranger boy in a sea-green hooded cloak with a glowing water bow",
  willow: "Willow, a kind forest guardian girl with a flower crown, a vine staff and a small fox companion",
};
function context({ hero, quest, monsterDesc, profile }) {
  const inv = quest.inventory.length ? quest.inventory.join(", ") : "nothing";
  return `Hero: ${HERO_DESC[hero] || hero} (use their real gear, nothing else). Quest: ${quest.goal} Progress: scene ${quest.step} of 6, at ${STAGE(quest)}. Hero hearts: ${quest.hearts} of 3. Inventory: ${inv}.
Story so far: ${quest.log.length ? quest.log.join(" ") : "The adventure has just begun."}
Current monster: ${quest.scene.monster}${quest.scene.boss ? " (THE BOSS — the one who has what the hero is looking for)" : ""}. It looks like this — describe it faithfully, do not invent other colors or props: ${monsterDesc || "a grove creature"}.`;
}

export const FALLBACK = {
  scene: (m) => ({ narration: `Something rustles ahead — a ${m} blocks the path!`, monster_line: `You shall not pass without a challenge!`,
                   actions: { sneak: "Sneak past while it's distracted", talk: "Try to talk it out", fight: "Face it head on" } }),
  roll: (a) => ({ narration: ({ sneak: "You crouch low and creep forward…", talk: "You clear your throat and step up…", fight: "You plant your feet and get ready…" })[a] || "Here goes…" }),
  result: (kind) => ({ narration: ({ hit: "Direct hit! The monster wobbles.", miss: "Oof — not this time. The monster gets a turn and bops you. You lose a heart.",
                       monsterDown: "The monster spins, giggles, and sits down dizzy. You did it!", passed: "You're through! On to the next part of the path.",
                       heroDown: "You stumble back to camp, catch your breath, and try again.", questWon: "The Goblin King bows. You did it — the quest is complete!" })[kind] || "…" }),
};

const PROMPTS = {
  // New scene: set it, give the monster a line, and label the three choices in-fiction.
  scene: (ctx) => `${ctx}
Write the opening of this scene. Keys: "narration" (2 sentences setting the scene and the monster's entrance), "monster_line" (one short line the monster says, in character), "actions" (an object with keys "sneak", "talk", "fight": for each, one short in-story label for that choice, max 8 words. sneak = get past unseen; talk = charm or trick it; fight = a bold, brave showdown — a duel, a charge, a tickle-attack, a magic blast — exciting but never cruel. e.g. "Tiptoe through the mushrooms while it snores" / "Offer it your last acorn" / "Charge in with a fiery whirlwind!").`,
  // Kid chose an action: one line of the hero attempting it, before the roll.
  roll: (ctx, action) => `${ctx}
The hero chose to ${action}. Key: "narration" — ONE sentence of the hero starting that action, ending on suspense (the roll is about to happen).`,
  // Roll resolved.
  result: (ctx, kind, action, loot) => `${ctx}
The hero tried to ${action}. Outcome: ${({
    hit: "SUCCESS — the hero landed a hit, the monster lost a heart but is still up",
    miss: "FAIL — the monster's turn; it bopped the hero, who lost a heart (still standing)",
    monsterDown: "SUCCESS — the monster is beaten (dizzy and giggling)",
    passed: "SUCCESS — the hero got past the monster without a fight",
    heroDown: "FAIL — the hero lost the last heart and must rest at camp, then try this part of the path again",
    questWon: "VICTORY — the Goblin King is beaten and the quest goal is achieved",
  })[kind]}.${loot ? ` The hero found a ${loot}.` : ""}
Key: "narration" — 1-2 sentences narrating exactly that outcome (mention the loot if any). Be encouraging on a fail.`,
};

export async function narrate(env, kind, args, fetchImpl = fetch) {
  const ctx = context(args);
  const user = kind === "scene" ? PROMPTS.scene(ctx) : kind === "roll" ? PROMPTS.roll(ctx, args.action) : PROMPTS.result(ctx, args.outcome, args.action, args.loot);
  const fallback = kind === "scene" ? FALLBACK.scene(args.quest.scene.monster) : kind === "roll" ? FALLBACK.roll(args.action) : FALLBACK.result(args.outcome);
  try {
    const res = await fetchImpl(`${env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.NEBIUS_API_KEY}` },
      body: JSON.stringify({
        model: env.DM_MODEL || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
        temperature: 0.8, max_tokens: 350,
        response_format: { type: "json_object" },
        chat_template_kwargs: { enable_thinking: false },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`nebius ${res.status}`);
    const out = JSON.parse((await res.json()).choices[0].message.content);
    if (!out.narration) throw new Error("bad shape");
    const clean = (s) => (typeof s === "string" && !/\d/.test(s) ? s : null);   // the engine's problem is the only math on screen
    const result = { narration: clean(out.narration) || fallback.narration, source: "nemotron" };
    if (kind === "scene") {
      result.monster_line = clean(out.monster_line) || fallback.monster_line;
      result.actions = { sneak: clean(out.actions?.sneak) || fallback.actions.sneak, talk: clean(out.actions?.talk) || fallback.actions.talk, fight: clean(out.actions?.fight) || fallback.actions.fight };
    }
    return result;
  } catch (e) {
    return { ...fallback, source: "fallback", error: String(e.message || e) };
  }
}
