import { test } from "node:test";
import assert from "node:assert/strict";
import { handleApi, buildEncounter, pickMonster } from "../worker/index.js";
import { makeProblem } from "../src/math-engine.js";

// in-memory KV + fake Nebius
const kv = () => { const m = new Map(); return { get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const fakeNebius = (content) => async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const brokenNebius = async () => new Response("nope", { status: 500 });
const env = () => ({ KIDS: kv(), NEBIUS_API_KEY: "x" });
const post = (path, body) => new Request(`http://t${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const DM_OK = JSON.stringify({ narration: "A goblin hops out!", monster_line: "Beat my riddle!", hint_line: "Count on your fingers." });

test("encounter never leaks the answer and picks a monster of the right band", () => {
  const e = buildEncounter({ band: 3 }, 42, () => 0);
  assert.equal(e.answer, undefined);
  assert.equal(e.band, 3);
  assert.ok(e.text && e.hint && e.seed === 42);
  assert.equal(pickMonster(3, () => 0), pickMonster(3, () => 0));
});

test("start creates a profile and returns a Nemotron-narrated encounter", async () => {
  const E = env();
  const r = await handleApi(post("/api/start", { kid: "Ava!", hero: "Ember" }), E, fakeNebius(DM_OK));
  const b = await r.json();
  assert.equal(b.profile.kid, "ava");
  assert.equal(b.profile.hero, "ember");
  assert.equal(b.profile.band, 1);
  assert.equal(b.encounter.dm.source, "nemotron");
  assert.equal(b.encounter.dm.monster_line, "Beat my riddle!");
});

test("answer grades server-side, adapts band, and survives a Nebius outage", async () => {
  const E = env();
  await handleApi(post("/api/start", { kid: "max", hero: "kai" }), E, fakeNebius(DM_OK));
  // three correct answers in a row at band 1 -> band 2
  let profile;
  for (let seed = 1; seed <= 3; seed++) {
    const p = makeProblem(1, seed);
    const r = await handleApi(post("/api/answer", { kid: "max", band: 1, seed, monster: "goblin", answer: p.answer }), E, brokenNebius);
    const b = await r.json();
    assert.equal(b.correct, true);
    assert.equal(b.encounter.dm.source, "fallback");     // outage => canned lines, game keeps going
    profile = b.profile;
  }
  assert.equal(profile.band, 2);
  assert.equal(profile.correctTotal, 3);
  // a wrong answer is reported with the real answer and tracked as a weak family
  const p = makeProblem(2, 9);
  const r = await handleApi(post("/api/answer", { kid: "max", band: 2, seed: 9, monster: "slime", answer: "999" }), E, fakeNebius(DM_OK));
  const b = await r.json();
  assert.equal(b.correct, false);
  assert.equal(b.answer, p.answer);
  assert.equal(b.profile.weak[p.family], 1);
  const prof = await (await handleApi(new Request("http://t/api/profile?kid=max"), E)).json();
  assert.equal(prof.total, 4);
});

test("bad input is rejected", async () => {
  const E = env();
  assert.equal((await handleApi(post("/api/start", {}), E)).status, 400);
  assert.equal((await handleApi(post("/api/answer", { kid: "a", band: 9, seed: 1 }), E)).status, 400);
  assert.equal((await handleApi(new Request("http://t/api/nope"), E)).status, 404);
});
