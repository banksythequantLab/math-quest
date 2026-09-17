// Math Quest — quest engine. Pure functions over a `quest` object stored per kid.
// Rule of the game: the math problem IS the dice roll. Right = success, wrong = the monster's turn.
// The DM (LLM) narrates this state; it never decides outcomes.
import { makeProblem, checkAnswer, recordResult } from "./math-engine.js";

export const PATH_LENGTH = 6;         // encounters per quest; the last is the boss
export const MAX_HEARTS = 3;
export const BOSS = "king";

export const QUESTS = [
  { id: "bell",    goal: "The Goblin King snatched the village bell. Get it back before the harvest feast!", reward: "the Village Bell" },
  { id: "lantern", goal: "Every lantern in Willowdale went dark. The Goblin King has the Ember Stone that lights them.", reward: "the Ember Stone" },
  { id: "recipe",  goal: "The Goblin King stole Grandma Fig's pie recipe. The bake-off is tomorrow!", reward: "Grandma Fig's recipe" },
];

// What the kid can do in a scene. band delta = how hard the roll is vs the kid's level.
export const ACTIONS = {
  sneak: { label: "Sneak past", delta: -1, passOnSuccess: true,  lootChance: 0.0 },
  talk:  { label: "Talk it out", delta: 0,  passOnSuccess: true,  lootChance: 0.5 },
  fight: { label: "Fight!",      delta: 0,  passOnSuccess: false, lootChance: 1.0 },
};

export const ITEMS = {
  potion: { name: "Healing Potion", desc: "Heals one heart." },
  charm:  { name: "Lucky Charm",    desc: "Reveals a hint for free." },
  key:    { name: "Skeleton Key",   desc: "Skip past one monster." },
};
const LOOT_TABLE = ["potion", "potion", "charm", "key"];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function newQuest(profile, monstersByBand, rnd = Math.random) {
  const q = QUESTS[Math.floor(rnd() * QUESTS.length)];
  return {
    id: q.id, goal: q.goal, reward: q.reward,
    step: 1, hearts: MAX_HEARTS, inventory: [], log: [],
    scene: newScene(1, profile.band, monstersByBand, rnd),
    status: "active",
  };
}

// monstersByBand(band) -> array of monster ids that fit this band
export function newScene(step, band, monstersByBand, rnd = Math.random) {
  const boss = step >= PATH_LENGTH;
  const pool = boss ? [BOSS] : monstersByBand(band).filter((m) => m !== BOSS);
  const monster = pool.length ? pool[Math.floor(rnd() * pool.length)] : "goblin";
  return { monster, boss, monsterHearts: boss ? 3 : (band >= 4 ? 2 : 1), phase: "choose", action: null, problem: null };
}

// Kid picks an action → the roll (a math problem) is set up.
export function chooseAction(quest, profile, actionId, seed = Date.now()) {
  const a = ACTIONS[actionId];
  if (!a || quest.scene.phase !== "choose") return { error: "bad action" };
  const band = clamp(profile.band + a.delta, 1, 5);
  const problem = makeProblem(band, seed);
  const scene = { ...quest.scene, phase: "roll", action: actionId, problem };
  return { quest: { ...quest, scene } };
}

export function useItem(quest, itemId) {
  const i = quest.inventory.indexOf(itemId);
  if (i < 0) return { error: "no item" };
  const inventory = quest.inventory.filter((_, idx) => idx !== i);
  let q = { ...quest, inventory }, effect = itemId;
  if (itemId === "potion") q.hearts = clamp(q.hearts + 1, 0, MAX_HEARTS);
  if (itemId === "key" && q.scene.phase === "choose" && !q.scene.boss) { q = advance(q, null, "key"); effect = "skip"; }
  if (itemId === "charm") effect = "hint";
  return { quest: q, effect };
}

// Resolve the roll. Returns { quest, profile, outcome } where outcome drives narration + UI.
// outcome.kind: hit | miss | monsterDown | heroDown | passed | questWon
export function resolveRoll(quest, profile, answer, monstersByBand, rnd = Math.random) {
  const s = quest.scene;
  if (s.phase !== "roll" || !s.problem) return { error: "no roll pending" };
  const correct = checkAnswer(s.problem, answer);
  const newProfile = recordResult(profile, s.problem, correct);
  const act = ACTIONS[s.action];
  let q = { ...quest, scene: { ...s, phase: "result" } };
  let outcome = { kind: correct ? "hit" : "miss", correct, answer: s.problem.answer, action: s.action, monster: s.monster };

  if (correct) {
    if (act.passOnSuccess) {
      outcome.kind = "passed";
      const loot = rnd() < act.lootChance ? pickLoot(rnd) : null;
      q = advance(q, loot, s.action, newProfile.band, monstersByBand, rnd);
      outcome.loot = loot;
    } else {
      const hearts = s.monsterHearts - 1;
      if (hearts <= 0) {
        outcome.kind = s.boss ? "questWon" : "monsterDown";
        const loot = s.boss ? null : pickLoot(rnd);
        q = advance(q, loot, "fight", newProfile.band, monstersByBand, rnd);
        outcome.loot = loot;
      } else {
        q.scene = { ...q.scene, monsterHearts: hearts, phase: "choose", action: null, problem: null };
      }
    }
  } else {
    const hearts = q.hearts - 1;
    if (hearts <= 0) {                                   // rest at camp: hearts back, same scene, monster heals too
      outcome.kind = "heroDown";
      q = { ...q, hearts: MAX_HEARTS, log: pushLog(q.log, `${cap(profile.hero)} rested at camp after the ${s.monster}.`) };
      q.scene = newScene(q.step, newProfile.band, monstersByBand, rnd);
    } else {
      q = { ...q, hearts };
      q.scene = { ...q.scene, phase: "choose", action: null, problem: null };
    }
  }
  if (outcome.kind === "questWon") q = { ...q, status: "won", scene: { ...q.scene, phase: "done" } };
  return { quest: q, profile: newProfile, outcome };
}

function advance(q, loot, how, band = 1, monstersByBand = () => ["goblin"], rnd = Math.random) {
  const s = q.scene;
  const line = how === "key" ? `Used a Skeleton Key to slip past the ${s.monster}.`
             : how === "fight" ? `Beat the ${s.monster} in a fight${loot ? ` and found a ${ITEMS[loot].name}` : ""}.`
             : how === "sneak" ? `Snuck past the ${s.monster}.`
             : `Talked the ${s.monster} into letting them pass${loot ? ` — it gave them a ${ITEMS[loot].name}` : ""}.`;
  const inventory = loot ? [...q.inventory, loot].slice(0, 6) : q.inventory;
  const step = q.step + 1;
  const scene = step > PATH_LENGTH ? { ...s, phase: "done" } : newScene(step, band, monstersByBand, rnd);
  return { ...q, step: Math.min(step, PATH_LENGTH), inventory, log: pushLog(q.log, line), scene };
}
const pickLoot = (rnd) => LOOT_TABLE[Math.floor(rnd() * LOOT_TABLE.length)];
const pushLog = (log, line) => [...(log || []), line].slice(-6);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "The hero");

// What the client is allowed to see (no answers).
export function publicQuest(q) {
  if (!q) return null;
  const { problem, ...scene } = q.scene;
  const safe = problem ? (({ answer, ...rest }) => rest)(problem) : null;
  return { ...q, scene: { ...scene, problem: safe } };
}
