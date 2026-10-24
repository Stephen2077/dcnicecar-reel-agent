import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Listing } from "./types.ts";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export type { Listing };

const MULTI_WORD_MAKES = ["Land Rover", "Alfa Romeo", "Aston Martin", "Rolls Royce", "Rolls-Royce"];

export function parseListingUrl(raw: string): { url: string; uid: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Not a valid URL: ${raw}`);
  }
  const host = u.hostname.replace(/^www\./, "");
  const uid = u.searchParams.get("uid");
  if (host !== "dcnicecar.com" || !uid || !/^\d+$/.test(uid)) {
    throw new Error(
      "Please pass a dcnicecar.com listing URL, e.g. https://www.dcnicecar.com/showroom/?mod=document&pageid=1&uid=1616",
    );
  }
  return { url: `https://www.dcnicecar.com/showroom/?mod=document&pageid=1&uid=${uid}`, uid };
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const toNumber = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function parseDetail(html: string, url: string, uid: string): Listing {
  const title = text(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
  if (!title) throw new Error(`Listing ${uid} not found (no title on page)`);

  const specs: Record<string, string> = {};
  const specBlock = html.match(/<h2>\s*Specification\s*<\/h2>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  for (const li of specBlock.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const label = text(li[1].match(/class="left"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
    const value = text(li[1].match(/class="right"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
    if (label && value) specs[label] = value;
  }

  const priceText = html.match(/class="(?:price|specPrice)"[^>]*>([^<]*)</)?.[1];
  const vin = html.match(/VIN:\s*([A-HJ-NPR-Z0-9]{17})\b/)?.[1] ?? null;

  const m = title.match(/^(\d{4})\s+(.+)$/);
  const year = m ? Number(m[1]) : toNumber(specs["Year"]);
  const rest = m ? m[2] : title;
  const multi = MULTI_WORD_MAKES.find((mk) => rest.toLowerCase().startsWith(mk.toLowerCase() + " "));
  const make = multi ?? (rest.split(" ")[0] || null);
  const model = make ? rest.slice(make.length).trim() || null : null;

  const imageUrls = [
    ...new Set(
      [...html.matchAll(/(?:https?:)?(?:\/\/www\.dcnicecar\.com)?\/wp-content\/uploads\/kboard_attached\/[^"'\s)<>]+\.(?:jpe?g|png|webp)/gi)].map(
        (x) => new URL(x[0], "https://www.dcnicecar.com").href.replace(/^http:/, "https:"),
      ),
    ),
  ];

  return {
    source: "dcnicecar", url, uid, title, year, make, model,
    price: toNumber(priceText),
    vin,
    mileage: toNumber(specs["Mileage"]),
    specs, imageUrls, images: [],
  };
}

export function slugFor(l: Pick<Listing, "uid" | "title">) {
  const s = l.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  return `${l.uid}-${s}`;
}

const DC_HOSTS = new Set(["www.dcnicecar.com", "dcnicecar.com"]);
export const isDcPage = (u: URL) => u.protocol === "https:" && DC_HOSTS.has(u.hostname) && !u.port;
export const isDcImage = (u: URL) => isDcPage(u) && u.pathname.startsWith("/wp-content/uploads/kboard_attached/");

// Redirects are followed manually so every hop is checked against `allow` (no SSRF via Location).
export async function safeFetch(url: string, ms: number, allow: (u: URL) => boolean, maxHops = 3) {
  let cur = new URL(url);
  for (let hop = 0; hop <= maxHops; hop++) {
    if (!allow(cur)) throw new Error(`blocked URL: ${cur.origin}${cur.pathname}`);
    const res = await fetch(cur, { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(ms) });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel();
      cur = new URL(loc, cur);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${cur.href}`);
    return res;
  }
  throw new Error(`too many redirects for ${url}`);
}

export async function downloadImage(url: string, dest: string, allow: (u: URL) => boolean = isDcImage): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await safeFetch(url, 60_000, allow);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error("image too small");
      await writeFile(dest, buf);
      return true;
    } catch (e) {
      if (attempt === 1) console.error(`skip image ${url}: ${(e as Error).message}`);
    }
  }
  return false;
}

export async function scrape(rawUrl: string, opts: { images?: number; outRoot?: string } = {}) {
  const { url, uid } = parseListingUrl(rawUrl);
  const n = Math.max(0, Math.min(8, Number.isFinite(opts.images) ? opts.images! : 8));
  const html = await (await safeFetch(url, 45_000, isDcPage)).text();
  const listing = parseDetail(html, url, uid);
  const slug = slugFor(listing);
  const dir = path.join(opts.outRoot ?? "out", slug);
  await mkdir(path.join(dir, "images"), { recursive: true });

  const picks = listing.imageUrls.slice(0, n);
  const results = await Promise.all(
    picks.map(async (u, i) => {
      const dest = path.join(dir, "images", `${String(i + 1).padStart(2, "0")}${path.extname(new URL(u).pathname) || ".jpg"}`);
      return (await downloadImage(u, dest)) ? dest : null;
    }),
  );
  listing.images = results.filter((x): x is string => x !== null);
  await writeFile(path.join(dir, "listing.json"), JSON.stringify(listing, null, 2));
  return { listing, slug, dir };
}
