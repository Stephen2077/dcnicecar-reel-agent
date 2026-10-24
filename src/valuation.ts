import { readFile } from "node:fs/promises";

export interface ValueProvider {
  lookup(q: { vin: string; mileage: number }): Promise<{ baseValue: number } | null>;
}

export const SNAPSHOT_PATH = "data/mmr-snapshot.json";

export function snapshotMmrProvider(file = SNAPSHOT_PATH): ValueProvider {
  let rows: Promise<{ vin: string; mileage: number; value: number }[]> | null = null;
  return {
    async lookup({ vin }) {
      rows ??= readFile(file, "utf8").then(JSON.parse).catch(() => []);
      const hit = (await rows).find((r) => r.vin.toUpperCase() === vin.toUpperCase());
      return hit ? { baseValue: hit.value } : null;
    },
  };
}

export function manualProvider(reference: number): ValueProvider {
  return { lookup: async () => (reference > 0 ? { baseValue: reference } : null) };
}

export function badge(price: number, baseValue: number): { show: boolean; pct: number } {
  const pct = baseValue > 0 ? Math.floor(((baseValue - price) / baseValue) * 100) : 0;
  return price < baseValue && pct >= 1 ? { show: true, pct } : { show: false, pct: 0 };
}

// Returns only the badge; baseValue never leaves this function.
export async function valuate(q: { vin: string | null; mileage: number | null; price: number | null; reference?: number }) {
  if (!q.price) return { show: false, pct: 0 };
  const providers = q.reference ? [manualProvider(q.reference)] : [];
  if (q.vin) providers.push(snapshotMmrProvider());
  for (const p of providers) {
    const r = await p.lookup({ vin: q.vin ?? "", mileage: q.mileage ?? 0 });
    if (r) return badge(q.price, r.baseValue);
  }
  return { show: false, pct: 0 };
}
