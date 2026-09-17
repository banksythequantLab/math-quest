import { test } from "node:test";
import assert from "node:assert/strict";
import { newQuest, chooseAction, resolveRoll, useItem, publicQuest, PATH_LENGTH, MAX_HEARTS, BOSS } from "../src/quest.js";

const byBand = (b) => (b >= 4 ? ["golem", "harpy", "king"] : ["goblin", "slime"]);
const rnd0 = () => 0;            // deterministic: first quest, first monster, first loot (potion), loot always drops
const prof = () => ({ kid: "t", hero: "ember", band: 1, streak: 0, misses: 0, total: 0, correctTotal: 0, weak: {} });
const right = (q) => q.scene.problem.answer;

test("new quest: step 1, full hearts, a scene waiting for a choice", () => {
  const q = newQuest(prof(), byBand, rnd0);
  assert.equal(q.step, 1); assert.equal(q.hearts, MAX_HEARTS); assert.equal(q.scene.phase, "choose");
  assert.ok(q.goal.includes("Goblin King"));
  assert.notEqual(q.scene.monster, BOSS);
});

test("sneak is one band easier; fight is the kid's band", () => {
  const p = { ...prof(), band: 3 };
  const q = newQuest(p, byBand, rnd0);
  assert.equal(chooseAction(q, p, "sneak", 1).quest.scene.problem.band, 2);
  assert.equal(chooseAction(q, p, "fight", 1).quest.scene.problem.band, 3);
  assert.equal(chooseAction(q, { ...p, band: 1 }, "sneak", 1).quest.scene.problem.band, 1);
  assert.ok(chooseAction(q, p, "dance", 1).error);
});

test("fight: right answer takes a monster heart, monster down drops loot and advances", () => {
  const p = prof();
  let q = chooseAction(newQuest(p, byBand, rnd0), p, "fight", 7).quest;
  const r = resolveRoll(q, p, right(q), byBand, rnd0);
  assert.equal(r.outcome.kind, "monsterDown");        // band-1 monsters have 1 heart
  assert.equal(r.outcome.loot, "potion");
  assert.equal(r.quest.step, 2); assert.deepEqual(r.quest.inventory, ["potion"]);
  assert.equal(r.quest.scene.phase, "choose");
  assert.match(r.quest.log[0], /Beat the goblin/);
});

test("miss costs a heart; three misses = rest at camp, hearts refill, step unchanged", () => {
  const p = prof();
  let q = newQuest(p, byBand, rnd0), pr = p, last;
  for (let i = 0; i < 3; i++) {
    q = chooseAction(q, pr, "fight", i).quest;
    last = resolveRoll(q, pr, "999", byBand, rnd0); q = last.quest; pr = last.profile;
  }
  assert.equal(last.outcome.kind, "heroDown");
  assert.equal(q.hearts, MAX_HEARTS); assert.equal(q.step, 1);
  assert.match(q.log.at(-1), /rested at camp/);
  assert.equal(pr.total, 3); assert.equal(pr.correctTotal, 0);
});

test("sneak passes with no loot; talk may drop loot", () => {
  const p = prof();
  let q = chooseAction(newQuest(p, byBand, rnd0), p, "sneak", 3).quest;
  let r = resolveRoll(q, p, right(q), byBand, rnd0);
  assert.equal(r.outcome.kind, "passed"); assert.equal(r.outcome.loot, null); assert.equal(r.quest.step, 2);
  q = chooseAction(r.quest, p, "talk", 4).quest;
  r = resolveRoll(q, p, right(q), byBand, rnd0);              // rnd0 < 0.5 => loot
  assert.equal(r.outcome.kind, "passed"); assert.equal(r.outcome.loot, "potion");
});

test("items: potion heals, key skips a monster, charm signals a hint", () => {
  const p = prof();
  let q = { ...newQuest(p, byBand, rnd0), hearts: 1, inventory: ["potion", "key", "charm"] };
  let r = useItem(q, "potion"); assert.equal(r.quest.hearts, 2); assert.deepEqual(r.quest.inventory, ["key", "charm"]);
  r = useItem(r.quest, "key"); assert.equal(r.effect, "skip"); assert.equal(r.quest.step, 2);
  r = useItem(r.quest, "charm"); assert.equal(r.effect, "hint");
  assert.ok(useItem(r.quest, "charm").error);
});

test("boss at the last step has 3 hearts; beating it wins the quest; client never sees answers", () => {
  const p = { ...prof(), band: 5 };
  let q = { ...newQuest(p, byBand, rnd0), step: PATH_LENGTH };
  q.scene = { monster: BOSS, boss: true, monsterHearts: 3, phase: "choose", action: null, problem: null };
  let pr = p, r;
  for (let i = 0; i < 3; i++) { q = chooseAction(q, pr, "fight", 10 + i).quest; assert.equal(publicQuest(q).scene.problem.answer, undefined); r = resolveRoll(q, pr, right(q), byBand, rnd0); q = r.quest; pr = r.profile; }
  assert.equal(r.outcome.kind, "questWon"); assert.equal(q.status, "won");
});
