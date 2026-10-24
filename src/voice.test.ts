import assert from "node:assert/strict";
import { test } from "node:test";
import { alignmentToWords, estimateWords, modelFor, tokenize } from "./voice.ts";

test("alignmentToWords groups characters into timed words", () => {
  const chars = [..."Hi  car!"];
  const start = chars.map((_, i) => i * 0.1);
  const end = chars.map((_, i) => i * 0.1 + 0.1);
  const words = alignmentToWords({ characters: chars, character_start_times_seconds: start, character_end_times_seconds: end });
  assert.deepEqual(words.map((w) => w.word), ["Hi", "car!"]);
  assert.equal(words[0].startSec, 0);
  assert.ok(Math.abs(words[0].endSec - 0.2) < 1e-9);
  assert.ok(Math.abs(words[1].startSec - 0.4) < 1e-9);
  assert.ok(Math.abs(words[1].endSec - 0.8) < 1e-9);
});

test("estimateWords spans the full duration proportionally", () => {
  const w = estimateWords("ab abcd", 3);
  assert.deepEqual(w.map((x) => x.word), ["ab", "abcd"]);
  assert.equal(w[0].startSec, 0);
  assert.equal(w[0].endSec, 1);
  assert.equal(w[1].endSec, 3);
});

test("zh: tokenize splits Chinese into characters, keeps Latin words and attaches punctuation", () => {
  assert.deepEqual(tokenize("快看！这台Lexus IS 350，"), ["快", "看！", "这", "台", "Lexus", "IS", "350，"]);
  assert.deepEqual(tokenize("两万九千美元。"), ["两", "万", "九", "千", "美", "元。"]);
});

test("zh: alignmentToWords splits Chinese characters without spaces", () => {
  const chars = [..."好车，私信"];
  const start = chars.map((_, i) => i * 0.2);
  const end = chars.map((_, i) => i * 0.2 + 0.2);
  const words = alignmentToWords({ characters: chars, character_start_times_seconds: start, character_end_times_seconds: end });
  assert.deepEqual(words.map((w) => w.word), ["好", "车，", "私", "信"]);
  assert.ok(Math.abs(words[1].startSec - 0.2) < 1e-9);
  assert.ok(Math.abs(words[1].endSec - 0.6) < 1e-9);
});

test("zh: estimateWords spreads Chinese tokens over the duration", () => {
  const w = estimateWords("好车好车", 2);
  assert.deepEqual(w.map((x) => x.word), ["好", "车", "好", "车"]);
  assert.equal(w[1].startSec, 0.5);
  assert.equal(w[3].endSec, 2);
});

test("modelFor forces a multilingual model for Chinese", () => {
  assert.equal(modelFor("你好", "eleven_flash_v2"), "eleven_multilingual_v2");
  assert.equal(modelFor("hello", "eleven_flash_v2"), "eleven_flash_v2");
  assert.equal(modelFor("你好", undefined), "eleven_multilingual_v2");
});

test("estimateWords anchors sentences to speech onsets and skips pauses", () => {
  // Two sentences; speech 0.2-1.0 s and 2.0-3.0 s with a pause between.
  const w = estimateWords("Hi there. Go now.", 3, [[0.2, 1.0], [2.0, 3.0]]);
  assert.equal(w[0].startSec, 0.2);
  assert.equal(w[2].word, "Go");
  assert.equal(w[2].startSec, 2);
  assert.ok(w[1].endSec <= 1.0, `first sentence must end before the pause, got ${w[1].endSec}`);
  assert.equal(w[3].endSec, 3);
});
