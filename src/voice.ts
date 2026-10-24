import { execFile } from "node:child_process";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}
export interface Caption { word: string; startSec: number; endSec: number }
export interface Captions { estimated: boolean; words: Caption[] }

const HAN = /\p{Script=Han}/u;
const PUNCT = /\p{P}/u;

// Split a character list into caption tokens: whitespace separates Latin words; every Chinese
// character is its own token (Chinese has no spaces), with trailing punctuation attached.
export function tokenGroups(chars: string[]): number[][] {
  const groups: number[][] = [];
  let cur: number[] | null = null;
  let curHan = false;
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      cur = null;
    } else if (HAN.test(ch)) {
      groups.push((cur = [i]));
      curHan = true;
    } else if (cur && (PUNCT.test(ch) || !curHan)) {
      cur.push(i);
    } else {
      groups.push((cur = [i]));
      curHan = false;
    }
  });
  return groups;
}

export function tokenize(text: string): string[] {
  const chars = [...text];
  return tokenGroups(chars).map((g) => g.map((i) => chars[i]).join(""));
}

// ElevenLabs returns per-character timings; group them into caption tokens.
export function alignmentToWords(a: Alignment): Caption[] {
  return tokenGroups(a.characters).map((g) => ({
    word: g.map((i) => a.characters[i]).join(""),
    startSec: a.character_start_times_seconds[g[0]],
    endSec: a.character_end_times_seconds[g[g.length - 1]],
  }));
}

// Fallback when we have no alignment: spread tokens by spoken length (digits are read out as several syllables).
// With `spans` (speech intervals from detectSpeech) each sentence is anchored to the nearest real pause.
export function estimateWords(text: string, durationSec: number, spans?: [number, number][]): Caption[] {
  const tokens = tokenize(text);
  const len = (w: string) => [...w.replace(/\p{P}/gu, "")].reduce((a, c) => a + (/\d/.test(c) ? 3.5 : 1), 0) || 1;
  const speech: [number, number][] = spans?.length ? spans : [[0, durationSec]];
  const speechTotal = speech.reduce((a, [s, e]) => a + e - s, 0);
  // Map a 0..1 fraction of spoken length to wall-clock time, skipping silences.
  const at = (frac: number) => {
    let left = frac * speechTotal;
    for (const [s, e] of speech) {
      if (left <= e - s) return s + left;
      left -= e - s;
    }
    return speech[speech.length - 1][1];
  };
  const total = tokens.reduce((s, w) => s + len(w), 0);
  const startFrac: number[] = [];
  let acc = 0;
  for (const w of tokens) startFrac.push(acc / total), (acc += len(w));
  // Sentence anchors: snap each sentence start to the closest later speech onset within 2 s.
  const sentenceStart = tokens.map((_, i) => i === 0 || /[.!?。！？]$/.test(tokens[i - 1]));
  const anchors: { i: number; t: number }[] = [];
  tokens.forEach((_, i) => {
    if (!sentenceStart[i]) return;
    const guess = at(startFrac[i]);
    const prev = anchors.at(-1)?.t ?? -1;
    const onsets = speech.map(([s]) => s).filter((s) => s > prev);
    const onset = onsets.reduce((b, s) => (Math.abs(s - guess) < Math.abs(b - guess) ? s : b), onsets[0] ?? guess);
    anchors.push({ i, t: Math.abs(onset - guess) <= 2 ? onset : Math.max(guess, prev + 0.1) });
  });
  anchors.push({ i: tokens.length, t: speech[speech.length - 1][1] });
  const out: Caption[] = [];
  for (let a = 0; a < anchors.length - 1; a++) {
    const { i: i0, t: t0 } = anchors[a];
    const { i: i1, t: t1 } = anchors[a + 1];
    // A sentence ends where the speech before the next anchor ends (not inside the pause).
    const end = Math.max(t0 + 0.1, speech.filter(([s]) => s < t1).reduce((b, [s, e]) => (e <= t1 && e > t0 ? e : b), t1));
    const sum = tokens.slice(i0, i1).reduce((x, w) => x + len(w), 0);
    let t = t0;
    for (let i = i0; i < i1; i++) {
      const d = (len(tokens[i]) / sum) * (end - t0);
      out.push({ word: tokens[i], startSec: +t.toFixed(3), endSec: +(t + d).toFixed(3) });
      t += d;
    }
  }
  return out;
}

