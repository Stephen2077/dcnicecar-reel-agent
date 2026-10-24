import React, { useState } from "react";
import {
  AbsoluteFill,
  Easing,
  Html5Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { getInfo as notoInfo, loadFont as loadNoto } from "@remotion/google-fonts/NotoSansSC";
import { BEAT, END_CARD_SEC, FPS, HEIGHT, WIDTH, type Move, type ReelProps } from "./types";

// Motion language adapted from huashu-motion (MIT, © 2026 Huashu, https://github.com/alchaincyf/huashu-motion);
// rules only, no code copied. See remotion/HUASHU-NOTES.md for the exact rules and sources.

// Palette from DESIGN.md (accent kept scarce: price bar, badge, active caption word).
const INK = "#0B0D10";
const PAPER = "#F5F3EE";
const MUTE = "#A7A9B0";
const VOLT = "#D7FF3A";
const SCRIM = "rgba(11,13,16,0.72)";
// Social-ad safe zones at 1080x1920: top 220, bottom 520 (platform UI).
const SAFE = { x: 64, top: 220, bottom: 520 };
const FLOOR = HEIGHT - SAFE.bottom; // 1400

loadArchivo("normal", { weights: ["900"], subsets: ["latin"] });
loadSerif("italic", { weights: ["400"], subsets: ["latin"] });
loadMono("normal", { weights: ["700"], subsets: ["latin"] });

// Noto Sans SC ships ~100 unicode-range chunks; load only the chunks our text needs.
function notoSubsetsFor(text: string): string[] {
  const ranges = Object.entries(notoInfo().unicodeRanges).map(([subset, r]) => ({
    subset,
    spans: r.split(",").map((s) => {
      const [a, b] = s.trim().replace("U+", "").split("-");
      return [parseInt(a, 16), parseInt(b ?? a, 16)] as const;
    }),
  }));
  const need = new Set<string>();
  for (const ch of new Set(text)) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x2000) continue; // Latin/punctuation is drawn by the Latin faces.
    const hit = ranges.find((r) => r.spans.some(([a, b]) => cp >= a && cp <= b));
    if (hit) need.add(hit.subset);
  }
  return [...need];
}

// Curves: expo.out for entrances (hit lands at ~35% of the move), power2.in for exits.
const EXPO_OUT = Easing.bezier(0.16, 1, 0.3, 1);
const POWER2_IN = Easing.in(Easing.quad);
const OUT_CUBIC = Easing.out(Easing.cubic);
const OUT_QUART = Easing.out(Easing.poly(4));
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const WIPE = 10; // line-mask wipe between shots (~0.33 s); no crossfades.
const ENTER = 18; // mask-reveal headline entrance (0.6 s)
const EXIT = 9; // headline exit (0.3 s)

const fmtNum = (n: number) => n.toLocaleString("en-US");

// Two families only: heavy grotesk for display, italic serif for kickers; mono only for numbers.
const fonts = (zh: boolean) => ({
  display: zh ? "Archivo, 'Noto Sans SC', sans-serif" : "Archivo, sans-serif",
  serif: zh ? "'Instrument Serif', 'Noto Sans SC', serif" : "'Instrument Serif', serif",
  body: zh ? "Archivo, 'Noto Sans SC', sans-serif" : "Archivo, sans-serif",
  mono: "'JetBrains Mono', monospace",
});

// ---------- beat grid ----------
// Shots stretch proportionally to fill the film, then every cut is snapped to the 120 BPM grid.
export function shotBounds(durations: number[], endStart: number) {
  const total = durations.reduce((a, d) => a + d, 0) || 1;
  let acc = 0;
  const cuts = [0];
  for (const d of durations) {
    acc += d;
    cuts.push(Math.min(endStart, Math.round(((acc / total) * endStart) / BEAT) * BEAT));
  }
  cuts[cuts.length - 1] = endStart;
  return durations.map((_, i) => ({ from: cuts[i], len: Math.max(BEAT, cuts[i + 1] - cuts[i]) }));
}

