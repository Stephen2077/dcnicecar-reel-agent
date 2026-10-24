import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Listing } from "./types.ts";

export type Lang = "zh" | "en";
export function parseLang(v: string | undefined): Lang {
  if (v === undefined || v === "zh" || v === "en") return v ?? "zh";
  throw new Error(`--lang must be zh or en, got "${v}"`);
}

export const ScriptSchema = z.object({
  xiaohongshu: z.object({ title: z.string().max(20), body: z.string().min(1) }),
  narration: z.string().min(1),
  shots: z
    .array(
      z.object({
        imageIndex: z.number().int().min(0),
        durationSec: z.number().positive(),
        onScreenText: z.string().min(1),
        move: z.enum(["push-in", "pull-out", "pan-left", "pan-right"]),
      }),
    )
    .min(5)
    .max(6),
  marketplace: z.object({ title: z.string().min(1), body: z.string().min(1) }),
  // Optional render hints, usually only set in response to a --tweak.
  style: z
    .object({ priceScale: z.number().min(1).max(1.6).optional(), hookStyle: z.string().max(40).optional() })
    .optional(),
});
export type Script = z.infer<typeof ScriptSchema>;

// Facts the model may use. Deliberately excludes anything valuation-related except the badge pct.
export function factsFor(l: Listing, badgePct?: number) {
  return {
    title: l.title,
    year: l.year,
    make: l.make,
    model: l.model,
    price: l.price,
    mileage: l.mileage,
    vin: l.vin,
    specs: l.specs,
    imageCount: l.images.length,
    ...(badgePct ? { pricedBelowMarket: true } : {}),
  };
}

// Listing fields that may be null: the prompt forbids them and check() rejects any trace of a value.
const ZH_NUM = "[0-9零〇一二两三四五六七八九十百千万]";
export const MISSING: { key: "price" | "mileage" | "year"; rule: string; leak: RegExp }[] = [
  {
    key: "price",
    rule: "No price is given: do not state or guess any price or dollar amount; say to message for price.",
    leak: new RegExp(`\\$\\s?\\d|\\d[\\d,.]*\\s*k?\\s*(dollars|usd|bucks)|${ZH_NUM}+\\s*(美元|美金|刀|块)`, "i"),
  },
  {
    key: "mileage",
    rule: "No mileage is given: do not state or guess any mileage or odometer number.",
    leak: new RegExp(`\\d[\\d,.]*\\s*k?\\s*(miles?|mi)\\b|${ZH_NUM}+\\s*多?\\s*(英里|公里|迈)`, "i"),
  },
  {
    key: "year",
    rule: "No model year is given: do not state or guess any year.",
    leak: /\b(19|20)\d{2}\b|[一二][九零〇][零〇一二三四五六七八九]{2}年|[零〇一二三四五六七八九]{2}年款/,
  },
];

// Condition/availability claims we can't verify from a listing; allowed only if FACTS say so verbatim.
const UNVERIFIABLE = /practically (brand )?new|like new|brand new|mint condition|showroom condition|flawless|perfect condition|in stock|on (our|the) lot|保持得?很新|跟新车一样|准新车|车况完美|就在店里|现车/i;

function narrationRules(facts: ReturnType<typeof factsFor>, lang: Lang) {
  const en = [facts.year ? "year" : "", "make/model", facts.mileage ? "mileage" : "", facts.price ? "price" : ""].filter(Boolean);
  const zh = [facts.year ? "年份" : "", "品牌/车型", facts.mileage ? "里程" : "", facts.price ? "价格" : ""].filter(Boolean);
  if (lang === "en")
    return `- narration: English, 65-80 words, a punchy social-reel voice-over (30 seconds), NOT a spec readout.
  - First sentence is a hook of at most 8 words.
  - Short, punchy sentences. Mention ${en.join(", ")} exactly once each, using the exact values from FACTS${facts.price ? ' (price with "$" and thousands commas)' : ""}.
  - Pick only 2-3 highlights from the specs; don't list them all.
  - NEVER say the VIN in narration.
  - Expand site shorthand: "4C" = 4-cylinder, "4D" = 4-door sedan, "AUTO" = automatic, "GASLINE" = gas. Unknown codes: omit.
  - End with a call to action to message DC Nice Car.`;
  return `- narration: 普通话口语，120-150 个汉字（约 30 秒），小红书卖车短视频口播，不要念参数表。
  - 第一句是钩子，不超过 12 个字。
  - 短句、口语化。${zh.join("、")}各提一次，数值必须来自 FACTS。
  - 所有数字一律用阿拉伯数字，并且与 FACTS 中的值一字不差（价格写成"$29,980"这种格式，里程写成"27,739英里"，年份写成"2024款"）。不要四舍五入、不要"X万""X千多""将近"之类的约数、不要汉字数字；不确定的数字就不写。
  - 只挑 2-3 个亮点。绝不念 VIN。
  - 英文缩写要展开：4C=四缸，4D=四门轿车，AUTO=自动挡，GASLINE=汽油；不认识的代码省略。
  - 结尾号召私信 DC Nice Car。`;
}

