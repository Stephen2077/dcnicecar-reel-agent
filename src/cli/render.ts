import { parseArgs, runCli } from "../args.ts";
import { renderReel } from "../render.ts";
import { parseLang } from "../script.ts";

runCli(async () => {
  const { pos, flags } = parseArgs();
  if (!pos[0]) throw new Error("usage: npx tsx src/cli/render.ts out/<slug> --lang zh|en");
  const t0 = Date.now();
  let last = -1;
  const r = await renderReel(pos[0], parseLang(flags.lang), (p) => {
    const pct = Math.floor(p * 10) * 10;
    if (pct !== last) console.error(`render ${(last = pct)}%`);
  });
  console.log(JSON.stringify({ ...r, renderSec: +((Date.now() - t0) / 1000).toFixed(1) }));
});
