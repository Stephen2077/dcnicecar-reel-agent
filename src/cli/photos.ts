import { parseArgs, runCli } from "../args.ts";
import { listingFromPhotos } from "../sources/photos.ts";

runCli(async () => {
  const { pos, flags } = parseArgs();
  if (!pos[0])
    throw new Error(
      'usage: npx tsx src/cli/photos.ts <photosDir> [--price N] [--mileage N] [--year-model "2024 Honda Accord"] [--contact "..."] [--vin X] [--slug S] [--out-root out] [--vision out/<slug>/vision.json]',
    );
  const num = (k: string) => {
    if (!flags[k]) return undefined;
    const n = Number(flags[k].replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) throw new Error(`--${k} must be a number`);
    return n;
  };
  const t0 = Date.now();
  const { listing, dir } = await listingFromPhotos(pos[0], {
    price: num("price"),
    mileage: num("mileage"),
    yearModel: flags["year-model"] || undefined,
    contact: flags.contact || undefined,
    vin: flags.vin || undefined,
    slug: flags.slug || undefined,
    outRoot: flags["out-root"] || undefined,
    visionFile: flags.vision || undefined,
  });
  console.error(`wrote ${dir}/listing.json in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(listing, null, 2));
});