// A shot longer than 4 beats splits into a wide A and a detail B, cut on the beat nearest the middle.
const subCut = (len: number) => (len >= BEAT * 6 ? Math.round(len / 2 / BEAT) * BEAT : null);

// ---------- photo band ----------
const BAND = { top: 540, height: 640 };

// Slow linear drift, never reversing within a shot: 3% on the wide, 4% on the detail.
function drift(move: Move, p: number, detail: boolean) {
  const base = detail ? 1.5 : 1.06;
  const amt = detail ? 0.04 : 0.03;
  switch (move) {
    case "push-in":
      return { s: base + amt * p, x: 0 };
    case "pull-out":
      return { s: base + amt * (1 - p), x: 0 };
    case "pan-left":
      return { s: base + 0.02, x: (detail ? 3 : 2) * (1 - 2 * p) };
    case "pan-right":
      return { s: base + 0.02, x: (detail ? 3 : 2) * (2 * p - 1) };
  }
}

// Detail crops: alternate between the front and rear of the car.
const DETAIL_ORIGIN = ["32% 58%", "70% 55%", "50% 70%", "28% 45%", "66% 62%", "45% 50%"];

const Shot: React.FC<{ props: ReelProps; index: number; len: number; zh: boolean }> = ({ props, index, len, zh }) => {
  const frame = useCurrentFrame() - (index === 0 ? 0 : WIPE);
  const shot = props.shots[index];
  const img = props.images[shot.imageIndex] ?? props.images[0];
  const bg = props.backdrops[shot.imageIndex] ?? props.backdrops[0];
  const split = subCut(len);
  const detail = split !== null && frame >= split;
  const local = detail ? frame - split! : frame + (index === 0 ? 0 : WIPE);
  const span = detail ? len - split! : (split ?? len) + (index === 0 ? 0 : WIPE);
  const { s, x } = drift(shot.move, Math.min(1, Math.max(0, local / span)), detail);
  // Incoming shot is revealed by a vertical line mask sweeping left to right.
  const wipe = index === 0 ? 1 : interpolate(frame, [-WIPE, 0], [0, 1], { ...clamp, easing: EXPO_OUT });
  const chip = props.chips[index];
  return (
    <AbsoluteFill style={{ clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)` }}>
      <AbsoluteFill style={{ backgroundColor: INK }}>
        <Img src={staticFile(bg)} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, top: BAND.top, width: WIDTH, height: BAND.height, overflow: "hidden" }}>
        <Img
          src={staticFile(img)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // One grade for every photo so the set reads as one shoot.
            filter: "contrast(1.06) saturate(0.92) brightness(0.96)",
            transformOrigin: detail ? DETAIL_ORIGIN[index % DETAIL_ORIGIN.length] : "50% 50%",
            transform: `translateX(${x}%) scale(${s})`,
          }}
        />
        <AbsoluteFill style={{ background: `linear-gradient(${INK}b3 0%, transparent 16%, transparent 62%, ${INK}e6 100%)` }} />
      </div>
      {wipe < 1 ? <div style={{ position: "absolute", top: 0, bottom: 0, left: wipe * WIDTH - 3, width: 6, backgroundColor: PAPER }} /> : null}
      {index === 0 ? <HookTitle props={props} zh={zh} /> : <Headline text={shot.onScreenText} props={props} zh={zh} len={len} />}
      {chip ? <Chip chip={chip} zh={zh} frame={frame} /> : null}
    </AbsoluteFill>
  );
};

// ---------- typography ----------
// Rough advance widths for Archivo 900: CJK = 1em; caps/digits wider than lowercase.
function textUnits(text: string) {
  return [...text].reduce((a, c) => a + (/[⺀-￿]/.test(c) ? 1 : /[A-Z0-9$]/.test(c) ? 0.72 : c === " " ? 0.26 : 0.6), 0);
}
// Fit one line to 86% of the frame width; below 0.55x of the base size, wrap to two lines instead.
function fitHeadline(text: string, base: number, width = WIDTH * 0.86) {
  const one = Math.floor(width / Math.max(textUnits(text), 1));
  if (one >= base * 0.55) return { size: Math.min(base, one), lines: [text] };
  const words = text.split(/\s+/);
  const cjk = words.length < 2;
  const chars = [...text];
  const mid = cjk ? Math.ceil(chars.length / 2) : Math.ceil(words.length / 2);
  const lines = cjk ? [chars.slice(0, mid).join(""), chars.slice(mid).join("")] : [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  // Two lines must still fit the header zone above the photo band.
  const size = Math.min(base, 112, Math.floor(width / Math.max(...lines.map(textUnits), 1)));
  return { size, lines };
}

// Mask reveal: each token rises from yPercent 110 inside an overflow:hidden line, expo.out, staggered.
const MaskLine: React.FC<{
  tokens: string[];
  start: number;
  stagger: number;
  size: number;
  font: string;
  weight: number;
  color: string;
  gap: number;
  exitAt?: number;
  tracking?: string;
  italic?: boolean;
}> = ({ tokens, start, stagger, size, font, weight, color, gap, exitAt, tracking = "-0.03em", italic }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexWrap: "nowrap", columnGap: gap }}>
      {tokens.map((tok, i) => {
        const t0 = start + i * stagger;
        const inP = interpolate(frame, [t0, t0 + ENTER], [1, 0], { ...clamp, easing: EXPO_OUT });
        const outP = exitAt === undefined ? 0 : interpolate(frame, [exitAt - EXIT, exitAt], [0, -1], { ...clamp, easing: POWER2_IN });
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", lineHeight: 1.06, paddingBottom: size * 0.04 }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(inP + outP) * 110}%)`,
                fontFamily: font,
                fontWeight: weight,
                fontStyle: italic ? "italic" : "normal",
                fontSize: size,
                color,
                letterSpacing: tracking,
                whiteSpace: "pre",
              }}
            >
              {tok}
            </span>
          </span>
        );
      })}
    </div>
  );
};

