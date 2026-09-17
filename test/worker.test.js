import { test } from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "../worker/index.js";
import { makeProblem } from "../src/math-engine.js";

const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, _m: m }; };
const DM = JSON.stringify({ narration: "The grove gate creaks open. A goblin hops out!", monster_line: "Halt, hero!",
                            actions: { sneak: "Tiptoe past the snoring goblin", talk: "Offer it a shiny acorn", fight: "Charge with your flame!" } });
const fakeNebius = async () => new Response(JSON.stringify({ choices: [{ message: { content: DM } }] }), { status: 200 });
const brokenNebius = async () => new Response("nope", { status: 500 });
const env = () => ({ KIDS: kv(), NEBIUS_API_KEY: "x" });
const post = (path, body) => new Request(`http://t${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const stored = (E, kid) => JSON.parse(E.KIDS._m.get(`kid:${kid}`));

test("start opens a quest with an in-fiction scene and labeled actions; answers never leak", async () => {
  const E = env();
  const b = await (await handleApi(post("/api/start", { kid: "Ava!", hero: "Ember" }), E, fakeNebius)).json();
  assert.equal(b.profile.kid, "ava"); assert.equal(b.profile.hero, "ember"); assert.equal(b.profile.quests, 1);
  assert.equal(b.quest.step, 1); assert.equal(b.quest.hearts, 3); assert.equal(b.quest.scene.phase, "choose");
  assert.equal(b.dm.source, "nemotron"); assert.equal(b.dm.actions.sneak, "Tiptoe past the snoring goblin");
  assert.ok(b.quest.goal.length > 10);
  const a = await (await handleApi(post("/api/act", { kid: "ava", action: "fight" }), E, fakeNebius)).json();
  assert.equal(a.quest.scene.phase, "roll"); assert.ok(a.quest.scene.problem.text); assert.equal(a.quest.scene.problem.answer, undefined);
  assert.ok(a.dm.narration);
});

test("full loop: fight → hit → monster down → loot → next scene; outage keeps the game going", async () => {
  const E = env();
  await handleApi(post("/api/start", { kid: "max", hero: "kai" }), E, fakeNebius);
  await handleApi(post("/api/act", { kid: "max", action: "fight" }), E, fakeNebius);
  const p = stored(E, "max").quest.scene.problem;
  const b = await (await handleApi(post("/api/answer", { kid: "max", answer: makeProblem(p.band, p.seed).answer }), E, brokenNebius)).json();
  assert.equal(b.outcome.kind, "monsterDown"); assert.ok(b.outcome.loot);
  assert.equal(b.quest.step, 2); assert.equal(b.quest.inventory.length, 1);
  assert.equal(b.outcomeDm.source, "fallback"); assert.equal(b.dm.source, "fallback"); assert.ok(b.dm.actions.fight);
  assert.equal(b.profile.correctTotal, 1);
});

test("miss costs a heart and re-offers actions; use potion heals; resume keeps the quest", async () => {
  const E = env();
  await handleApi(post("/api/start", { kid: "zoe", hero: "willow" }), E, fakeNebius);
  await handleApi(post("/api/act", { kid: "zoe", action: "sneak" }), E, fakeNebius);
  let b = await (await handleApi(post("/api/answer", { kid: "zoe", answer: "999" }), E, fakeNebius)).json();
  assert.equal(b.outcome.kind, "miss"); assert.equal(b.quest.hearts, 2); assert.equal(b.quest.scene.phase, "choose");
  assert.equal(b.dm.narration, null); assert.ok(b.dm.actions.talk);       // labels refreshed, outcome narration lives in outcomeDm
  assert.equal(typeof b.outcome.answer, "number");
  E.KIDS._m.set("kid:zoe", JSON.stringify({ ...stored(E, "zoe"), quest: { ...stored(E, "zoe").quest, inventory: ["potion"] } }));
  b = await (await handleApi(post("/api/use", { kid: "zoe", item: "potion" }), E, fakeNebius)).json();
  assert.equal(b.effect, "potion"); assert.equal(b.quest.hearts, 3); assert.deepEqual(b.quest.inventory, []);
  b = await (await handleApi(post("/api/start", { kid: "zoe", hero: "willow" }), E, fakeNebius)).json();
  assert.equal(b.profile.quests, 1);                                        // resumed, not restarted
});

test("bad input is rejected", async () => {
  const E = env();
  assert.equal((await handleApi(post("/api/start", {}), E)).status, 400);
  assert.equal((await handleApi(post("/api/act", { kid: "a", action: "fight" }), E)).status, 400);   // no quest yet
  assert.equal((await handleApi(post("/api/answer", { kid: "a", answer: 1 }), E)).status, 400);
  assert.equal((await handleApi(new Request("http://t/api/nope?kid=a"), E)).status, 404);
});
