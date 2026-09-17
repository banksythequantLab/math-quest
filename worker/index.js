// Math Quest Worker — API + static assets.
//   POST /api/start   {kid, hero}                 -> {profile, encounter}
//   POST /api/answer  {kid, band, seed, monster, answer} -> {correct, answer, profile, encounter}
//   GET  /api/profile?kid=name                    -> profile
// The math engine (src/) is the single source of truth for problems and grading.
import { makeProblem, checkAnswer, recordResult, BANDS } from "../src/math-engine.js";
import { narrate } from "./dm.js";
import monsters from "../public/monsters/manifest.json" with { type: "json" };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);

export function pickMonster(band, rnd = Math.random) {
  const pool = monsters.filter((m) => m.band === band);
  const list = pool.length ? pool : monsters;
  return list[Math.floor(rnd() * list.length)].id;
}

async function loadProfile(env, kid) {
  const raw = await env.KIDS.get(`kid:${kid}`);
  return raw ? JSON.parse(raw) : { kid, band: 1, streak: 0, misses: 0, total: 0, correctTotal: 0, weak: {}, created: Date.now() };
}
const saveProfile = (env, p) => env.KIDS.put(`kid:${p.kid}`, JSON.stringify(p));

export function buildEncounter(profile, seed = Date.now(), rnd = Math.random) {
  const monster = pickMonster(profile.band, rnd);
  const problem = makeProblem(profile.band, seed);
  const { answer, ...safe } = problem;               // never ship the answer to the client
  return { monster, bandName: BANDS[profile.band].name, ...safe };
}

export async function handleApi(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return json({}, 204);

  if (url.pathname === "/api/profile" && request.method === "GET") {
    const kid = slug(url.searchParams.get("kid"));
    if (!kid) return json({ error: "kid required" }, 400);
    return json(await loadProfile(env, kid));
  }

  if (url.pathname === "/api/start" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const kid = slug(body.kid);
    if (!kid) return json({ error: "kid required" }, 400);
    const profile = await loadProfile(env, kid);
    profile.hero = slug(body.hero) || profile.hero || "nova";
    await saveProfile(env, profile);
    const encounter = buildEncounter(profile);
    const dm = await narrate(env, { hero: profile.hero, monster: encounter.monster, band: profile.band, event: "start" }, fetchImpl);
    return json({ profile, encounter: { ...encounter, dm } });
  }

  if (url.pathname === "/api/answer" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const kid = slug(body.kid);
    const band = Number(body.band), seed = Number(body.seed);
    if (!kid || !(band >= 1 && band <= 5) || !Number.isFinite(seed)) return json({ error: "kid, band, seed required" }, 400);
    const problem = makeProblem(band, seed);            // regenerate server-side: deterministic
    const correct = checkAnswer(problem, body.answer);
    let profile = await loadProfile(env, kid);
    profile = recordResult(profile, problem, correct);
    await saveProfile(env, profile);
    const encounter = buildEncounter(profile);
    const dm = await narrate(env, { hero: profile.hero, monster: encounter.monster, band: profile.band, event: "next",
                                    lastResult: { correct, monster: slug(body.monster) || "monster" } }, fetchImpl);
    return json({ correct, answer: problem.answer, profile, encounter: { ...encounter, dm } });
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