const Kicker: React.FC<{ text: string; zh: boolean; start: number; exitAt?: number }> = ({ text, zh, start, exitAt }) => (
  <MaskLine tokens={[text]} start={start} stagger={0} size={54} font={fonts(zh).serif} weight={400} italic color={MUTE} gap={0} tracking="0" exitAt={exitAt} />
);

const HookTitle: React.FC<{ props: ReelProps; zh: boolean }> = ({ props, zh }) => {
  const frame = useCurrentFrame();
  const f = fonts(zh);
  const kicker = [props.year, props.make].filter(Boolean).join(" ");
  const { size, lines } = fitHeadline(props.model ?? "", 200);
  const hook = props.style?.hookStyle ?? "fragments";
  let modelEl: React.ReactNode;
  if (hook === "punch") {
    // Scale slam: 1.7x -> 1x on a stiff spring, alpha in over 2 frames.
    const p = spring({ frame: frame - 6, fps: FPS, config: { stiffness: 260, damping: 22, mass: 0.8 } });
    modelEl = (
      <div style={{ opacity: frame >= 6 ? Math.min(1, (frame - 6) / 2) : 0, transform: `scale(${1.7 - 0.7 * p})`, transformOrigin: "left center" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ fontFamily: f.display, fontWeight: 900, fontSize: size, color: PAPER, letterSpacing: "-0.03em", lineHeight: 1.06 }}>{l}</div>
        ))}
      </div>
    );
  } else if (hook === "typewriter") {
    const n = Math.max(0, Math.floor((frame - 6) / 1.5));
    const shown = (props.model ?? "").slice(0, n);
    modelEl = <div style={{ fontFamily: f.display, fontWeight: 900, fontSize: size, color: PAPER, letterSpacing: "-0.03em", lineHeight: 1.06, whiteSpace: "pre-wrap" }}>{shown}</div>;
  } else {
    modelEl = lines.map((l, i) => (
      <MaskLine key={i} tokens={l.split(/\s+/)} start={6 + i * 3} stagger={2} size={size} font={f.display} weight={900} color={PAPER} gap={size * 0.22} />
    ));
  }
  return (
    <div style={{ position: "absolute", left: SAFE.x, top: SAFE.top, width: WIDTH - SAFE.x * 2 }}>
      <Kicker text={kicker} zh={zh} start={0} />
      {modelEl}
    </div>
  );
};