function prompt(facts: ReturnType<typeof factsFor>, lang: Lang, tweak?: string) {
  return `You write short-form car video scripts for a used-car dealer (DC Nice Car).
Return ONLY a JSON object with this exact shape:
{"xiaohongshu": {"title": string, "body": string}, "narration": string, "shots": [{"imageIndex": int, "durationSec": number, "onScreenText": string, "move": "push-in"|"pull-out"|"pan-left"|"pan-right"}], "marketplace": {"title": string, "body": string}, "style"?: {"priceScale"?: number, "hookStyle"?: string}}

Rules:
${narrationRules(facts, lang)}
- shots: 5 or 6 items, durationSec values sum to exactly 30, imageIndex is 0-based and < ${facts.imageCount}, ${lang === "zh" ? "onScreenText 中文，最多 8 个字符（字母也算一个字符，如\"私信DC\"已是 4 个）" : "onScreenText max 5 words"}, vary the move${facts.imageCount < 5 ? ` (only ${facts.imageCount} image(s): reuse them, give each shot a different move and text)` : ""}.
- xiaohongshu is the PRIMARY output and is always Chinese, whatever the narration language. xiaohongshu.title: Chinese, at most 20 characters. xiaohongshu.body: Chinese, 种草口吻,${facts.mileage ? " mention mileage," : ""}${facts.price ? " mention price," : ""} 3-5 emoji, end with 5-8 hashtags that include #纽约二手车 and #DCNiceCar.
- marketplace.title and body: always plain English, short lines separated by "\n". body must include${facts.price ? " the price," : ""}${facts.mileage ? " the mileage," : ""}${facts.vin ? " the VIN," : ""} the line "Message for test drive". Format numbers with thousands commas.
- NUMBERS: every number anywhere in the output (narration, onScreenText, xiaohongshu, marketplace) must be copied verbatim from FACTS (price, mileage, year or its 2-digit form, VIN, digits in the title/specs such as "IS 350"). Write numbers as Arabic digits exactly as in FACTS (e.g. "27,739英里", "$29,980"), never rounded or approximated ("3万", "2.7万", "两万七千多", "27k", "almost 28,000" are all forbidden). If a number isn't in FACTS, leave it out.
- ONLY state facts present in FACTS below. Do not invent features, options, history, condition, warranty, or financing. No financing claims at all.
- Never claim condition or availability that FACTS don't state (no "like new", "practically brand new", "保持得很新", "in stock / 就在店里").
${MISSING.filter((m) => facts[m.key] == null).map((m) => `- ${m.rule}`).join("\n")}
- ${facts.pricedBelowMarket ? 'You may say "priced below market", but never mention any reference or market dollar amount.' : "Do not make any market-price comparison."}

- style is optional; omit it unless the revision request below asks for a visual change. style.priceScale (1-1.6) enlarges the on-screen price; style.hookStyle is one of "fragments" (default, title arrives word by word), "punch" (one big slam), "typewriter".
${tweak ? `\nREVISION REQUEST from the dealer (apply it, keep every rule above): ${tweak.slice(0, 300)}\n` : ""}
FACTS:
${JSON.stringify(facts, null, 2)}`;
}

// Measured 2026-10-24 on uid 1616 (see README-dev.md); fastest model that passed validation.
export const DEFAULT_MODEL = "spacexai/grok-4.20-non-reasoning";

// Slower but more reliable; used for one last attempt when the fast model keeps failing validation.
export const FALLBACK_MODEL = "spacexai/grok-4.7";

