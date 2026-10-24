// Photos source: uploaded car photos → Grok vision → listing.json (source: "photos").
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";

export const VISION_MODEL = "spacexai/grok-4.20-non-reasoning";
const MIN_CONF = 0.7;
const EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

const conf = z.coerce.number().min(0).max(1).catch(0);
export const VisionSchema = z.object({
  make: z.string().nullable().catch(null),
  model: z.string().nullable().catch(null),
  yearRange: z.string().nullable().catch(null),
  color: z.string().nullable().catch(null),
  confidence: z
    .object({ make: conf, model: conf, yearRange: conf, color: conf })
    .catch({ make: 0, model: 0, yearRange: 0, color: 0 }),
  highlights: z.array(z.string()).catch([]),
  shotOrder: z.array(z.coerce.number().int()).catch([]),
  labels: z.array(z.string()).catch([]),
});
export type Vision = z.infer<typeof VisionSchema>;

export interface Overrides {
  price?: number;
  mileage?: number;
  yearModel?: string;
  contact?: string;
  vin?: string;
}

export interface PhotoListing {
  source: "photos";
  url: null;
  uid: string;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  price: number | null;
  vin: string | null;
  mileage: number | null;
  contact?: string;
  specs: Record<string, string>;
  imageUrls: string[];
  images: string[];
}

/** Drop any vision field whose confidence is below the threshold. */
export function confidentFields(v: Vision) {
  const pick = (k: "make" | "model" | "yearRange" | "color") =>
    v[k] && v.confidence[k] >= MIN_CONF ? v[k]!.trim() || null : null;
  return { make: pick("make"), model: pick("model"), yearRange: pick("yearRange"), color: pick("color") };
}

/** Valid permutation of 0..n-1: model order first (deduped, in range), then any images it forgot. */
export function normalizeOrder(order: number[], n: number) {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const i of order) if (i >= 0 && i < n && !seen.has(i)) (seen.add(i), out.push(i));
  for (let i = 0; i < n; i++) if (!seen.has(i)) out.push(i);
  return out;
}

/** "2024 Honda Accord Hybrid" → {year, make, model}. Year only if a 4-digit 19xx/20xx is present. */
export function parseYearModel(s: string) {
  const m = s.trim().match(/^(?:((?:19|20)\d{2})\s+)?(\S+)?\s*(.*)$/);
  const year = m?.[1] ? Number(m[1]) : null;
  return { year, make: m?.[2] || null, model: m?.[3]?.trim() || null };
}

export function buildListing(v: Vision, o: Overrides, uid: string, images: string[]): PhotoListing {
  const c = confidentFields(v);
  // Photos can't pin a model year (adjacent years look identical; measured: 2024 Accord → "2023" @0.9),
  // so the year only ever comes from the user. vision.yearRange stays in vision.json for reference.
  let year: number | null = null;
  let make = c.make;
  let model = c.model;
  let title = [make, model].filter(Boolean).join(" ");
  if (o.yearModel?.trim()) {
    ({ year, make, model } = parseYearModel(o.yearModel));
    title = o.yearModel.trim();
  }
  if (!title) title = "Pre-owned vehicle";

  const specs: Record<string, string> = {};
  if (year) specs.Year = String(year);
  if (o.mileage != null) specs.Mileage = o.mileage.toLocaleString("en-US");
  if (c.color) specs["Exterior Color"] = c.color;
  const hl = v.highlights.map((h) => h.trim()).filter(Boolean).slice(0, 6);
  if (hl.length) specs.Highlights = hl.join(", ");

  const listing: PhotoListing = {
    source: "photos",
    url: null,
    uid,
    title,
    year,
    make,
    model,
    price: o.price ?? null,
    vin: o.vin?.trim().toUpperCase() || null,
    mileage: o.mileage ?? null,
    specs,
    imageUrls: [],
    images,
  };
  if (o.contact?.trim()) listing.contact = o.contact.trim();
  return listing;
}