// Speech intervals (non-silent stretches) of an audio file, via ffmpeg silencedetect.
export async function detectSpeech(file: string): Promise<[number, number][]> {
  const dur = await audioDuration(file);
  const { stderr } = await promisify(execFile)("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.15", "-f", "null", "-"]);
  const marks = [...stderr.matchAll(/silence_(start|end): ([\d.]+)/g)].map((m) => ({ kind: m[1], t: Number(m[2]) }));
  const spans: [number, number][] = [];
  let cur = 0;
  for (const m of marks) {
    if (m.kind === "start") {
      if (m.t - cur > 0.05) spans.push([cur, m.t]);
    } else cur = m.t;
  }
  if (marks.at(-1)?.kind !== "start" && dur - cur > 0.05) spans.push([cur, dur]);
  return spans;
}

export async function audioDuration(file: string): Promise<number> {
  const { stdout } = await promisify(execFile)("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
  ]);
  const d = Number(stdout.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`could not read duration of ${file}`);
  return d;
}

// English-only ElevenLabs models; Chinese narration must use a multilingual one.
const ENGLISH_ONLY = new Set(["eleven_monolingual_v1", "eleven_turbo_v2", "eleven_flash_v2"]);

export function modelFor(text: string, envModel = process.env.ELEVENLABS_MODEL_ID) {
  // eleven_multilingual_v2 is the documented default, multilingual (incl. Chinese) and recommended for narration.
  const fallback = "eleven_multilingual_v2";
  if (!envModel) return fallback;
  if (HAN.test(text) && ENGLISH_ONLY.has(envModel)) {
    console.error(`ELEVENLABS_MODEL_ID=${envModel} is English-only; using ${fallback} for Chinese narration`);
    return fallback;
  }
  return envModel;
}

async function elevenLabs(text: string) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // stock "Rachel"
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: modelFor(text) }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  // Per docs both alignment fields are nullable; prefer original-text timings.
  return (await res.json()) as { audio_base64: string; alignment?: Alignment | null; normalized_alignment?: Alignment | null };
}

export type Lang = "zh" | "en";
export const narrationPath = (dir: string, lang: Lang) => path.join(dir, `narration-${lang}.mp3`);
export const captionsPath = (dir: string, lang: Lang) => path.join(dir, `captions-${lang}.json`);
// Rough speaking pace used only for silent renders.
export const silentDuration = (text: string) => Math.min(29, Math.max(20, tokenize(text).length * (HAN.test(text) ? 0.21 : 0.4)));

export async function voice(narration: string, outDir: string, opts: { audio?: string; lang?: Lang; silent?: boolean; noTts?: boolean } = {}) {
  const lang = opts.lang ?? "zh";
  const audioOut = narrationPath(outDir, lang);
  let captions: Captions;
  let audio: string | null = audioOut;
  if (opts.audio) {
    if (path.resolve(opts.audio) !== path.resolve(audioOut)) await copyFile(opts.audio, audioOut);
    captions = { estimated: true, words: estimateWords(narration, await audioDuration(audioOut), await detectSpeech(audioOut)) };
  } else if (process.env.ELEVENLABS_API_KEY && !opts.noTts) {
    const r = await elevenLabs(narration);
    await writeFile(audioOut, Buffer.from(r.audio_base64, "base64"));
    const a = r.alignment ?? r.normalized_alignment;
    if (!a) throw new Error("ElevenLabs response has no alignment");
    captions = { estimated: false, words: alignmentToWords(a) };
  } else if (opts.silent) {
    audio = null;
    captions = { estimated: true, words: estimateWords(narration, silentDuration(narration)) };
  } else {
    throw new Error("ElevenLabs key missing; pass --audio or --silent");
  }
  const captionsOut = captionsPath(outDir, lang);
  await writeFile(captionsOut, JSON.stringify(captions, null, 2));
  return { audio, captions: captionsOut, data: captions };
}

export const langFromScriptPath = (p: string): Lang => (/script-en\.json$/.test(p) ? "en" : "zh");

export async function voiceFromScriptFile(scriptPath: string, opts: { audio?: string; silent?: boolean } = {}) {
  const { narration } = JSON.parse(await readFile(scriptPath, "utf8")) as { narration: string };
  return voice(narration, path.dirname(scriptPath), { ...opts, lang: langFromScriptPath(scriptPath) });
}