const Headline: React.FC<{ text: string; props: ReelProps; zh: boolean; len: number }> = ({ text, props, zh, len }) => {
  const f = fonts(zh);
  const cjk = /[⺀-￿]/.test(text);
  const { size, lines } = fitHeadline(cjk ? text.replace(/\s+/g, "") : text, cjk ? 170 : 190);
  const kicker = [props.make, props.model].filter(Boolean).join(" ");
  // Sequence-local frame 0 is the start of the wipe, WIPE frames before the cut: the headline rises
  // during the wipe so it has landed by the cut, and exits at the end of the sequence.
  const at = 0;
  const end = WIPE + len;
  return (
    <div style={{ position: "absolute", left: SAFE.x, top: SAFE.top, width: WIDTH - SAFE.x * 2 }}>
      <Kicker text={kicker} zh={zh} start={at} exitAt={end} />
      {lines.map((l, i) => (
        <MaskLine
          key={i}
          tokens={cjk ? [...l] : l.split(/\s+/)}
          start={at + 2 + i * 3}
          stagger={cjk ? 1 : 2}
          size={size}
          font={f.display}
          weight={900}
          color={PAPER}
          gap={cjk ? 0 : size * 0.22}
          exitAt={end}
        />
      ))}
    </div>
  );
};

// Spec slam: the label rises, then the value lands with a short scale slam one beat after the cut.
const Chip: React.FC<{ chip: { label: string; value: string }; zh: boolean; frame: number }> = ({ chip, zh, frame }) => {
  const f = fonts(zh);
  const t0 = BEAT;
  const label = interpolate(frame, [t0 - 4, t0 + 8], [0, 1], { ...clamp, easing: EXPO_OUT });
  const slam = spring({ frame: frame - t0, fps: FPS, config: { stiffness: 260, damping: 22, mass: 0.8 } });
  return (
    <div style={{ position: "absolute", left: SAFE.x, top: BAND.top + BAND.height - 150, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontFamily: f.mono, fontWeight: 700, fontSize: 32, color: MUTE, letterSpacing: zh ? "0.1em" : "0.2em", textTransform: "uppercase", opacity: label, transform: `translateY(${(1 - label) * 20}px)` }}>
        {chip.label}
      </span>
      <span style={{ fontFamily: f.display, fontWeight: 900, fontSize: 72, color: PAPER, letterSpacing: "-0.02em", lineHeight: 1, opacity: frame >= t0 ? 1 : 0, transform: `scale(${1.5 - 0.5 * slam})`, transformOrigin: "left bottom", display: "inline-block" }}>
        {chip.value}
      </span>
    </div>
  );
};

// ---------- through-line: Volt price bar -> end-card price ----------
const PRICE_BAR_TOP = FLOOR - 96 - 4;
const END = { cardTop: SAFE.top + 20, cardH: 560, title: SAFE.top + 20 + 560 + 36, priceTop: 920, priceH: 150 };

