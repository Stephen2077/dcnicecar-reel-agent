import { parseArgs, runCli } from "../args.ts";
import { parseLang, scriptFromFile } from "../script.ts";

runCli(async () => {
  const { pos, flags } = parseArgs();
  if (!pos[0]) throw new Error("usage: npx tsx src/cli/script.ts out/<slug>/listing.json [--lang zh|en] [--badge-pct N] [--tweak \"<one sentence>\"]");
  const badgePct = flags["badge-pct"] ? Number(flags["badge-pct"]) : undefined;
  const t0 = Date.now();
  const { script, out } = await scriptFromFile(pos[0], { badgePct, lang: parseLang(flags.lang), tweak: flags.tweak || undefined });
  console.error(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(script, null, 2));
});
