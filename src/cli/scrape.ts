import { parseArgs, runCli } from "../args.ts";
import { scrape } from "../scrape.ts";

runCli(async () => {
  const { pos, flags } = parseArgs();
  if (!pos[0]) throw new Error("usage: npx tsx src/cli/scrape.ts <dcnicecar listing url> [--images 8]");
  const { listing, dir } = await scrape(pos[0], { images: flags.images ? Number(flags.images) : 8 });
  const { imageUrls, ...summary } = listing;
  console.log(JSON.stringify({ dir, ...summary, imageUrlCount: imageUrls.length }, null, 2));
});
