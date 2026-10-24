# Internal contract between pipeline (src/) and web (web/)
- Pipeline per job dir out/<slug>/ :
  - listing.json (scrape or auction adapter)
  - script-<lang>.json  (lang = zh | en)   ← `npx tsx src/cli/script.ts <listing.json> --lang zh|en [--badge-pct N] [--tweak "<one sentence>"]`
  - narration-<lang>.mp3 + captions-<lang>.json ← `npx tsx src/cli/voice.ts <script-<lang>.json> [--audio file]` (no ElevenLabs key + no audio → captions estimated, silent video allowed with flag --silent)
  - reel-<lang>.mp4 ← `npx tsx src/cli/render.ts out/<slug> --lang zh|en`
  - result-<lang>.json {lang, video, xiaohongshu, marketplace?(en only), badge}
- One-shot: `npx tsx src/cli/run.ts <dcnicecar URL | auction car dir> --lang zh|en|both [--price N] [--reference N] [--tweak "..."] [--audio-zh f] [--audio-en f]`
  prints progress lines to stdout as JSON: {"step":"listing|script|voice|render|done","lang":"zh"} and errors as {"error":"<friendly text>"}.

## UPDATE (12:55): primary input is now UPLOADED PHOTOS (web has NO link input)
- `npx tsx src/cli/photos.ts <photosDir> [--price N] [--mileage N] [--year-model "2024 Honda Accord"] [--contact "..."] [--vin X]` → creates out/<slug>/listing.json (same Listing shape, source:"photos", images ordered into shot order) + out/<slug>/vision.json. Owned by the web agent (src/sources/photos.ts + src/cli/photos.ts only).
- Web then calls per-step CLIs: script.ts (--lang, --tweak), voice.ts, render.ts. Listing fields may be null; null price → no price bar, null mileage → not mentioned. listing.contact (optional string) shown on end card if present.