const PriceBar: React.FC<{ props: ReelProps; zh: boolean; endStart: number }> = ({ props, zh, endStart }) => {
  const frame = useCurrentFrame();
  const f = fonts(zh);
  const scale = props.style?.priceScale ?? 1;
  const barH = Math.round(96 + (scale - 1) * 80);
  const inP = interpolate(frame, [10, 28], [0, 1], { ...clamp, easing: EXPO_OUT });
  const morph = interpolate(frame, [endStart, endStart + 24], [0, 1], { ...clamp, easing: EXPO_OUT });
  const count = interpolate(frame, [16, 52], [0, 1], { ...clamp, easing: OUT_QUART });
  const price = props.price ? `$${fmtNum(Math.round(props.price * (0.82 + 0.18 * count)))}` : zh ? "私信询价" : "Message for price";
  const top0 = FLOOR - barH - 4;
  const h = barH + (END.priceH - barH) * morph;
  const top = top0 + (END.priceTop - top0) * morph + (1 - inP) * (barH + SAFE.bottom);
  const size = 60 * scale + (112 - 60 * scale) * morph;
  const miles = props.mileage ? (zh ? `${fmtNum(props.mileage)} 英里` : `${fmtNum(props.mileage)} MI`) : "";
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.x,
        top,
        width: WIDTH - SAFE.x * 2,
        height: h,
        backgroundColor: VOLT,
        borderRadius: 18 + 10 * morph,
        display: "flex",
        alignItems: "center",
        justifyContent: morph > 0.5 ? "center" : "space-between",
        padding: "0 32px",
        boxSizing: "border-box",
      }}
    >
      <span style={{ fontFamily: props.price ? f.mono : f.display, fontWeight: props.price ? 700 : 900, fontSize: props.price ? size : size * 0.7, color: INK, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{price}</span>
      {morph < 0.5 ? <span style={{ fontFamily: f.mono, fontWeight: 700, fontSize: 30, color: INK, opacity: 0.7 * (1 - morph * 2) }}>{miles}</span> : null}
    </div>
  );
};

// ---------- below-market stamp ----------
const Badge: React.FC<{ pct: number; zh: boolean; endStart: number }> = ({ pct, zh, endStart }) => {
  const frame = useCurrentFrame();
  const t0 = 45;
  if (frame < t0 || frame >= endStart) return null;
  const p = interpolate(frame, [t0, t0 + 10], [0, 1], { ...clamp, easing: OUT_CUBIC });
  const f = fonts(zh);
  return (
    <div
      style={{
        position: "absolute",
        right: SAFE.x,
        top: BAND.top + 32,
        transform: `rotate(-6deg) scale(${1.4 - 0.4 * p})`,
        backgroundColor: VOLT,
        color: INK,
        fontFamily: zh ? f.body : f.mono,
        fontWeight: zh ? 900 : 700,
        fontSize: 34,
        padding: "14px 22px",
        borderRadius: 8,
        boxShadow: frame === t0 + 10 ? `10px 10px 0 ${INK}` : `5px 5px 0 ${INK}`,
        letterSpacing: zh ? 0 : "0.04em",
      }}
    >
      {zh ? `低于市场价 ${pct}%` : `BELOW MARKET ${pct}%`}
    </div>
  );
};

// ---------- captions ----------
type Chunk = { words: ReelProps["captions"]; start: number; end: number };
export function chunkCaptions(words: ReelProps["captions"], zh: boolean): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: ReelProps["captions"] = [];
  const max = zh ? 9 : 4;
  for (const w of words) {
    cur.push(w);
    if (cur.length >= max || /[.,!?;:，。！？；：、]$/.test(w.word)) {
      chunks.push({ words: cur, start: cur[0].startSec, end: w.endSec });
      cur = [];
    }
  }
  if (cur.length) chunks.push({ words: cur, start: cur[0].startSec, end: cur[cur.length - 1].endSec });
  // Hold each chunk until the next one starts, but never through a long pause.
  chunks.forEach((c, i) => (c.end = Math.min(chunks[i + 1]?.start ?? Infinity, c.end + 0.6)));
  return chunks;
}

