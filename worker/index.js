// Math Quest Worker — quest API + static assets + voice.
//   POST /api/start  {kid, hero}          -> {profile, quest, dm}          (new or resumed quest, scene set)
//   POST /api/act    {kid, action}        -> {profile, quest, dm}          (problem now in quest.scene.problem)
//   POST /api/answer {kid, answer}        -> {profile, quest, outcome, dm} (next scene's dm included when a new scene starts)
//   POST /api/use    {kid, item}          -> {profile, quest, effect, dm?}
//   POST /api/say    {text, voice}        -> audio/mpeg (Workers AI, Deepgram Aura)
//   GET  /api/profile?kid=name            -> profile (+ quest)
// src/math-engine.js sets & grades every problem; src/quest.js owns the rules; the DM only narrates.
import { BANDS } from "../src/math-engine.js";
import { newQuest, chooseAction, resolveRoll, useItem, publicQuest, beatOf, ITEMS, ACTIONS } from "../src/quest.js";
import { LOCATIONS } from "../src/content.js";
import { narrate } from "./dm.js";
import monsters from "../public/monsters/manifest.json" with { type: "json" };

export const VOICES = { dm: "luna", monster: "arcas", hero: "stella" };
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
const byBand = (band) => { const p = monsters.filter((m) => m.band === band).map((m) => m.id); return p.length ? p : monsters.map((m) => m.id); };
const descOf = (id) => monsters.find((m) => m.id === id)?.desc;

async function load(env, kid) {
  const raw = await env.KIDS.get(`kid:${kid}`);
  return raw ? JSON.parse(raw) : { kid, band: 1, streak: 0, misses: 0, total: 0, correctTotal: 0, weak: {}, history: [], quests: 0, created: Date.now() };
}
const save = (env, p) => env.KIDS.put(`kid:${p.kid}`, JSON.stringify(p));
const dmArgs = (profile) => ({ hero: profile.hero, quest: profile.quest, monsterDesc: descOf(profile.quest.scene.monster), profile });
const view = (profile, extra = {}) => {
  const { quest, ...rest } = profile;
  const beat = quest ? beatOf(quest) : null;
  return json({ profile: { ...rest, bandName: BANDS[profile.band].name }, quest: publicQuest(quest), items: ITEMS, actions: ACTIONS,
                scene: beat ? { location: beat.location, place: LOCATIONS[beat.location].name, monsterName: beat.cast.name } : null, ...extra });
};

export async function handleApi(request, env, fetchImpl = fetch) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return json({}, 204);
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const kid = slug(request.method === "GET" ? url.searchParams.get("kid") : body.kid);

  if (url.pathname === "/api/profile" && request.method === "GET") {
    if (!kid) return json({ error: "kid required" }, 400);
    return view(await load(env, kid));
  }
  if (url.pathname === "/api/say" && request.method === "POST") return say(env, body);
  if (!kid) return json({ error: "kid required" }, 400);
  let profile = await load(env, kid);

  if (url.pathname === "/api/start" && request.method === "POST") {
    profile.hero = slug(body.hero) || profile.hero || "nova";
    if (!profile.quest || profile.quest.status !== "active") { profile.quest = newQuest(profile, byBand); profile.quests = (profile.quests || 0) + 1; }
    if (profile.quest.scene.phase === "roll") profile.quest.scene = { ...profile.quest.scene, phase: "choose", action: null, problem: null }; // abandoned roll
    await save(env, profile);
    const dm = await narrate(env, "scene", dmArgs(profile), fetchImpl);
    return view(profile, { dm });
  }

  if (url.pathname === "/api/act" && request.method === "POST") {
    if (!profile.quest) return json({ error: "no quest" }, 400);
    const r = chooseAction(profile.quest, profile, slug(body.action));
    if (r.error) return json(r, 400);
    profile.quest = r.quest; await save(env, profile);
    const dm = await narrate(env, "roll", { ...dmArgs(profile), action: r.quest.scene.action }, fetchImpl);
    return view(profile, { dm });
  }

  if (url.pathname === "/api/answer" && request.method === "POST") {
    if (!profile.quest) return json({ error: "no quest" }, 400);
    const before = profile.quest;
    const r = resolveRoll(before, profile, body.answer, byBand);
    if (r.error) return json(r, 400);
    profile = { ...r.profile, quest: r.quest }; await save(env, profile);
    // Narrate the outcome against the scene it happened in, then (if a new scene began) open the next one.
    const outcomeDm = await narrate(env, "result", { hero: profile.hero, quest: before, monsterDesc: descOf(before.scene.monster), profile,
                                                    action: r.outcome.action, outcome: r.outcome.kind, loot: r.outcome.loot ? ITEMS[r.outcome.loot].name : null,
                                                    clue: (r.quest.clues?.length > (before.clues?.length || 0)) ? r.quest.clues.at(-1) : null }, fetchImpl);
    const newScene = r.quest.scene.phase === "choose" && (r.quest.step !== before.step || r.outcome.kind === "heroDown");
    const sameSceneChoice = r.quest.scene.phase === "choose" && !newScene;
    const dm = newScene ? await narrate(env, "scene", dmArgs(profile), fetchImpl)
             : sameSceneChoice ? { ...(await narrate(env, "scene", dmArgs(profile), fetchImpl)), narration: null }   // fresh action labels, keep outcome narration
             : null;
    return view(profile, { outcome: r.outcome, outcomeDm, dm });
  }

  if (url.pathname === "/api/use" && request.method === "POST") {
    if (!profile.quest) return json({ error: "no quest" }, 400);
    const r = useItem(profile.quest, slug(body.item));
    if (r.error) return json(r, 400);
    profile.quest = r.quest; await save(env, profile);
    const dm = r.effect === "skip" ? await narrate(env, "scene", dmArgs(profile), fetchImpl) : null;
    return view(profile, { effect: r.effect, dm });
  }
  return json({ error: "not found" }, 404);
}

async function say(env, body) {
  const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (!text) return json({ error: "text required" }, 400);
  if (!env.AI) return json({ error: "no tts" }, 503);
  try {
    const audio = await env.AI.run("@cf/deepgram/aura-1", { text, speaker: VOICES[body.voice] || VOICES.dm, encoding: "mp3" }, { returnRawResponse: true });
    return new Response(audio.body, { status: 200, headers: { "content-type": "audio/mpeg", "cache-control": "no-store", "access-control-allow-origin": "*" } });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
};
