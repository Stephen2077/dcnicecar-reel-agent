// Mobile web UI: upload photos → recognize → make reel. Calls the pipeline only via per-step CLIs (CONTRACT.md).
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "out");
const PORT = Number(process.env.PORT) || 8787;
const FAKE = process.env.FAKE_PIPELINE === "1";
const TSX = path.join(ROOT, "node_modules", ".bin", "tsx");

type Lang = "zh" | "en";
type Step = 0 | 1 | 2 | 3; // reading photos, writing script, recording voice, rendering video
type ErrCode = "network" | "photos" | "busy";

interface Job {
  id: string;
  uploadDir: string;
  slug: string;
  dir: string;
  fields: { yearModel: string };
  langs: Lang[];
  state: "idle" | "queued" | "running" | "done" | "error";
  step: Step;
  error?: ErrCode;
}

const jobs = new Map<string, Job>();
const queue: (() => Promise<void>)[] = [];
let running = false;

function enqueue(task: () => Promise<void>) {
  queue.push(task);
  if (!running) void drain();
}
async function drain() {
  running = true;
  while (queue.length) await queue.shift()!().catch(() => {});
  running = false;
}

function run(script: string, args: string[], timeoutMs = 15 * 60_000) {
  return new Promise<string>((resolve, reject) => {
    execFile(TSX, [path.join("src/cli", script), ...args], { cwd: ROOT, timeout: timeoutMs, maxBuffer: 32 << 20 }, (err, stdout, stderr) => {
      // Server-side log only; never sent to the browser.
      if (err) {
        console.error(`[${script}] failed: ${String(stderr).slice(-800)}`);
        reject(Object.assign(new Error(`${script} failed`), { stderr: String(stderr) }));
      } else resolve(stdout);
    });
  });
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const newId = () => randomBytes(12).toString("base64url");
const ID_RE = /^[A-Za-z0-9_-]{16}$/;

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => cb(null, (req as express.Request & { uploadDir: string }).uploadDir),
    filename: (req, file, cb) => {
      const r = req as express.Request & { n?: number };
      r.n = (r.n ?? 0) + 1;
      cb(null, `${String(r.n).padStart(2, "0")}${MIME_EXT[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 12, fields: 0 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in MIME_EXT),
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(ROOT, "web/public")));

const fail = (res: express.Response, status: number, error: ErrCode) => res.status(status).json({ error });

function getJob(req: express.Request) {
  const id = String(req.params.id);
  return ID_RE.test(id) ? jobs.get(id) : undefined;
}

// 1) Upload photos + recognize (fast, not queued).
app.post(
  "/api/jobs",
  async (req, _res, next) => {
    const id = newId();
    const r = req as express.Request & { uploadDir: string; jobId: string };
    r.jobId = id;
    r.uploadDir = path.join(OUT, "uploads", id);
    await fs.mkdir(r.uploadDir, { recursive: true });
    next();
  },
  (req, res, next) =>
    upload.array("photos", 12)(req, res, (err) => {
      if (err) return fail(res, 400, "photos");
      next();
    }),
  async (req, res) => {
    const r = req as express.Request & { uploadDir: string; jobId: string };
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length < 3) return fail(res, 400, "photos");
    const job: Job = {
      id: r.jobId,
      uploadDir: r.uploadDir,
      slug: `web-${r.jobId}`,
      dir: path.join(OUT, `web-${r.jobId}`),
      fields: { yearModel: "" },
      langs: [],
      state: "idle",
      step: 0,
    };
    try {
      if (FAKE) await fakePhotos(job);
      else await run("photos.ts", [job.uploadDir, "--slug", job.slug], 120_000);
      const listing = JSON.parse(await fs.readFile(path.join(job.dir, "listing.json"), "utf8"));
      job.fields.yearModel = listing.title === "Pre-owned vehicle" ? "" : listing.title;
      jobs.set(job.id, job);
      res.json({ id: job.id, yearModel: job.fields.yearModel });
    } catch (e) {
      const stderr = (e as { stderr?: string }).stderr ?? "";
      fail(res, /at least 3/.test(stderr) ? 400 : 502, /at least 3/.test(stderr) ? "photos" : "network");
    }
  },
);

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "");
const cleanNum = (v: unknown) => {
  const s = clean(String(v ?? ""), 20).replace(/[$,\s]/g, "");
  return /^\d+(\.\d+)?$/.test(s) ? s : "";
};

// 2) Make reel (queued, one at a time).
app.post("/api/jobs/:id/make", (req, res) => {
  const job = getJob(req);
  if (!job) return fail(res, 404, "network");
  if (job.state === "queued" || job.state === "running") return fail(res, 409, "busy");
  const b = req.body ?? {};
  const lang = b.lang === "en" ? "en" : b.lang === "both" ? "both" : "zh";
  job.langs = lang === "both" ? ["zh", "en"] : [lang];
  const args = [job.uploadDir, "--slug", job.slug, "--vision", path.join(job.dir, "vision.json")];
  const add = (flag: string, v: string) => v && args.push(flag, v);
  add("--price", cleanNum(b.price));
  add("--mileage", cleanNum(b.mileage));
  add("--year-model", clean(b.yearModel, 80));
  add("--contact", clean(b.contact, 80));
  add("--vin", clean(b.vin, 17).replace(/[^A-Za-z0-9]/g, ""));
  startJob(job, async () => {
    job.step = 0;
    if (FAKE) await sleep(800);
    else await run("photos.ts", args, 120_000);
    await scriptVoiceRender(job);
  });
  res.json({ ok: true });
});

// 3) One-sentence tweak: script --tweak + voice + render for the same job.
app.post("/api/jobs/:id/tweak", (req, res) => {
  const job = getJob(req);
  if (!job || !job.langs.length) return fail(res, 404, "network");
  if (job.state === "queued" || job.state === "running") return fail(res, 409, "busy");
  const tweak = clean(req.body?.tweak, 200);
  if (!tweak) return fail(res, 400, "network");
  startJob(job, () => scriptVoiceRender(job, tweak));
  res.json({ ok: true });
});

function startJob(job: Job, work: () => Promise<void>) {
  job.state = "queued";
  job.error = undefined;
  job.step = 0;
  enqueue(async () => {
    job.state = "running";
    try {
      await work();
      job.state = "done";
    } catch {
      job.state = "error";
      job.error = "network";
    }
  });
}

async function scriptVoiceRender(job: Job, tweak?: string) {
  const listing = path.join(job.dir, "listing.json");
  job.step = 1;
  for (const lang of job.langs) {
    if (FAKE) await sleep(1200);
    else await run("script.ts", [listing, "--lang", lang, ...(tweak ? ["--tweak", tweak] : [])], 6 * 60_000);
  }
  job.step = 2;
  for (const lang of job.langs) {
    if (FAKE) {
      await sleep(1000);
      continue;
    }
    // No voice key (or voice failed) → estimated captions + silent render; never an error for the user.
    const script = path.join(job.dir, `script-${lang}.json`);
    await fs.rm(path.join(job.dir, `narration-${lang}.mp3`), { force: true });
    await run("voice.ts", [script], 3 * 60_000).catch(() => run("voice.ts", [script, "--silent"], 60_000));
  }
  job.step = 3;
  for (const lang of job.langs) {
    await fs.rm(path.join(job.dir, `reel-${lang}.mp4`), { force: true });
    if (FAKE) await fakeRender(job, lang);
    else {
      const silent = existsSync(path.join(job.dir, `narration-${lang}.mp3`)) ? [] : ["--silent"];
      await run("render.ts", [job.dir, "--lang", lang, ...silent]);
    }
  }
}

async function readJson(p: string) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
}

const copyText = (c: unknown) =>
  typeof c === "string" ? c : c && typeof c === "object" ? [(c as any).title, (c as any).body].filter(Boolean).join("\n\n") : "";

app.get("/api/jobs/:id", async (req, res) => {
  const job = getJob(req);
  if (!job) return fail(res, 404, "network");
  const out: Record<string, unknown> = { state: job.state, step: job.step, error: job.error, yearModel: job.fields.yearModel };
  if (job.state === "done") {
    const videos: Partial<Record<Lang, string>> = {};
    let xiaohongshu = "";
    let marketplace = "";
    for (const lang of job.langs) {
      if (existsSync(path.join(job.dir, `reel-${lang}.mp4`))) videos[lang] = `/api/jobs/${job.id}/video/${lang}`;
      const result = await readJson(path.join(job.dir, `result-${lang}.json`));
      const script = await readJson(path.join(job.dir, `script-${lang}.json`));
      const src = result ?? script ?? {};
      if (lang === "zh" || !xiaohongshu) xiaohongshu = copyText(src.xiaohongshu) || xiaohongshu;
      if (lang === "en" || !marketplace) marketplace = copyText(src.marketplace) || marketplace;
    }
    Object.assign(out, { videos, xiaohongshu, marketplace });
  }
  res.set("Cache-Control", "no-store").json(out);
});

// Videos only by job id + lang whitelist; path is built server-side, never from user input.
app.get("/api/jobs/:id/video/:lang", (req, res) => {
  const job = getJob(req);
  const lang = req.params.lang;
  if (!job || (lang !== "zh" && lang !== "en") || !job.langs.includes(lang)) return res.sendStatus(404);
  const file = path.join(job.dir, `reel-${lang}.mp4`);
  if (!existsSync(file)) return res.sendStatus(404);
  if (req.query.dl) res.attachment(`dcnicecar-reel-${lang}.mp4`);
  res.sendFile(file);
});

app.use((_req, res) => res.sendStatus(404));
app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => fail(res, 500, "network"));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// FAKE_PIPELINE=1: UI testing without models or render.
async function fakePhotos(job: Job) {
  await sleep(1200);
  await fs.mkdir(job.dir, { recursive: true });
  await fs.writeFile(path.join(job.dir, "listing.json"), JSON.stringify({ title: "Honda Accord" }));
}
async function fakeRender(job: Job, lang: Lang) {
  const files = (await fs.readdir(job.uploadDir)).sort();
  await new Promise<void>((resolve, reject) =>
    execFile(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-loop", "1", "-t", "3", "-i", path.join(job.uploadDir, files[0]),
        "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p",
        "-r", "30", "-c:v", "libx264", path.join(job.dir, `reel-${lang}.mp4`)],
      (err) => (err ? reject(err) : resolve()),
    ),
  );
  await fs.writeFile(
    path.join(job.dir, `script-${lang}.json`),
    JSON.stringify({
      xiaohongshu: { title: "2024 本田雅阁 混动 | 省油又好开", body: "黑色外观，内饰干净，车况很好。欢迎私信预约试驾～" },
      marketplace: { title: "2024 Honda Accord Hybrid Sport", body: "Clean black Accord, well kept. Message us for a test drive." },
    }),
  );
}

app.listen(PORT, "127.0.0.1", () => console.log(`web on http://127.0.0.1:${PORT}${FAKE ? " (FAKE_PIPELINE)" : ""}`));