const Captions: React.FC<{ props: ReelProps; zh: boolean; chunks: Chunk[]; endStart: number }> = ({ props, zh, chunks, endStart }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const chunk = chunks.find((c) => t >= c.start && t < c.end);
  if (!chunk) return null;
  const f = fonts(zh);
  const local = frame - chunk.start * FPS;
  const p = interpolate(local, [0, 5], [0, 1], { ...clamp, easing: OUT_CUBIC });
  const barH = Math.round(96 + ((props.style?.priceScale ?? 1) - 1) * 80);
  const strip = (w: string) => (zh ? w.replace(/[，。！？；：、,.!?]/g, "") : w);
  // Above the price bar during shots; on the end card the bar has left, so drop to the safe floor.
  const morph = interpolate(frame, [endStart, endStart + 24], [0, 1], { ...clamp, easing: EXPO_OUT });
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.x,
        width: WIDTH - SAFE.x * 2,
        bottom: SAFE.bottom + (barH + 24) * (1 - morph),
        display: "flex",
        justifyContent: "center",
        opacity: p,
        transform: `translateY(${(1 - p) * 10}px)`,
      }}
    >
      <div style={{ backgroundColor: SCRIM, borderRadius: 14, padding: "10px 22px", maxWidth: "100%", textAlign: "center", fontFamily: f.body, fontWeight: 900, fontSize: 52, lineHeight: 1.2, color: PAPER, letterSpacing: "-0.01em" }}>
        {chunk.words.map((w, i) => {
          const active = t >= w.startSec && t < (chunk.words[i + 1]?.startSec ?? chunk.end);
          return (
            <span key={i} style={{ color: active ? VOLT : PAPER }}>
              {strip(w.word)}
              {i === chunk.words.length - 1 || (zh && !(/[A-Za-z0-9]$/.test(w.word) && /^[A-Za-z0-9$]/.test(chunk.words[i + 1].word))) ? "" : " "}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// ---------- end card ----------
// Elements gather onto the card one after another, then hold (name + CTA on screen >= 2 s).
const EndCard: React.FC<{ props: ReelProps; zh: boolean }> = ({ props, zh }) => {
  const frame = useCurrentFrame();
  const f = fonts(zh);
  const bgP = interpolate(frame, [0, 8], [0, 1], clamp);
  const card = interpolate(frame, [0, 24], [0, 1], { ...clamp, easing: EXPO_OUT });
  const push = interpolate(frame, [24, END_CARD_SEC * FPS], [1, 1.03], clamp);
  const hero = props.images[props.shots[0]?.imageIndex ?? 0] ?? props.images[0];
  const cardW = WIDTH - SAFE.x * 2;
  const endTitle = [props.make, props.model].filter(Boolean).join(" ");
  const w = WIDTH + (cardW - WIDTH) * card;
  const h = BAND.height + (END.cardH - BAND.height) * card;
  const top = BAND.top + (END.cardTop - BAND.top) * card;
  const title = fitHeadline(endTitle, 76, cardW);
  const kicker = props.year ? String(props.year) : "";
  return (
    <AbsoluteFill style={{ backgroundColor: `rgba(11,13,16,${bgP})` }}>
      <div style={{ position: "absolute", left: (WIDTH - w) / 2, top, width: w, height: h, borderRadius: 32 * card, overflow: "hidden" }}>
        <Img src={staticFile(hero)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "contrast(1.06) saturate(0.92) brightness(0.96)", transform: `scale(${push})` }} />
      </div>
      <div style={{ position: "absolute", left: SAFE.x, top: END.title, width: cardW, display: "flex", alignItems: "baseline", gap: 18, flexWrap: "nowrap" }}>
        {kicker ? <Kicker text={kicker} zh={zh} start={14} /> : null}
        <MaskLine tokens={[title.lines.join(" ")]} start={18} stagger={0} size={Math.min(title.size, Math.floor(cardW / (textUnits(endTitle) + (kicker ? 2.2 : 0))))} font={f.display} weight={900} color={PAPER} gap={0} />
      </div>
      <div style={{ position: "absolute", left: SAFE.x, top: END.priceTop + END.priceH + 34, width: cardW, textAlign: "center" }}>
        <MaskCenter start={30}>
          <div style={{ fontFamily: f.body, fontWeight: 900, fontSize: 46, color: PAPER, letterSpacing: "-0.01em" }}>{props.cta}</div>
        </MaskCenter>
        {props.contact ? (
          <MaskCenter start={36}>
            <div style={{ fontFamily: f.mono, fontWeight: 700, fontSize: 40, color: PAPER, marginTop: 14 }}>{props.contact}</div>
          </MaskCenter>
        ) : null}
        <MaskCenter start={42}>
          <div style={{ fontFamily: f.mono, fontWeight: 700, fontSize: 34, color: MUTE, marginTop: 14, letterSpacing: "0.04em" }}>{props.site}</div>
        </MaskCenter>
      </div>
    </AbsoluteFill>
  );
};

const MaskCenter: React.FC<{ start: number; children: React.ReactNode }> = ({ start, children }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + ENTER], [1, 0], { ...clamp, easing: EXPO_OUT });
  return (
    <div style={{ overflow: "hidden" }}>
      <div style={{ transform: `translateY(${p * 110}%)` }}>{children}</div>
    </div>
  );
};

// ---------- finishing: lit ground (vignette) + seeded per-frame grain ----------
const Finish: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.38) 100%)" }} />
      <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", inset: 0, opacity: 0.045, mixBlendMode: "overlay" }}>
        <filter id={`g${frame}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 97} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${frame})`} />
      </svg>
    </AbsoluteFill>
  );
};