async function callGrok(messages: { role: string; content: string }[], model = process.env.GROK_MODEL || DEFAULT_MODEL) {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY is not set");
  const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(Number(process.env.GROK_TIMEOUT_MS) || 240_000),
  });
  if (!res.ok) throw new Error(`AI Gateway HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

// Extra checks zod can't express on its own.
const hanCount = (t: string) => t.match(/\p{Script=Han}/gu)?.length ?? 0;

// Number fidelity: every number in user-facing copy must equal a listing value (no rounding/paraphrase).
const CN_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
// Everyday words that contain numerals but aren't quantities.
const CN_IDIOMS = /千万|万一|万能|一一|十分|十足|百分百|百搭|一[下样起定点些直次切路眼句款台辆位个种手见]|[唯第统]一|二手|三思/g;

export function cnToInt(t: string): number {
  if (![...t].some((c) => c in CN_UNIT)) return Number([...t].map((c) => CN_DIGIT[c]).join("")); // 二四 -> 24, 二〇二四 -> 2024
  let total = 0, section = 0, digit = 0;
  for (const c of t) {
    if (c in CN_DIGIT) digit = CN_DIGIT[c];
    else if (c === "万") { total += (section + digit) * 10000; section = 0; digit = 0; }
    else { section += (digit || 1) * CN_UNIT[c]; digit = 0; }
  }
  return total + section + digit;
}

export function extractNumbers(text: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = [];
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([万千kK](?![a-zA-Z]))?/g)) {
    const mult = { 万: 10000, 千: 1000, k: 1000, K: 1000 }[m[2] as "万"] ?? 1;
    out.push({ raw: m[0].trim(), value: Number(m[1].replace(/,/g, "")) * mult });
  }
  const cn = text.replace(CN_IDIOMS, (w) => " ".repeat(w.length));
  // A Chinese numeral run counts if it has 2+ chars or is followed by a quantity unit (一缸 is odd, 四缸 = 4).
  for (const m of cn.matchAll(/[零〇一二两三四五六七八九十百千万]+(?=(英里|公里|迈|美元|美金|刀|块|年|缸|门|座|多|来)?)/g))
    if (m[0].length > 1 || m[1]) out.push({ raw: m[0] + (m[1] ?? ""), value: cnToInt(m[0]) });
  return out;
}

export function allowedNumbers(facts: ReturnType<typeof factsFor>): Set<number> {
  const set = new Set<number>();
  for (const n of [facts.price, facts.mileage, facts.year]) if (n != null) set.add(n);
  if (facts.year) set.add(facts.year % 100);
  const text = [facts.title, facts.make, facts.model, ...Object.values(facts.specs)].join(" ");
  for (const m of text.matchAll(/\d[\d,]*/g)) set.add(Number(m[0].replace(/,/g, "")));
  return set;
}

export function checkNumbers(s: Script, facts: ReturnType<typeof factsFor>): string | null {
  const allowed = allowedNumbers(facts);
  const fields = [s.narration, s.xiaohongshu.title, s.xiaohongshu.body, s.marketplace.title, s.marketplace.body, ...s.shots.map((x) => x.onScreenText)];
  for (const f of fields) {
    const t = facts.vin ? f.replaceAll(facts.vin, " ") : f;
    const bad = extractNumbers(t).find((n) => !allowed.has(n.value));
    if (bad) return `number "${bad.raw}" is not a listing value; copy numbers verbatim from FACTS as Arabic digits (e.g. ${facts.mileage ? `"${facts.mileage.toLocaleString("en-US")}英里"` : '"$29,980"'}) or omit it`;
  }
  return null;
}

export function check(s: Script, facts: ReturnType<typeof factsFor>, lang: Lang): string | null {
  const all = JSON.stringify(s);
  for (const m of MISSING) if (facts[m.key] == null && m.leak.test(all)) return `listing has no ${m.key}: remove every ${m.key} value (${all.match(m.leak)![0]})`;
  const claim = all.match(UNVERIFIABLE)?.[0];
  if (claim && !JSON.stringify(facts).toLowerCase().includes(claim.toLowerCase())) return `"${claim}" is not stated in FACTS; remove it`;
  if (lang === "zh") {
    const n = hanCount(s.narration);
    if (n < 95 || n > 160) return `narration has ${n} Chinese characters, need 120-150`;
    const long = s.shots.find((x) => [...x.onScreenText.replace(/\s/g, "")].length > 8);
    if (long) return `onScreenText "${long.onScreenText}" must be <= 8 characters`;
  } else {
    const words = s.narration.trim().split(/\s+/).length;
    if (words < 65 || words > 80) return `narration has ${words} words, need 65-80`;
    const long = s.shots.find((x) => x.onScreenText.trim().split(/\s+/).length > 5);
    if (long) return `onScreenText "${long.onScreenText}" must be <= 5 words`;
  }
  const numErr = checkNumbers(s, facts);
  if (numErr) return numErr;
  if (hanCount(s.xiaohongshu.body) < 20) return "xiaohongshu.body must be written in Chinese";
  if (/auction|拍卖|\bm{2}r\b|man[h]eim/i.test(JSON.stringify(s))) return "no auction-source references allowed";
  if (facts.vin && s.narration.toUpperCase().includes(facts.vin.toUpperCase())) return "narration must not include the VIN";
  const total = s.shots.reduce((a, x) => a + x.durationSec, 0);
  if (Math.abs(total - 30) > 0.01) return `shot durations sum to ${total}, must be 30`;
  const bad = s.shots.find((x) => x.imageIndex >= facts.imageCount);
  if (bad) return `imageIndex ${bad.imageIndex} out of range (have ${facts.imageCount} images)`;
  if (!/message for test drive/i.test(s.marketplace.body)) return 'marketplace.body must include "Message for test drive"';
  if (facts.vin && !s.marketplace.body.includes(facts.vin)) return "marketplace.body must include the VIN";
  const fmt = (n: number) => n.toLocaleString("en-US");
  if (facts.price && !s.marketplace.body.includes(`$${fmt(facts.price)}`)) return `marketplace.body must show the price as $${fmt(facts.price)}`;
  if (facts.mileage && !s.marketplace.body.includes(fmt(facts.mileage))) return `marketplace.body must show the mileage as ${fmt(facts.mileage)}`;
  const tags: string[] = s.xiaohongshu.body.match(/#[^\s#]+/g) ?? [];
  if (tags.length < 5 || tags.length > 8 || !tags.includes("#纽约二手车") || !tags.includes("#DCNiceCar"))
    return "xiaohongshu.body needs 5-8 hashtags including #纽约二手车 and #DCNiceCar";
  const allowed = facts.price ? [facts.price] : [];
  const amounts = [...JSON.stringify(s).matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  if (amounts.some((a) => !allowed.includes(a))) return "only the listing price may appear as a dollar amount";
  if (/financ/i.test(JSON.stringify(s))) return "no financing claims allowed";
  return null;
}

export interface ScriptOpts { badgePct?: number; lang?: Lang; tweak?: string }

export async function generateScript(listing: Listing, opts: ScriptOpts = {}): Promise<Script> {
  const lang = opts.lang ?? "zh";
  const facts = factsFor(listing, opts.badgePct);
  if (!facts.imageCount) throw new Error("listing has no downloaded images; re-run scrape");
  const messages = [{ role: "user", content: prompt(facts, lang, opts.tweak) }];
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const raw = await callGrok(messages, attempt === 3 ? process.env.GROK_FALLBACK_MODEL || FALLBACK_MODEL : undefined);
    try {
      const parsed = ScriptSchema.parse(JSON.parse(raw));
      const err = check(parsed, facts, lang);
      if (!err) return parsed;
      lastErr = err;
    } catch (e) {
      lastErr = (e as Error).message.slice(0, 500);
    }
    messages.push({ role: "assistant", content: raw }, { role: "user", content: `Invalid: ${lastErr}. Return corrected JSON only.` });
  }
  throw new Error(`Grok returned invalid script 4 times: ${lastErr}`);
}

export const scriptPath = (dir: string, lang: Lang) => path.join(dir, `script-${lang}.json`);

export async function scriptFromFile(listingPath: string, opts: ScriptOpts = {}) {
  const listing = JSON.parse(await readFile(listingPath, "utf8")) as Listing;
  const script = await generateScript(listing, opts);
  const out = scriptPath(path.dirname(listingPath), opts.lang ?? "zh");
  await writeFile(out, JSON.stringify(script, null, 2));
  return { script, out };
}
