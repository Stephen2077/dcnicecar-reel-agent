import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { ReelProps } from "../remotion/types.ts";
import type { Lang, Script } from "./script.ts";
import type { Listing } from "./types.ts";
import { valuate } from "./valuation.ts";
import { audioDuration, captionsPath, detectSpeech, estimateWords, narrationPath, silentDuration, type Captions } from "./voice.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REMOTION_DIR = path.join(ROOT, "remotion");
const exists = (p: string) => access(p).then(() => true, () => false);
const run = promisify(execFile);

// Site shorthand -> words, per language.
const EXPAND: Record<Lang, Record<string, string>> = {
  en: { "4C": "4-cylinder", "6C": "V6", "8C": "V8", AUTO: "Automatic", GASLINE: "Gas", FWD: "FWD", AWD: "AWD", RWD: "RWD", "4WD": "4WD" },
  zh: { "4C": "四缸", "6C": "六缸", "8C": "八缸", AUTO: "自动挡", GASLINE: "汽油", FWD: "前驱", AWD: "四驱", RWD: "后驱", "4WD": "四驱" },
};
const COLOR_ZH: Record<string, string> = { BLACK: "黑", WHITE: "白", GREY: "灰", GRAY: "灰", SILVER: "银", RED: "红", BLUE: "蓝", BEIGE: "米", BROWN: "棕", GREEN: "绿" };
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

// One spec chip per non-hook shot, in a fixed priority order; only facts present in the listing.
export function chipsFor(l: Listing, lang: Lang, shotCount: number): ReelProps["chips"] {
  const sp = l.specs ?? {};
  const ex = (v?: string) => (v ? (EXPAND[lang][v.toUpperCase()] ?? v) : undefined);
  const color = (v?: string) => (v ? (lang === "zh" ? (COLOR_ZH[v.toUpperCase()] ?? v) : title(v)) : undefined);
  const zh = lang === "zh";
  const cands: ({ label: string; value: string } | null)[] = [
    l.mileage ? { label: zh ? "里程" : "Mileage", value: `${l.mileage.toLocaleString("en-US")}${zh ? " 英里" : " mi"}` } : null,
    ex(sp.Engine) ? { label: zh ? "发动机" : "Engine", value: ex(sp.Engine)! } : null,
    ex(sp.Drivetrain) ? { label: zh ? "驱动" : "Drive", value: ex(sp.Drivetrain)! } : null,
    sp["Exterior Color"] || sp["Interior Color"]
      ? {
          // Label only the colours we actually have.
          label: [sp["Exterior Color"] ? (zh ? "外观" : "Ext") : "", sp["Interior Color"] ? (zh ? "内饰" : "Int") : ""].filter(Boolean).join(" / "),
          value: [color(sp["Exterior Color"]), color(sp["Interior Color"])].filter(Boolean).join(" / "),
        }
      : null,
    ex(sp.Transmission) ? { label: zh ? "变速箱" : "Gearbox", value: ex(sp.Transmission)! } : null,
  ];
  const list = cands.filter(Boolean);
  return Array.from({ length: shotCount }, (_, i) => (i === 0 ? null : (list[i - 1] ?? null)));
}

// Bundle remotion/ once per source hash; reused across renders.
let bundlePromise: Promise<string> | null = null;
async function getBundle(): Promise<string> {
  bundlePromise ??= (async () => {
    const h = createHash("sha1");
    for (const f of (await readdir(REMOTION_DIR)).sort()) h.update(f).update(await readFile(path.join(REMOTION_DIR, f)));
    h.update(JSON.parse(await readFile(path.join(ROOT, "node_modules/remotion/package.json"), "utf8")).version);
    const outDir = path.join(ROOT, ".cache", `remotion-bundle-${h.digest("hex").slice(0, 12)}`);
    if (await exists(path.join(outDir, "index.html"))) return outDir;
    const { bundle } = await import("@remotion/bundler");
    await mkdir(path.join(ROOT, ".cache", "empty-public"), { recursive: true });
    return bundle({ entryPoint: path.join(REMOTION_DIR, "index.ts"), outDir, publicDir: path.join(ROOT, ".cache", "empty-public") });
  })();
  bundlePromise.catch(() => (bundlePromise = null));
  return bundlePromise;
}

// Photos are ~6000x4000: downscale once for the frame, plus a tiny blurred backdrop.
async function prepareImages(dir: string, images: string[], dest: string) {
  await mkdir(dest, { recursive: true });
  return Promise.all(
    images.map(async (img, i) => {
      const local = path.join(dir, "images", path.basename(img));
      const src = (await exists(local)) ? local : path.resolve(img);
      const sharp = `img-${i}.jpg`;
      const back = `bg-${i}.jpg`;
      const srcTime = (await stat(src)).mtimeMs;
      const fresh = async (f: string) => (await exists(f)) && (await stat(f)).mtimeMs >= srcTime;
      if (!(await fresh(path.join(dest, sharp))))
        await run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", "scale=1600:-2", "-q:v", "3", path.join(dest, sharp)]);
      if (!(await fresh(path.join(dest, back))))
        await run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", "scale=270:480:force_original_aspect_ratio=increase,crop=270:480,gblur=sigma=12,eq=brightness=-0.12", "-q:v", "4", path.join(dest, back)]);
      return { sharp, back };
    }),
  );
}

