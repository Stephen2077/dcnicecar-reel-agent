# Huashu-motion → our 9:16 car reel

Source: huashu-motion (MIT, © 2026 Huashu, https://github.com/alchaincyf/huashu-motion).
Paths below are relative to `skills/huashu-motion/references/` unless they start with `templates/` or `runtime/`.
Rules only, re-implemented in `remotion/Reel.tsx` and `src/render.ts`. No Huashu code, fonts or assets copied.
craft.md:160-162 says none of these numbers are universal, so treat them as tuned defaults.

## Adopted
- **Mask-reveal headline** (techniques.md:49-51, "premium default"): tokens rise from yPercent 110 inside `overflow:hidden`, expo.out, staggered → `MaskLine` (18 frames, 1-2 frame stagger).
- **Entrance timing** (techniques.md:11-13): expo.out over 0.5-0.9 s, with the hit at 30-40% of the move → `EXPO_OUT` = cubic-bezier(0.16,1,0.3,1) over 0.6 s.
- **Exits** (techniques.md:71): 0.25-0.4 s power2.in → `EXIT` = 9 frames, `Easing.in(quad)`.
- **Scale slam** (techniques.md:191-192; runtime y5 kinetic-type 96-100): 1.7× → 1× on a stiff spring → hook style `punch` and the spec value in `Chip`.
- **Headline sizing** (runtime/clip/grammars/y5_kinetic_type.js:30-33): fit to 86% of the width; below 0.55× of the base size, wrap to 2 lines → `fitHeadline` (base 190-200 px; capped at 112 px for 2 lines so it fits above the photo band).
- **Two typefaces, heavy grotesk + italic serif or mono** (library/languages/kinetic-type.md:118,140) → Archivo 900 (Noto Sans SC 900 for zh) + Instrument Serif italic kicker; mono only for numbers and labels.
- **Label size ≥ 32 px at 1080p, tracked labels** (experience.md:83; y5:79) → chip label is mono 32 px with wide tracking.
- **Beat grid** (rhythm.md:140-141, 100-125 BPM; card-montage.md:250) → 120 BPM, `BEAT` = 15 frames. Every cut is snapped to the grid (`shotBounds`), and cuts land on the beat (rhythm.md:101).
- **Cut rate** (rhythm.md:23-25, launch films cut every 1.8-3.5 s; card-montage.md:249, 1.5-3 s per screen) → shots of 3 s or more split into a wide plus a detail crop, cut on the beat (`subCut`). The cut rate becomes about 2.5-3 s.
- **Change ≥ 2 things at a boundary** (rhythm.md:74) → at a shot change the photo, headline, kicker and spec chip all change, plus the wipe.
- **Frame bump on every cue** (y5_kinetic_type.js:52-53): 1.5% scale that decays over about 0.15 s → `bump` in `Reel`.
- **Photo drift** (techniques.md:155-156, 1-3% linear; card-montage.md:248) → 3% on the wide, 4% on the detail crop. It replaces the old 12% eased Ken Burns.
- **Never reverse direction mid-scene, no back-to-back zoom in and out** (techniques.md:184, :153) → `drift()` is monotonic within a shot.
- **No crossfades** (techniques.md:126-128, "almost always the weakest") → hard cuts inside a shot. Between shots a line-mask wipe (`clip-path: inset(...)`, photo-led.md:210, techniques.md:64,106) lasts 10 frames with a paper edge.
- **Text over photos only with a scrim** (photo-led.md:221) → gradient scrims on the band; captions sit on a scrim pill.
- **Grade all photos alike** (photo-led.md:209) → one CSS filter for every photo.
- **Lit ground: vignette + grain** (colour.md:54; techniques.md:236-237, grain 3-6%, re-seeded every frame; keynote vignette t2:99-100) → `Finish`: radial vignette to 0.38, seeded `feTurbulence` grain at 4.5%.
- **Accent is scarce and has one meaning** (colour.md:34-40,61) → Volt only on the price bar, badge and active caption word. The wipe edge is paper, not Volt.
- **Use the brand's own colours** (colour.md:66-77) → the DESIGN.md palette is kept.
- **Social-ad safe zones**: top 220, bottom 520 at 1080×1920 (formats.md:106-107) → `SAFE.bottom` 300 → 520, layout re-flowed.
- **End card** (formats.md:81-88: elements gather, hold ≥ 1 s; formats.md:106: name/CTA ≥ 2 s; card-montage.md:244: logo, promise, URL). The band morphs into the card, then year+model, price, CTA, `listing.contact`, site mask-reveal in turn; held for about 4.5 s.
- **Spec label slammed with each shot** (rhythm.md:107, GoPro "8K60, 4K240") → `Chip`: the label rises, then the value slams one beat after the cut.
- **Music levels** (sound.md:308: music about 12 LU under the voice, ducking on every word; music −18 LUFS): the bed is −14.8 LUFS at gain 1. Gain is 0.16 while a word is spoken (≈ −31 LUFS, about 12.5 LU under the −18.2 LUFS ElevenLabs voice), 0.32 in pauses, and 0.6 with no narration.
- **Music approach** (kinetic-type.md:145-146; rhythm.md:146-148: 110-125 BPM, kick/hat from bar 1): code-synthesized with ffmpeg `aevalsrc` at 120 BPM (kick on beats, offbeat hat, root bass, power-chord pad, A-F-C-G every 2 bars), beat-locked to the picture grid.

## Skipped (and why)
- **300-400 px headlines** (kinetic-type.md:117): car model names are long ("Accord Hybrid Sport"), so 86%-width fitting gives about 110-200 px.
- **Blur-in** (keynote t2:118-126): techniques.md:67-69 calls it generic.
- **Whip pans, white flash, glitch, shockwave, light sweep, camera shake**: optional spice. Kept out for a calm dealer look and for render time.
- **Burst of 5-8 cuts at about 37%, two drops, riser/impact/subdrop, silence before the last line** (rhythm.md:38-50; kinetic-type.md:145-146): needs per-film editing against the voice. Not done.
- **Motion blur via subframes** (techniques.md:322-324): would multiply render time 8×.
- **Mastering to −14 LUFS integrated** (sound.md:308): the mix comes out at about −18 LUFS (en). No loudnorm pass yet.
- **Their `om sound` ABC-score tool and fonts** (sound.md:197-199; fonts/ are OFL, not MIT): not used. We use Google Fonts via Remotion and our own ffmpeg synth.
- **"Made with huashu-motion" signature corner** (SKILL.md:80): it is the tool's own render branding, not a license requirement.
- **Open question:** Huashu's "house style" anti-pattern (library/README.md:67-71: near-black ground, lime accent, giant grotesk, mono labels) describes our palette. We kept it as the brand look; Stephen to decide.
