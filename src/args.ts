// Tiny argv helper: positional args plus `--flag value` pairs.
export function parseArgs(argv = process.argv.slice(2)) {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) flags[a.slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : "";
    else pos.push(a);
  }
  return { pos, flags };
}

export async function runCli(main: () => Promise<void>) {
  try {
    await main();
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
}
