# DC Nice Car reel agent

An AI web tool for used-car dealership salespeople. Snap 3–12 photos of a car, and get back a ready-to-post
30-second vertical (9:16) reel plus listing captions.

**How it works**

1. **Upload 3–12 photos** in a mobile web page.
2. **Grok vision** (SpaceXAI, via an AI gateway) recognizes the car (make / model) and orders the photos into shots
   (hero, side, rear, wheels, interior…).
3. **Grok** writes a short narration, shot list, and captions — Chinese and/or English.
4. **ElevenLabs** voices the narration with word-level timings → animated subtitles.
5. **Remotion** renders a 30 s vertical reel (product-launch-film motion, synthesized music bed).
6. You also get a **Xiaohongshu (小红书)** post and a **Facebook Marketplace** description, with copy buttons.

Built at **Tech@NYU Shipyard, 2026-10-24**. Tracks: SpaceXAI, ElevenLabs, DigitalOcean.

## Run it

Requires Node 20+ and ffmpeg (Remotion downloads a headless Chrome on first render).

```bash
npm install

# required
export AI_GATEWAY_API_KEY=...        # AI gateway key used for Grok (text + vision)
# optional
export ELEVENLABS_API_KEY=...        # without it, reels render silent with estimated captions
export ELEVENLABS_VOICE_ID=...       # also ELEVENLABS_MODEL_ID
# GROK_MODEL, GROK_VISION_MODEL, GROK_FALLBACK_MODEL, GROK_TIMEOUT_MS,
# PORT (default 8787), FAKE_PIPELINE=1 (UI demo without API calls),
# REMOTION_BROWSER, RENDER_CONCURRENCY, REEL_MUSIC=0

# web app -> http://127.0.0.1:8787
npx tsx web/server.ts

# or step by step from the CLI
npx tsx src/cli/photos.ts <photosDir> [--price N] [--mileage N] [--year-model "2024 Honda Accord"]
npx tsx src/cli/script.ts out/<slug>/listing.json --lang zh|en
npx tsx src/cli/voice.ts out/<slug>/script-<lang>.json
npx tsx src/cli/render.ts out/<slug> --lang zh|en     # -> out/<slug>/reel-<lang>.mp4

npm test          # unit tests, no network
npm run typecheck
```

More detail: [README-dev.md](README-dev.md), [CONTRACT.md](CONTRACT.md), [DESIGN.md](DESIGN.md), [HANDOFF.md](HANDOFF.md) (hackathon handoff notes, Chinese).

## Credits

- [huashu-motion](https://github.com/alchaincyf/huashu-motion) (MIT) — motion-design rules, re-implemented; no code copied.
- [earshot](https://github.com/Leonxlnx/earshot) (MIT) — sound-design reference; no code copied.
- [Remotion](https://remotion.dev) for rendering — check Remotion's license for company use. See [CREDITS.md](CREDITS.md).

## License

MIT © 2026 Stephen MO
