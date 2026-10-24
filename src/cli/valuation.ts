import { parseArgs, runCli } from "../args.ts";
import { valuate } from "../valuation.ts";

runCli(async () => {
  const { pos, flags } = parseArgs();
  const [vin, mileage, price] = pos;
  if (!vin || !mileage || !price) throw new Error("usage: npx tsx src/cli/valuation.ts <vin> <mileage> <price> [--reference N]");
  const reference = flags.reference ? Number(flags.reference) : undefined;
  console.log(JSON.stringify(await valuate({ vin, mileage: Number(mileage), price: Number(price), reference })));
});
