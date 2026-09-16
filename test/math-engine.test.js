import { test } from "node:test";
import assert from "node:assert/strict";
import { makeProblem, checkAnswer, recordResult, nextBand, BANDS } from "../src/math-engine.js";

test("every band produces a solvable problem, 200 seeds each", () => {
  for (const band of Object.keys(BANDS).map(Number)) {
    for (let seed = 1; seed <= 200; seed++) {
      const p = makeProblem(band, seed);
      assert.equal(p.band, band);
      assert.ok(p.text.length > 0 && p.hint.length > 0 && p.family);
      assert.ok(checkAnswer(p, p.answer), `${p.text} should accept its own answer ${p.answer}`);
      assert.ok(!checkAnswer(p, "banana"));
    }
  }
});

test("same seed => same problem (deterministic)", () => {
  assert.deepEqual(makeProblem(3, 42), makeProblem(3, 42));
  assert.notDeepEqual(makeProblem(3, 42).text, makeProblem(3, 43).text);
});

test("band 4 division always exact, band 2 never negative", () => {
  for (let s = 0; s < 500; s++) {
    const d = makeProblem(4, s);
    const [num, den] = d.text.split(" ÷ ").map(Number);
    assert.equal(num % den, 0);
    assert.ok(makeProblem(2, s).answer >= 0);
  }
});

test("fraction answers accept equivalent forms and whitespace", () => {
  const p = { answerType: "fraction", answer: "3/4" };
  assert.ok(checkAnswer(p, "3/4"));
  assert.ok(checkAnswer(p, " 6 / 8 "));
  assert.ok(!checkAnswer(p, "3/5"));
  assert.ok(!checkAnswer(p, "3/0"));
  assert.ok(checkAnswer({ answerType: "int", answer: 12 }, " 12 "));
  assert.ok(!checkAnswer({ answerType: "int", answer: 12 }, "12.0"));
});

test("adaptive banding: up after 3 hits, down after 2 misses, clamped 1-5", () => {
  let prof = { band: 1 };
  const p = makeProblem(1, 7);
  for (let i = 0; i < 3; i++) prof = recordResult(prof, p, true);
  assert.equal(prof.band, 2);
  assert.equal(prof.streak, 0);
  prof = recordResult(prof, p, false);
  prof = recordResult(prof, p, false);
  assert.equal(prof.band, 1);
  assert.equal(prof.weak[p.family], 2);
  assert.deepEqual(nextBand({ band: 1, misses: 5 }), { band: 1, streak: 0, misses: 5 });
  assert.deepEqual(nextBand({ band: 5, streak: 9 }), { band: 5, streak: 9, misses: 0 });
});
