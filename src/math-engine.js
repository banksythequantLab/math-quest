// Math Quest — deterministic K-5 problem generator.
// The engine is the only thing that grades. The DM (Nemotron) only narrates.
// Bands: 1 counting/addition, 2 subtraction, 3 multiplication, 4 division, 5 fractions.

export const BANDS = {
  1: { name: "Counting & Addition", grade: "K-1" },
  2: { name: "Subtraction",         grade: "1-2" },
  3: { name: "Multiplication",      grade: "2-3" },
  4: { name: "Division",            grade: "3-4" },
  5: { name: "Fractions",           grade: "4-5" },
};

// Small seeded PRNG (mulberry32) so encounters are reproducible per seed.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Each generator returns { band, text, answer, answerType, family, hint }
// answerType: "int" or "fraction" (fraction answers are "n/d" in lowest terms).
const GEN = {
  1(r) {
    const a = pick(r, 1, 10), b = pick(r, 1, 10);
    return { text: `${a} + ${b}`, answer: a + b, family: `+${Math.max(a, b)}`,
             hint: `Start at ${a} and count up ${b} more.` };
  },
  2(r) {
    const a = pick(r, 2, 20), b = pick(r, 1, a);
    return { text: `${a} - ${b}`, answer: a - b, family: `-${b}`,
             hint: `Start at ${a} and count back ${b}.` };
  },
  3(r) {
    const a = pick(r, 2, 12), b = pick(r, 2, 12);
    return { text: `${a} × ${b}`, answer: a * b, family: `x${Math.max(a, b)}`,
             hint: `${a} × ${b} is ${a} groups of ${b}. Skip-count by ${b}.` };
  },
  4(r) {
    const b = pick(r, 2, 12), q = pick(r, 2, 12);
    return { text: `${b * q} ÷ ${b}`, answer: q, family: `/${b}`,
             hint: `How many ${b}s fit inside ${b * q}? Think ${b} × ? = ${b * q}.` };
  },
  5(r) {
    const d = pick(r, 2, 8), n1 = pick(r, 1, d - 1), n2 = pick(r, 1, d - 1);
    const n = n1 + n2, g = gcd(n, d);
    return { text: `${n1}/${d} + ${n2}/${d}`, answer: `${n / g}/${d / g}`, answerType: "fraction",
             family: `frac/${d}`, hint: `Same bottom number — add the tops: ${n1} + ${n2} = ${n}, over ${d}. Then simplify.` };
  },
};

export function makeProblem(band, seed = Date.now()) {
  if (!GEN[band]) throw new RangeError(`band must be 1-5, got ${band}`);
  const p = GEN[band](rng(seed));
  return { band, seed, answerType: "int", ...p };
}

// Normalise a kid's typed/spoken answer and compare. "6/8" == "3/4"; " 12 " == 12.
export function checkAnswer(problem, raw) {
  const s = String(raw ?? "").trim().replace(/\s+/g, "");
  if (problem.answerType === "fraction") {
    const m = s.match(/^(\d+)\/(\d+)$/);
    if (!m) return false;
    const n = +m[1], d = +m[2];
    if (!d) return false;
    const g = gcd(n, d);
    return `${n / g}/${d / g}` === problem.answer;
  }
  return /^-?\d+$/.test(s) && Number(s) === problem.answer;
}

// Adaptive band: move up after 3 correct in a row, down after 2 misses in a row.
export function nextBand(profile) {
  const { band = 1, streak = 0, misses = 0 } = profile;
  if (streak >= 3 && band < 5) return { band: band + 1, streak: 0, misses: 0 };
  if (misses >= 2 && band > 1) return { band: band - 1, streak: 0, misses: 0 };
  return { band, streak, misses };
}

export function recordResult(profile, problem, correct) {
  const weak = { ...(profile.weak || {}) };
  if (!correct) weak[problem.family] = (weak[problem.family] || 0) + 1;
  const history = [...(profile.history || []), { t: Date.now(), band: problem.band, family: problem.family, ok: correct }].slice(-200);
  const updated = {
    ...profile, weak, history,
    streak: correct ? (profile.streak || 0) + 1 : 0,
    misses: correct ? 0 : (profile.misses || 0) + 1,
    total: (profile.total || 0) + 1,
    correctTotal: (profile.correctTotal || 0) + (correct ? 1 : 0),
  };
  return { ...updated, ...nextBand(updated) };
}
