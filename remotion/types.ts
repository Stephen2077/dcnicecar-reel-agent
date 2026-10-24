// Props for the "Reel" composition. Built by src/render.ts from listing.json + script-<lang>.json + captions-<lang>.json.
export type ReelLang = "zh" | "en";
export type Move = "push-in" | "pull-out" | "pan-left" | "pan-right";

export type ReelProps = {
  lang: ReelLang;
  durationInFrames: number;
  year: number | null;
  make: string | null;
  model: string | null;
  price: number | null;
  mileage: number | null;
  /** staticFile() paths: sharp frame-sized photos and matching blurred backdrops. */
  images: string[];
  backdrops: string[];
  shots: { imageIndex: number; durationSec: number; onScreenText: string; move: Move }[];
  /** One spec chip per shot (index-aligned with shots); null = no chip. */
  chips: ({ label: string; value: string } | null)[];
  captions: { word: string; startSec: number; endSec: number }[];
  badge: { show: boolean; pct: number };
  audio: string | null;
  /** Code-synthesized 120 BPM music bed (staticFile path), ducked under the narration. */
  music: string | null;
  /** Dealer contact line for the end card (listing.contact), if given. */
  contact: string | null;
  style?: { priceScale?: number; hookStyle?: string };
  cta: string;
  site: string;
};

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const END_CARD_SEC = 6;
/** 120 BPM beat grid: every cut lands on a multiple of this many frames. */
export const BEAT = 15;