// Code-synthesized 120 BPM bed (kick on the beat, offbeat hat, root bass, power-chord pad; A-F-C-G every 2 bars).
// Beat-locked to remotion/types.ts BEAT; the composition ducks it under the narration.
const MUSIC_EXPR =
  "st(0,55*eq(mod(floor(t/4),4),0)+43.65*eq(mod(floor(t/4),4),1)+65.41*eq(mod(floor(t/4),4),2)+49*eq(mod(floor(t/4),4),3));st(1,mod(t,0.5));" +
  "0.8*sin(2*PI*(45*ld(1)+3*(1-exp(-30*ld(1)))))*exp(-9*ld(1))+0.10*(random(0)*2-1)*exp(-70*mod(t+0.25,0.5))" +
  "+0.22*sin(2*PI*ld(0)*t)*(0.55+0.45*exp(-8*mod(t,0.25)))+0.035*(sin(2*PI*4*ld(0)*t)+sin(2*PI*6*ld(0)*t)+0.6*sin(2*PI*8*ld(0)*t))";
async function makeMusic(file: string, seconds: number) {
  await run("ffmpeg", ["-y", "-loglevel", "error", "-filter_complex", `aevalsrc='${MUSIC_EXPR}':s=44100:d=${seconds.toFixed(2)},highpass=f=30,lowpass=f=9000,afade=t=in:d=0.05,alimiter=limit=0.8`, file]);
}

async function findBrowser(): Promise<string | undefined> {
  if (process.env.REMOTION_BROWSER) return process.env.REMOTION_BROWSER;
  const { ensureBrowser } = await import("@remotion/renderer");
  try {
    await ensureBrowser();
    return undefined; // Remotion's own headless shell.
  } catch {
    for (const p of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) if (await exists(p)) return p;
    throw new Error("No browser available for rendering (Remotion download failed and no system Chrome found)");
  }
}

export async function buildProps(dir: string, lang: Lang, publicPrefix: string, assets: { sharp: string; back: string }[]) {
  const listing = JSON.parse(await readFile(path.join(dir, "listing.json"), "utf8")) as Listing;
  const scriptFile = path.join(dir, `script-${lang}.json`);
  if (!(await exists(scriptFile))) throw new Error(`No ${lang} script yet — run the script step first`);
  const script = JSON.parse(await readFile(scriptFile, "utf8")) as Script;
  const audioFile = narrationPath(dir, lang);
  const hasAudio = await exists(audioFile);
  let captions: Captions;
  const capFile = captionsPath(dir, lang);
  if (await exists(capFile)) captions = JSON.parse(await readFile(capFile, "utf8"));
  else {
    const dur = hasAudio ? await audioDuration(audioFile) : silentDuration(script.narration);
    captions = { estimated: true, words: estimateWords(script.narration, dur, hasAudio ? await detectSpeech(audioFile) : undefined) };
  }
  const badgeFile = path.join(dir, "badge.json");
  const badge = (await exists(badgeFile))
    ? (JSON.parse(await readFile(badgeFile, "utf8")) as { show: boolean; pct: number })
    : await valuate(listing);
  const audioSec = hasAudio ? await audioDuration(audioFile) : 0;
  const durationInFrames = Math.ceil(Math.max(30, audioSec ? audioSec + 1 : 0) * 30);
  const props: ReelProps = {
    lang,
    durationInFrames,
    year: listing.year,
    make: listing.make,
    model: listing.model,
    price: listing.price,
    mileage: listing.mileage,
    images: assets.map((a) => `${publicPrefix}/${a.sharp}`),
    backdrops: assets.map((a) => `${publicPrefix}/${a.back}`),
    shots: script.shots,
    chips: chipsFor(listing, lang, script.shots.length),
    captions: captions.words,
    badge: { show: !!badge.show, pct: badge.pct },
    audio: hasAudio ? `${publicPrefix}/narration-${lang}.mp3` : null,
    music: process.env.REEL_MUSIC === "0" ? null : `${publicPrefix}/music-${lang}.wav`,
    contact: listing.contact?.trim() || null,
    style: script.style,
    cta: lang === "zh" ? "私信预约试驾" : "Message us for a test drive",
    site: "dcnicecar.com",
  };
  return { props, hasAudio, audioFile, estimated: captions.estimated };
}

export async function renderReel(dir: string, lang: Lang, onProgress?: (p: number) => void) {
  const slug = path.basename(path.resolve(dir));
  const serveUrl = await getBundle();
  const publicPrefix = `jobs/${slug}`;
  const dest = path.join(serveUrl, "public", publicPrefix);
  const listing = JSON.parse(await readFile(path.join(dir, "listing.json"), "utf8")) as Listing;
  if (!listing.images?.length) throw new Error("This listing has no photos to use");
  const assets = await prepareImages(dir, listing.images, dest);
  const { props, hasAudio, audioFile, estimated } = await buildProps(dir, lang, publicPrefix, assets);
  if (hasAudio) await copyFile(audioFile, path.join(dest, `narration-${lang}.mp3`));
  if (props.music) await makeMusic(path.join(dest, `music-${lang}.wav`), props.durationInFrames / 30);

  const { renderMedia, selectComposition } = await import("@remotion/renderer");
  const browserExecutable = await findBrowser();
  const inputProps = props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "Reel", inputProps, browserExecutable });
  const outputLocation = path.join(dir, `reel-${lang}.mp4`);
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: 20,
    outputLocation,
    inputProps,
    concurrency: Number(process.env.RENDER_CONCURRENCY) || 4,
    browserExecutable,
    onProgress: ({ progress }) => onProgress?.(progress),
  });
  return { video: outputLocation, seconds: props.durationInFrames / 30, silent: !hasAudio, estimatedCaptions: estimated, badge: props.badge };
}

