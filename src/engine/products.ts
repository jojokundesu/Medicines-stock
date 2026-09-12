// Product catalogue types & helpers.

export type Product = {
  id: number;
  name: string;
  category: string;
  form: string;
  mrp: number;            // rupees (whole) — in-game billing price
  mrpExact?: number;      // original CSV MRP (may include paise)
  pack: number;           // units per pack
  unit: number | null;    // price per single unit (when partial allowed)
  partialAllowed: boolean;
  stock: number;
  expiry: string;
};

export type MedicineData = {
  generated: string;
  count: number;
  summary: Record<string, number>;
  items: Product[];
};

export function loadMedicines(json: MedicineData): Product[] {
  return json.items;
}

export function pickProduct<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
