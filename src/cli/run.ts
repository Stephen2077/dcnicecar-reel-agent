// One-shot pipeline per CONTRACT.md. stdout = JSON progress lines only; details go to stderr.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "../args.ts";
import { renderReel } from "../render.ts";
import { scrape } from "../scrape.ts";
import { generateScript, scriptPath, type Lang } from "../script.ts";
import { valuate } from "../valuation.ts";
import { voice } from "../voice.ts";

const emit = (o: Record<string, unknown>) => console.log(JSON.stringify(o));

export function friendly(e: unknown): string {
  const m = (e as Error)?.message ?? String(e);
  if (/usage:/.test(m)) return m;
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|timeout|aborted|HTTP 5\d\d/i.test(m)) return "Network issue, try again";
  if (/dcnicecar|uid|not a listing|Invalid URL/i.test(m)) return "That link doesn't look like a dcnicecar.com listing";
  if (/no (downloaded )?images|no photos/i.test(m)) return "This listing has no photos we can use";
  if (/Grok|AI Gateway|AI_GATEWAY/i.test(m)) return "Couldn't write the script right now, try again";
  if (/ElevenLabs/i.test(m)) return "Couldn't record the voice right now, try again";
  if (/browser|Chrome|render/i.test(m)) return "Couldn't render the video, try again";
  return "Something went wrong, try again";
}

async function main() {
  const { pos, flags } = parseArgs();
  if (!pos[0]) throw new Error('usage: npx tsx src/cli/run.ts <dcnicecar URL | auction car dir> --lang zh|en|both [--price N] [--reference N] [--tweak "..."] [--audio-zh f] [--audio-en f]');
  const langFlag = flags.lang || "zh";
  if (!["zh", "en", "both"].includes(langFlag)) throw new Error("usage: --lang must be zh, en or both");
  const langs: Lang[] = langFlag === "both" ? ["zh", "en"] : [langFlag as Lang];

  emit({ step: "listing", lang: langs[0] });
  // Optional private auction adapter (not in the public repo); falls back to the dcnicecar scraper.
  const auction = await import("../sources/" + "manheim.ts").catch(() => null);
  const { listing, dir } = auction && (await auction.isManheimDir(pos[0]))
    ? await auction.fromManheim(pos[0], { price: flags.price ? Number(flags.price) : undefined })
    : await scrape(pos[0]);
  console.error(`listing -> ${dir} (${listing.images.length} images)`);
  // Only {show, pct} is ever stored; the reference value stays in memory.
  const badge = await valuate({ ...listing, reference: flags.reference ? Number(flags.reference) : undefined });
  await writeFile(path.join(dir, "badge.json"), JSON.stringify(badge));

  for (const lang of langs) {
    emit({ step: "script", lang });
    const script = await generateScript(listing, { badgePct: badge.show ? badge.pct : undefined, lang, tweak: flags.tweak || undefined });
    await writeFile(scriptPath(dir, lang), JSON.stringify(script, null, 2));

    emit({ step: "voice", lang });
    const audio = flags[`audio-${lang}`] || undefined;
    try {
      await voice(script.narration, dir, { audio, lang, silent: true });
    } catch (e) {
      // TTS outage shouldn't block the reel: fall back to a silent video with estimated captions.
      console.error(`voice failed (${(e as Error).message.slice(0, 120)}); rendering silent`);
      await voice(script.narration, dir, { lang, silent: true, audio: undefined, noTts: true });
    }

    emit({ step: "render", lang });
    const r = await renderReel(dir, lang, (p) => console.error(`render ${lang} ${Math.round(p * 100)}%`));
    const result = {
      lang,
      video: r.video,
      xiaohongshu: script.xiaohongshu,
      ...(lang === "en" ? { marketplace: script.marketplace } : {}),
      badge,
    };
    await writeFile(path.join(dir, `result-${lang}.json`), JSON.stringify(result, null, 2));
    emit({ step: "done", lang, result: path.join(dir, `result-${lang}.json`), video: r.video, silent: r.silent });
  }
}

main().catch((e) => {
  console.error(`Error: ${(e as Error)?.message ?? e}`);
  emit({ error: friendly(e) });
  process.exit(1);
});
