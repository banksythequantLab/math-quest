// Nemotron Dungeon Master on Nebius Token Factory.
// Structure is authored (src/content.js); the DM writes the words. It never sets, grades, or decides anything.
// Scene openings: Nemotron Super (quality). Roll/result beats: Nemotron Nano (speed). Thinking off, JSON mode.
import { LOCATIONS } from "../src/content.js";
import { beatOf } from "../src/quest.js";

const SYSTEM = `You are the Dungeon Master of "Math Quest: Goblin Grove", a tabletop adventure for children aged 5-10 — think a brilliant, funny babysitter running D&D at a sleepover.
STYLE: vivid, specific, playful. Second person ("you"). Short punchy sentences a 7-year-old can follow. Sensory details (sounds, smells, textures). Humor from character, not sarcasm. Every monster is a PERSON with a name, a personality and a want — play them like a puppet with a distinct voice, and let the hero's choices change how they feel about the hero.
SAFETY: no violence, no blood, nothing scary, no meanness. Fights are cartoon showdowns; a beaten monster is dizzy and giggling, never hurt.
THE ROLL: every action is decided by a roll the GAME runs (the child solves a math problem). You NEVER mention numbers, digits, counting, math, riddles or puzzles. You narrate the attempt and the outcome you are told.
CONTINUITY: use the story so far, the clues found, and the allies made. Callbacks are gold.
Reply ONLY with a JSON object with exactly the keys requested. No markdown.`;

const HERO_DESC = {
  nova: "Nova, a young star sorceress in a violet-and-gold gown with a glowing starlight staff",
  ember: "Ember, a brave boy knight with red hair and freckles in copper armor, a small flame dancing in his palm",
  kai: "Kai, a young ranger boy in a sea-green hooded cloak with a glowing water bow",
  willow: "Willow, a kind forest guardian girl with a flower crown, a vine staff and a small fox who follows her",
};

function context({ hero, quest, monsterDesc }) {
  const b = beatOf(quest), loc = LOCATIONS[b.location];
  const inv = quest.inventory.length ? quest.inventory.join(", ") : "nothing";
  return `HERO: ${HERO_DESC[hero] || hero} (only their real gear).
QUEST "${quest.title}": ${quest.goal}
SCENE ${quest.step} of 6 — ${loc.name}: ${loc.look}.
MONSTER: ${b.cast.name}, ${b.cast.persona}. Wants: ${b.cast.want}. Voice: ${b.cast.voice}. Looks: ${monsterDesc || "a grove creature"} (describe faithfully).${quest.scene.boss ? " THIS IS THE BOSS — the one who has what the hero came for." : ""}
THIS SCENE'S PLOT: ${b.role}
HERO HEARTS: ${quest.hearts}/3. BAG: ${inv}. ALLIES made so far: ${quest.allies?.length ? quest.allies.join(", ") : "none"}.
CLUES FOUND: ${quest.clues?.length ? quest.clues.map((c) => `"${c}"`).join(" ") : "none yet"}.
STORY SO FAR: ${quest.log.length ? quest.log.join(" ") : "The adventure has just begun."}`;
}