export async function listPhotos(dir: string) {
  const names = (await fs.readdir(dir)).filter((f) => EXTS.has(path.extname(f).toLowerCase())).sort();
  const usable: string[] = [];
  for (const f of names) {
    const p = path.join(dir, f);
    // sharp may lack a HEIF decoder; skip what it can't read instead of failing the job.
    try {
      await sharp(p).metadata();
      usable.push(p);
    } catch {
      console.error(`skipping unreadable image ${f}`);
    }
  }
  return usable;
}

async function toDataUrl(file: string, px: number) {
  const buf = await sharp(file).rotate().resize(px, px, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function visionPrompt(n: number) {
  return `You are looking at ${n} photos of ONE used car for sale, numbered 0..${n - 1} in the order given.
Return ONLY a JSON object:
{"make": string|null, "model": string|null, "yearRange": string|null (e.g. "2023-2025" or "2024"), "color": string|null (exterior),
 "confidence": {"make":0-1,"model":0-1,"yearRange":0-1,"color":0-1},
 "highlights": [up to 6 short facts clearly VISIBLE in the photos, e.g. "sunroof", "black leather seats", "digital cluster"],
 "shotOrder": [all indices 0..${n - 1} ordered for a showroom video: front 3/4, side, rear 3/4, wheels, interior dash, seats, cluster, trunk, other],
 "labels": [one short label per image in the original order, e.g. "front 3/4"]}
Rules: use null when unsure. Never guess mileage, price, trim level or VIN. Model = model name only (e.g. "Accord"), no year.`;
}

export async function callVision(files: string[]): Promise<Vision> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY is not set");
  const images = await Promise.all(files.map((f) => toDataUrl(f, 768)));
  const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROK_VISION_MODEL || VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: visionPrompt(files.length) },
            ...images.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(Number(process.env.GROK_TIMEOUT_MS) || 120_000),
  });
  if (!res.ok) throw new Error(`AI Gateway HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const raw = data.choices[0].message.content.replace(/^```(?:json)?\s*|\s*```$/g, "");
  return VisionSchema.parse(JSON.parse(raw));
}

export function slugForPhotos(title: string, uid: string) {
  const t = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `photos-${uid}${t ? `-${t}` : ""}`;
}

export interface PhotosOpts extends Overrides {
  outRoot?: string;
  slug?: string;
  /** Reuse a previous vision.json instead of calling the model again. */
  visionFile?: string;
}

export async function listingFromPhotos(photosDir: string, opts: PhotosOpts = {}) {
  const files = await listPhotos(photosDir);
  if (files.length < 3) throw new Error(`need at least 3 readable photos, found ${files.length}`);
  if (files.length > 12) throw new Error(`at most 12 photos, found ${files.length}`);

  const vision = opts.visionFile
    ? VisionSchema.parse(JSON.parse(await fs.readFile(opts.visionFile, "utf8")))
    : await callVision(files);
  const order = normalizeOrder(vision.shotOrder, files.length);

  const uid = Date.now().toString(36);
  const draft = buildListing(vision, opts, uid, []);
  const slug = opts.slug ?? slugForPhotos(draft.title, uid);
  const dir = path.join(opts.outRoot ?? "out", slug);
  const imgDir = path.join(dir, "images");
  await fs.rm(imgDir, { recursive: true, force: true });
  await fs.mkdir(imgDir, { recursive: true });
  const images: string[] = [];
  for (const [k, i] of order.entries()) {
    const dest = path.join(imgDir, `${String(k + 1).padStart(2, "0")}.jpg`);
    await sharp(files[i]).rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86 }).toFile(dest);
    images.push(dest);
  }
  const listing = { ...draft, images };
  await fs.writeFile(path.join(dir, "vision.json"), JSON.stringify(vision, null, 2));
  await fs.writeFile(path.join(dir, "listing.json"), JSON.stringify(listing, null, 2));
  return { listing, vision, dir, slug };
}
