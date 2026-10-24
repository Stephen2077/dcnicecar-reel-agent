# dcnicecar-reel-agent — backend dev notes

Node 20 + TypeScript via `npx tsx`. `npm install` first. Outputs go to `out/<uid>-<title-slug>/` (gitignored).

Env: `AI_GATEWAY_API_KEY` (required for script), `GROK_MODEL` (default `spacexai/grok-4.20-non-reasoning`: 8-13 s vs 110-126 s for `grok-4.7` on uid 1616, 2026-10-24; a 4th attempt falls back to `GROK_FALLBACK_MODEL`, default `spacexai/grok-4.7`),
`ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` (optional; without them pass `--audio`).

```bash
# 1. scrape listing + first N (<=8) photos -> listing.json, images/
npx tsx src/cli/scrape.ts "https://www.dcnicecar.com/showroom/?mod=document&pageid=1&uid=1616" --images 8

# 2. Grok script -> script-<lang>.json (narration, shots, xiaohongshu, marketplace, optional style hints)
npx tsx src/cli/script.ts out/<slug>/listing.json --lang zh|en [--badge-pct 9] [--tweak "make the price bigger"]

# 3. voice -> narration-<lang>.mp3 + captions-<lang>.json (ElevenLabs, --audio with estimated timings, or --silent)
npx tsx src/cli/voice.ts out/<slug>/script-<lang>.json [--audio existing.mp3 | --silent]

# 3b. Remotion render -> reel-<lang>.mp4 (bundle cached in .cache/, Chrome headless shell auto-downloaded;
#     REMOTION_BROWSER=/usr/bin/google-chrome to override, RENDER_CONCURRENCY default 4)
npx tsx src/cli/render.ts out/<slug> --lang zh|en

# 4. valuation badge -> prints only {"show","pct"}
# (optional) data/mmr-snapshot.json reference snapshot is built by a private tool, not included in this repo
npx tsx src/cli/valuation.ts <vin> <mileage> <price> [--reference N]

# all of the above -> out/<slug>/result-<lang>.json + reel-<lang>.mp4 (stdout = JSON progress lines, see CONTRACT.md)
npx tsx src/cli/run.ts <url | auction dir> --lang zh|en|both [--price N] [--reference N] [--tweak "..."] [--audio-zh f] [--audio-en f]

npm test        # unit tests (no network)
```

The reference/MMR value is never written to `out/` or printed; only `{show, pct}` leaves `valuation.ts`.