const PROMPTS = {
  scene: (ctx) => `${ctx}
Open this scene. Keys:
"narration": 3-4 short sentences. Arrive at the place (use its look), then the monster's entrance in character, tied to THIS SCENE'S PLOT. If the hero has allies or clues, weave one in naturally.
"monster_line": one line the monster says, in its voice, that shows its personality and its want.
"actions": object with keys "sneak", "talk", "fight" — an in-story label for each choice, max 9 words, specific to this monster and place. sneak = slip past unnoticed; talk = charm, help, or trick it (relate to its want!); fight = a bold cartoon showdown (a duel, a charge, a tickle-attack, a magic blast).`,
  roll: (ctx, action) => `${ctx}
The hero chose to ${action}. Key "narration": ONE sentence — the hero begins that exact action; end on suspense, the roll is about to happen.`,
  result: (ctx, kind, action, loot, clue) => `${ctx}
The hero tried to ${action}. OUTCOME: ${({
    hit: "SUCCESS — the hero landed a hit; the monster lost a heart but is still standing and reacts in character",
    miss: "FAIL — the monster's turn: it bops the hero, who loses a heart (still standing). Keep it funny and encouraging",
    monsterDown: "SUCCESS — the monster is beaten: dizzy, giggling, sitting down",
    passed: "SUCCESS — the hero got past the monster without a fight, using that action" + (action === "talk" ? " — the monster is now a FRIEND and says so" : ""),
    heroDown: "FAIL — the hero lost the last heart, stumbles back to camp to rest, and will try this part of the path again",
    questWon: "VICTORY — the boss is beaten; the hero gets what they came for, and the boss's want gets a kind ending",
  })[kind]}.${loot ? ` The hero finds a ${loot}.` : ""}${clue ? ` The hero learns this clue, in the monster's own words: "${clue}".` : ""}
Key "narration": 2-3 sentences narrating exactly that (mention the loot and deliver the clue if given).`,
};

export const FALLBACK = {
  scene: (q) => { const b = beatOf(q); return { narration: `You reach ${LOCATIONS[b.location].name}. ${b.cast.name} steps into your path — ${b.role}`, monster_line: `Halt, hero!`,
                   actions: { sneak: "Sneak past while it's distracted", talk: `Ask ${b.cast.name} what it wants`, fight: "Face it head on" } }; },
  roll: (a) => ({ narration: ({ sneak: "You crouch low and creep forward…", talk: "You clear your throat and step up…", fight: "You plant your feet and get ready…" })[a] || "Here goes…" }),
  result: (kind, loot, clue) => ({ narration: (({ hit: "Direct hit! The monster wobbles.", miss: "Oof — not this time. The monster gets a turn and bops you. You lose a heart.",
                       monsterDown: "The monster spins, giggles, and sits down dizzy. You did it!", passed: "You're through! On to the next part of the path.",
                       heroDown: "You stumble back to camp, catch your breath, and try again.", questWon: "The Goblin King bows. You did it — the quest is complete!" })[kind] || "…")
                       + (loot ? ` You found a ${loot}!` : "") + (clue ? ` You learned: "${clue}"` : "") }),
};

export async function narrate(env, kind, args, fetchImpl = fetch) {
  const ctx = context(args);
  const user = kind === "scene" ? PROMPTS.scene(ctx) : kind === "roll" ? PROMPTS.roll(ctx, args.action) : PROMPTS.result(ctx, args.outcome, args.action, args.loot, args.clue);
  const fallback = kind === "scene" ? FALLBACK.scene(args.quest) : kind === "roll" ? FALLBACK.roll(args.action) : FALLBACK.result(args.outcome, args.loot, args.clue);
  const model = kind === "scene" ? (env.DM_MODEL_SCENE || env.DM_MODEL) : env.DM_MODEL;
  try {
    const res = await fetchImpl(`${env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.NEBIUS_API_KEY}` },
      body: JSON.stringify({
        model: model || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
        temperature: 0.9, max_tokens: 450,
        response_format: { type: "json_object" },
        chat_template_kwargs: { enable_thinking: false },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`nebius ${res.status}`);
    const out = JSON.parse((await res.json()).choices[0].message.content);
    if (!out.narration) throw new Error("bad shape");
    const clean = (s) => (typeof s === "string" && !/\d/.test(s) ? s.trim() : null);   // the engine's problem is the only math on screen
    const result = { narration: clean(out.narration) || fallback.narration, source: "nemotron", model };
    if (kind === "scene") {
      result.monster_line = clean(out.monster_line) || fallback.monster_line;
      result.actions = { sneak: clean(out.actions?.sneak) || fallback.actions.sneak, talk: clean(out.actions?.talk) || fallback.actions.talk, fight: clean(out.actions?.fight) || fallback.actions.fight };
    }
    return result;
  } catch (e) {
    return { ...fallback, source: "fallback", error: String(e.message || e) };
  }
}
