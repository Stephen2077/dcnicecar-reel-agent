import assert from "node:assert/strict";
import { test } from "node:test";
import { check, checkNumbers, cnToInt, extractNumbers, factsFor, type Script } from "./script.ts";
import type { Listing } from "./types.ts";

const listing = (o: Partial<Listing> = {}): Listing => ({
  source: "dcnicecar", url: null, uid: "t", title: "Honda Accord", year: null, make: "Honda", model: "Accord",
  price: null, vin: null, mileage: null, specs: {}, imageUrls: [], images: ["a.jpg"], ...o,
});
const zhNarr = "这台本田雅阁真的很能打。".repeat(10); // 110 Han chars: below the old 115 floor
const script = (o: { narration?: string; text?: string; xhs?: string } = {}): Script => ({
  xiaohongshu: { title: "雅阁", body: (o.xhs ?? "这台本田雅阁开起来很稳，省油又安静，私信我们预约试驾吧") + " 🚗✨🔥 #纽约二手车 #DCNiceCar #本田 #雅阁 #二手车" },
  narration: o.narration ?? zhNarr,
  shots: Array.from({ length: 5 }, () => ({ imageIndex: 0, durationSec: 6, onScreenText: o.text ?? "本田雅阁", move: "push-in" as const })),
  marketplace: { title: "Honda Accord", body: "Message for test drive" },
});

test("accepts a clean script when price/mileage/year are null", () => {
  assert.equal(check(script(), factsFor(listing()), "zh"), null);
});

test("zh length accepts 95-160 Han chars", () => {
  assert.match(check(script({ narration: "这台本田雅阁很能打。".repeat(10) }), factsFor(listing()), "zh")!, /90 Chinese/);
  assert.equal(check(script({ narration: "这台本田雅阁很能打。".repeat(16) }), factsFor(listing()), "zh"), null);
});

test("rejects mileage/price/year values when the field is null", () => {
  const f = factsFor(listing());
  assert.match(check(script({ text: "27,739 miles" }), f, "zh")!, /no mileage/);
  assert.match(check(script({ xhs: "只跑了两万七千多英里，开起来很稳，私信我们预约试驾吧" }), f, "zh")!, /no mileage/);
  assert.match(check(script({ text: "$29,980" }), f, "zh")!, /no price/);
  assert.match(check(script({ xhs: "只要两万九千九百八十美元，开起来很稳，私信我们预约试驾" }), f, "zh")!, /no price/);
  assert.match(check(script({ text: "2024 款" }), f, "zh")!, /no year/);
  assert.match(check(script({ xhs: "二四年款雅阁，开起来很稳，省油又安静，私信我们预约试驾吧" }), f, "zh")!, /no year/);
});

test("allows those values when the listing has them", () => {
  const f = factsFor(listing({ price: 29980, mileage: 27739, year: 2024 }));
  const s = script({ text: "27,739英里" });
  s.marketplace.body = "$29,980\n27,739 miles\nMessage for test drive";
  assert.equal(check(s, f, "zh"), null);
});

test("rejects unverifiable condition/availability claims", () => {
  const f = factsFor(listing());
  assert.match(check(script({ xhs: "车子保持得很新，开起来很稳，省油又安静，私信我们预约试驾吧" }), f, "zh")!, /保持得很新/);
  assert.match(check(script({ text: "practically brand new" }), f, "zh")!, /not stated/);
});

const accord = () => factsFor(listing({ title: "2024 Honda Accord Hybrid Sport", price: 29980, mileage: 27739, year: 2024, vin: "1HGCY2F55RA028521", specs: { Mileage: "27,739", Engine: "4C" } }));

test("cnToInt parses spoken and digit-by-digit Chinese numerals", () => {
  assert.equal(cnToInt("两万七千七百三十九"), 27739);
  assert.equal(cnToInt("七千"), 7000);
  assert.equal(cnToInt("二四"), 24);
  assert.equal(cnToInt("二〇二四"), 2024);
  assert.equal(cnToInt("十五"), 15);
});

test("number fidelity: only verbatim listing values pass", () => {
  const f = accord();
  const n = (narration: string) => checkNumbers(script({ narration }), f);
  assert.equal(n("才跑了27,739英里，只要$29,980，2024款，四缸，24款雅阁，VIN 1HGCY2F55RA028521"), null);
  assert.match(n("才跑了七千多英里")!, /七千多/);
  assert.match(n("里程只有3万")!, /3万/);
  assert.match(n("两万七千多英里")!, /两万七千多/);
  assert.match(n("仅2.7万英里")!, /2\.7万/);
  assert.match(n("才27k英里")!, /27k/);
  assert.match(n("才28,000 miles")!, /28,000/);
  assert.match(n("二三年款")!, /二三年/);
  assert.match(checkNumbers({ ...script(), shots: script({ text: "仅2.7万英里" }).shots }, f)!, /2\.7万/);
});

test("extractNumbers ignores everyday words with numerals", () => {
  assert.deepEqual(extractNumbers("一起来看看这一台二手车，千万别错过，十分省油"), []);
});
