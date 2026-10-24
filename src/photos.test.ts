import { test } from "node:test";
import assert from "node:assert/strict";
import { buildListing, normalizeOrder, parseYearModel, VisionSchema } from "./sources/photos.ts";

const vision = VisionSchema.parse({
  make: "Honda",
  model: "Accord",
  yearRange: "2023",
  color: "black",
  confidence: { make: 0.95, model: 0.8, yearRange: 0.9, color: 0.5 },
  highlights: ["sunroof", " black leather seats "],
  shotOrder: [2, 0, 2, 9],
  labels: [],
});

test("low-confidence fields are dropped, vision never sets year/price/mileage/vin", () => {
  const l = buildListing(vision, {}, "u1", []);
  assert.equal(l.title, "Honda Accord");
  assert.equal(l.year, null);
  assert.equal(l.price, null);
  assert.equal(l.mileage, null);
  assert.equal(l.vin, null);
  assert.equal(l.specs["Exterior Color"], undefined); // color conf 0.5 < 0.7
  assert.equal(l.specs.Highlights, "sunroof, black leather seats");
  assert.equal(l.source, "photos");
});

test("user fields override vision", () => {
  const l = buildListing(vision, { yearModel: "2024 Toyota Camry SE", price: 25000, mileage: 12000, vin: "abc123", contact: " 555-1234 " }, "u1", []);
  assert.equal(l.title, "2024 Toyota Camry SE");
  assert.deepEqual([l.year, l.make, l.model], [2024, "Toyota", "Camry SE"]);
  assert.equal(l.price, 25000);
  assert.equal(l.specs.Mileage, "12,000");
  assert.equal(l.vin, "ABC123");
  assert.equal(l.contact, "555-1234");
});

test("nothing confident → generic title", () => {
  const v = VisionSchema.parse({ make: "Honda", model: "Accord", confidence: { make: 0.3, model: 0.2 } });
  assert.equal(buildListing(v, {}, "u", []).title, "Pre-owned vehicle");
});

test("garbage model output is coerced, not thrown", () => {
  const v = VisionSchema.parse({ confidence: "high", highlights: "x", shotOrder: null });
  assert.deepEqual(v.highlights, []);
  assert.equal(v.confidence.make, 0);
});

test("shot order becomes a full permutation", () => {
  assert.deepEqual(normalizeOrder([2, 0, 2, 9, -1], 4), [2, 0, 1, 3]);
  assert.deepEqual(normalizeOrder([], 3), [0, 1, 2]);
});

test("parseYearModel", () => {
  assert.deepEqual(parseYearModel("Honda Accord"), { year: null, make: "Honda", model: "Accord" });
  assert.deepEqual(parseYearModel(" 2021 Lexus "), { year: 2021, make: "Lexus", model: null });
});

test("colour chip labels only the colours present", async () => {
  const { chipsFor } = await import("./render.ts");
  const l = { mileage: null, specs: { "Exterior Color": "BLACK" } } as unknown as Parameters<typeof chipsFor>[0];
  assert.deepEqual(chipsFor(l, "zh", 2)[1], { label: "外观", value: "黑" });
});
