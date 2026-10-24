import assert from "node:assert/strict";
import { test } from "node:test";
import { isDcImage, isDcPage, safeFetch } from "./scrape.ts";

test("safeFetch refuses a redirect to a non-allowed host", async () => {
  const real = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (u: URL) => {
    seen.push(String(u));
    return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
  }) as typeof fetch;
  try {
    await assert.rejects(safeFetch("https://www.dcnicecar.com/showroom/?uid=1", 1000, isDcPage), /blocked URL/);
    assert.deepEqual(seen, ["https://www.dcnicecar.com/showroom/?uid=1"]);
  } finally {
    globalThis.fetch = real;
  }
});

test("image allowlist: same host, kboard_attached path, https only", () => {
  assert.ok(isDcImage(new URL("https://www.dcnicecar.com/wp-content/uploads/kboard_attached/1/a.jpg")));
  assert.ok(!isDcImage(new URL("https://www.dcnicecar.com/wp-admin/a.jpg")));
  assert.ok(!isDcImage(new URL("http://www.dcnicecar.com/wp-content/uploads/kboard_attached/1/a.jpg")));
  assert.ok(!isDcImage(new URL("https://evil.com/wp-content/uploads/kboard_attached/1/a.jpg")));
});
