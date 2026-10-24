import assert from "node:assert/strict";
import { test } from "node:test";
import { badge } from "./valuation.ts";

test("badge shows only when price is at least 1% below base", () => {
  assert.deepEqual(badge(9000, 10000), { show: true, pct: 10 });
  assert.deepEqual(badge(9950, 10000), { show: false, pct: 0 });
  assert.deepEqual(badge(11000, 10000), { show: false, pct: 0 });
});