// ---------- composition ----------
export const Reel: React.FC<ReelProps> = (props) => {
  const frame = useCurrentFrame();
  const zh = props.lang === "zh";
  useState(() => {
    if (!zh) return null;
    const text = props.captions.map((c) => c.word).join("") + props.shots.map((s) => s.onScreenText).join("") + props.cta + "低于市场价私信询价英里" + (props.contact ?? "") + props.chips.map((c) => (c ? c.label + c.value : "")).join("");
    const subsets = notoSubsetsFor(text);
    return subsets.length ? loadNoto("normal", { weights: ["400", "700", "900"], subsets: subsets as "chinese-simplified"[], ignoreTooManyRequestsWarning: true }) : null;
  });
  const D = props.durationInFrames;
  const endStart = D - END_CARD_SEC * FPS;
  const bounds = shotBounds(props.shots.map((s) => s.durationSec), endStart);
  const chunks = chunkCaptions(props.captions, zh);
  // Every cut gets a 1.5% frame bump that decays in ~0.15 s.
  const cues = [...bounds.flatMap((b) => [b.from, ...(subCut(b.len) ? [b.from + subCut(b.len)!] : [])]), endStart].filter((c) => c > 0);
  const last = cues.filter((c) => c <= frame).at(-1);
  const bump = last === undefined ? 0 : 0.015 * Math.exp(-(frame - last) / 4.5);
  return (
    <AbsoluteFill style={{ backgroundColor: INK }}>
      <AbsoluteFill style={{ transform: `scale(${1 + bump})` }}>
        {props.shots.map((_, i) => (
          <Sequence key={i} from={bounds[i].from - (i === 0 ? 0 : WIPE)} durationInFrames={bounds[i].len + (i === 0 ? 0 : WIPE)} layout="none">
            <AbsoluteFill>
              <Shot props={props} index={i} len={bounds[i].len} zh={zh} />
            </AbsoluteFill>
          </Sequence>
        ))}
        <Sequence from={endStart} layout="none">
          <EndCard props={props} zh={zh} />
        </Sequence>
      </AbsoluteFill>
      <PriceBar props={props} zh={zh} endStart={endStart} />
      {props.badge.show && props.badge.pct > 0 ? <Badge pct={Math.round(props.badge.pct)} zh={zh} endStart={endStart} /> : null}
      <Captions props={props} zh={zh} chunks={chunks} endStart={endStart} />
      <Finish />
      {props.audio ? <Html5Audio src={staticFile(props.audio)} /> : null}
      {props.music ? (
        <Html5Audio
          src={staticFile(props.music)}
          // Music sits well under the voice and ducks further while a word is being spoken.
          volume={(f) => {
            const t = f / FPS;
            const speaking = props.audio && props.captions.some((w) => t >= w.startSec - 0.08 && t <= w.endSec + 0.12);
            const fadeOut = interpolate(f, [D - 45, D - 1], [1, 0], clamp);
            return (props.audio ? (speaking ? 0.16 : 0.32) : 0.6) * fadeOut;
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
