# DESIGN.md — dcnicecar-reel-agent visual spec (v2)

Mood: "showroom at night". Real car photos do the talking; type and one accent color frame them. Restrained, premium, fast.
Language: English only (web + video). No internal info on screen (no model names, API names, traces, job ids).

## Style (v2, 2026-10-24): Huashu-motion product-launch film
Adapted from huashu-motion (MIT) rules; exact sources in remotion/HUASHU-NOTES.md. This section overrides Type / rhythm / motion below where they differ.
- **Type**: two families only. Display = Archivo 900 (Noto Sans SC 900 for zh), tracking -0.03em, one headline per beat, fit to 86% width (base 190-200 px; wraps to 2 lines ≤112 px below 0.55×). Kicker = Instrument Serif italic 54 px, mute. Numbers = JetBrains Mono 700. Spec labels mono 32 px, tracked.
- **Type motion**: mask reveal (yPercent 110→0, expo.out 0.6 s, 2-frame word stagger); exits power2.in 0.3 s; hook option "punch" = scale slam 1.7→1 on a stiff spring; spec value slams in one beat after each cut.
- **Beat grid**: 120 BPM (15 frames). Script shots stretch proportionally to fill `max(30 s, narration + 1 s)`, every cut snapped to the grid; shots ≥ 3 s split into a wide + a 1.5× detail crop cut on the beat (cut rate ≈ 2.5-3 s). 1.5% whole-frame bump on every cut, decays in ~0.15 s.
- **Camera on photos**: slow *linear-feeling* drift only (3% wide, 4% detail), never reversing inside a shot; no 12% Ken Burns.
- **Transitions**: no crossfades. Hard cuts on the beat inside a shot; between shots a 10-frame vertical line-mask wipe (paper edge, not Volt).
- **Finishing**: one grade for all photos (contrast 1.06 / saturate 0.92), vignette, seeded per-frame grain at ~4.5%.
- **End card** (6 s): band morphs into a rounded card, then year+model, price, CTA, `listing.contact` (when given), site mask-reveal one after another; hold ≥ 2 s.
- **Music**: code-synthesized 120 BPM bed (ffmpeg aevalsrc, A-F-C-G); ~0.16 gain while a word is spoken, 0.32 in pauses, 0.6 when silent; 1.5 s fade-out.
- **Safe area changed**: bottom 300 → **520 px** (Huashu social-ad safe zone). Photo band moved to y 540-1180; captions sit between band and price bar.
- **Palette kept** (brand rule: Huashu colour.md says use the brand's own colours). Change: Volt is now strictly scarce — price bar, badge, active caption word only (no Volt wipe edge). Mute lightened #8A8F98 → #A7A9B0 for legibility of the serif kicker. Note Huashu lists "near-black ground + lime accent + mono labels" as a generic house style; we keep it as the dealer's brand look, flagged as an open question.

## Palette (max 5)
| token | hex | use |
|---|---|---|
| ink | #0B0D10 | backgrounds, letterbox, end card |
| paper | #F5F3EE | primary text |
| mute | #8A8F98 | secondary text, spec labels |
| accent (Volt) | #D7FF3A | ONE accent: price bar, badge, active caption word |
| scrim | rgba(11,13,16,0.72) | gradient under text on photos |
No purple/blue gradients, no particles, no glitch, no lens flares.

## Type
- Display: **Inter Tight 800** (tight tracking -0.02em), ALL CAPS for year/make, title case for model.
- Body/captions: **Inter 600**.
- Numbers (price, miles, VIN): **JetBrains Mono 700**, tabular-nums.
- Load via `@remotion/google-fonts` (bundled locally at render time).
- Safe area for 9:16: 64px sides, 220px top, 300px bottom (platform UI).

## Shot rhythm (30 s, 30 fps = 900 frames, 5-6 shots, change composition every 3-6 s)
1. **Hook 0-3 s**: hero photo full-bleed, push-in 1.00→1.10. Title arrives in 1-3 word fragments (YEAR / MAKE / MODEL). Price bar slides up from bottom.
2. **Shots 2-5 (3-24 s)**: one photo per shot, alternate Ken Burns moves: push-in, pull-out, slow pan L→R, push-in to detail. Each shot gets ONE spec chip (mileage, engine, drivetrain, exterior/interior) that slides in 12 frames out-cubic, 64px travel.
3. **End card 24-30 s**: ink background, photo shrinks into a rounded card (radius 36), big price, "dcnicecar.com", CTA "Message us for a test drive". Hold ≤2.5 s with micro-drift.
- Transitions: cross-dissolve 15 frames inOut-quad (outgoing layer does not fade first); at most ONE wipe (18 frames, 3px Volt edge) in the whole film.
- Through-line object: the **Volt price bar** (bottom, 96px tall). It persists across shots and morphs into the end-card price.

## Motion vocabulary (from motion-prompt / cinetic defaults)
- Ken Burns (camera #027/#028): 75-150 frames per shot, bezier(.65,0,.35,1), scale 1.00↔1.12, translate ≤4%.
- Count-up price (motion #007): 36 frames, out-quart, tabular-nums, settles to exact price.
- Chip slide-in (ui #050/#056): 12 frames out-cubic, stagger 4 frames.
- Springs: high damping (damping ≥ 24, stiffness 140, mass 0.9) — no bouncy overshoot.
- Everything is a pure function of frame; no timers, no unseeded randomness.

## Captions
- Word-level from narration timestamps. 1-4 words on screen at a time, Inter 600 56px, paper on scrim; the currently spoken word in Volt.
- Position: above the price bar, inside safe area. Never overlap the badge.

## "Below market" badge
- Only rendered when listing price < reference value from the snapshot provider (or manual input). Hidden otherwise.
- Shape: rotated -6° Volt stamp, ink text, JetBrains Mono 700: `BELOW MARKET 8%` (integer %). Stamp-in at ~1.5 s: scale 1.4→1.0 over 10 frames + 1 frame offset shadow. Top-right inside safe area.
- NEVER show the reference value or any MMR number anywhere (video, web, logs shown to user, repo).

## Web UI (minimal)
- Single page, ink background, one input ("Paste a dcnicecar.com listing link"), optional "Reference value (optional)" field, one Volt button "Make reel".
- Progress as 5 human steps: Reading listing → Writing script → Recording voice → Rendering video → Done. No logs.
- Result: inline 9:16 player, Download MP4, two copy boxes (Xiaohongshu / Marketplace) with Copy buttons.
- Errors are friendly: "Network issue, try again", "That link doesn't look like a dcnicecar.com listing".

## References used (Stephen's bookmarks / stars)
- minchoi motion-director prompt — https://x.com/i/status/2111306178164584547 (director role, first frame finished, one through-line object)
- RoundtableSpace "8 Opus video repos" — https://x.com/RoundtableSpace/status/2112872778332250534
- RoundtableSpace "give your AI a DESIGN.md" (awesome-design-md) — https://x.com/RoundtableSpace/status/2113106821091143750 (why this file exists)
- LaunchMotion 208 effects — https://x.com/yihui_indie/status/2113090833906020581
- The_Alex "edit entirely in Codex/Claude Code" — https://x.com/The_Alex/status/2113389624441926143
- awe0_io "15 s, 900 frames, 0 manual keyframes" — https://x.com/awe0_io/status/2113108161276342720
- huashu-motion — https://github.com/alchaincyf/huashu-motion (starred 10-18) — **current style source (v2)**, AlchainHust post https://x.com/AlchainHust/status/2113061393541050715
- motion-prompt dictionary — https://github.com/showheyohtaki/motion-prompt (starred 10-17)
- earshot / cinetic timing rules — https://github.com/Leonxlnx/earshot (starred 10-18)
- mg-styles-15 — https://github.com/Vincentwei1021/mg-styles-15 ; claude-motion — https://github.com/whaleyxbt/claude-motion ; ffmpeg-skill — https://github.com/kajisho5/ffmpeg-skill (starred 10-24)
