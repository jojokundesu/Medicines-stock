// Currency & money utilities — integer paise throughout to avoid float error.

export type Denom = { id: string; value: number; kind: 'note' | 'coin'; label: string; enabled: boolean };

// Values are in PAISE (₹1 = 100).
export const DEFAULT_DENOMS: Denom[] = [
  { id: 'c1', value: 100, kind: 'coin', label: '₹1', enabled: true },
  { id: 'c2', value: 200, kind: 'coin', label: '₹2', enabled: true },
  { id: 'c5', value: 500, kind: 'coin', label: '₹5', enabled: true },
  { id: 'c10', value: 1000, kind: 'coin', label: '₹10', enabled: true },
  { id: 'c20', value: 2000, kind: 'coin', label: '₹20', enabled: true },
  { id: 'n10', value: 1000, kind: 'note', label: '₹10', enabled: true },
  { id: 'n20', value: 2000, kind: 'note', label: '₹20', enabled: true },
  { id: 'n50', value: 5000, kind: 'note', label: '₹50', enabled: true },
  { id: 'n100', value: 10000, kind: 'note', label: '₹100', enabled: true },
  { id: 'n200', value: 20000, kind: 'note', label: '₹200', enabled: true },
  { id: 'n500', value: 50000, kind: 'note', label: '₹500', enabled: true },
  { id: 'n2000', value: 200000, kind: 'note', label: '₹2000', enabled: true }
];

export function rupeeToPaise(r: number): number {
  return Math.round(r * 100);
}
export function paiseToRupee(p: number): number {
  return Math.round(p) / 100;
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatINR(p: number): string {
  const rupees = p / 100;
  const sign = rupees < 0 ? '−' : '';
  const abs = Math.abs(rupees);
  let s: string;
  if (Number.isInteger(abs)) s = abs.toLocaleString('en-IN');
  else s = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sign + '₹' + s;
}

export function paiseFromINR(s: string | number): number {
  if (typeof s === 'number') return rupeeToPaise(s);
  const t = String(s).replace(/[^\d.-]/g, '');
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  return rupeeToPaise(n);
}

export type DenomCounts = Record<string, number>;

/** Sum of denomination counts, in paise. */
export function sumCounts(counts: DenomCounts, denoms: Denom[] = DEFAULT_DENOMS): number {
  let total = 0;
  for (const d of denoms) total += (counts[d.id] || 0) * d.value;
  return total;
}

/** Greedy minimum-note decomposition of an amount (paise) using enabled denoms. */
export function makeChange(amountPaise: number, denoms: Denom[] = DEFAULT_DENOMS): DenomCounts | null {
  const usable = denoms.filter(d => d.enabled).sort((a, b) => b.value - a.value);
  let remaining = amountPaise;
  const out: DenomCounts = {};
  for (const d of usable) {
    if (d.value <= 0) continue;
    const c = Math.floor(remaining / d.value);
    if (c > 0) { out[d.id] = c; remaining -= c * d.value; }
  }
  if (remaining !== 0) return null; // cannot make exact with these denoms
  return out;
}

export type DrawerState = DenomCounts;

/** Create a starting cash drawer with generous float. */
export function defaultDrawer(): DrawerState {
  return {
    c1: 40, c2: 30, c5: 30, c10: 30, c20: 20,
    n10: 20, n20: 20, n50: 15, n100: 15, n200: 10, n500: 8, n2000: 0
  };
}

export function drawerTotal(drawer: DrawerState, denoms: Denom[] = DEFAULT_DENOMS): number {
  return sumCounts(drawer, denoms);
}

/**
 * Find the best change combination limited by what is available in the drawer.
 * Returns { counts, exact, count } — exact=false when the drawer cannot make exact change.
 * Uses DP for the minimum note/coin count, preferring larger denominations on ties.
 */
export function makeChangeFromDrawer(
  amountPaise: number,
  drawer: DrawerState,
  denoms: Denom[] = DEFAULT_DENOMS
): { counts: DenomCounts; exact: boolean; count: number } {
  const usable = denoms.filter(d => d.enabled).sort((a, b) => a.value - b.value);
  const INF = Number.MAX_SAFE_INTEGER;
  // dp[i] = min coins to make i paise
  const dp = new Array<number>(amountPaise + 1).fill(INF);
  const choice = new Array<{ denom: Denom | null; prev: number }>(amountPaise + 1);
  for (let i = 0; i <= amountPaise; i++) choice[i] = { denom: null, prev: 0 };
  dp[0] = 0;
  for (let a = 1; a <= amountPaise; a++) {
    for (const d of usable) {
      if (d.value > a) continue;
      const prev = a - d.value;
      if (dp[prev] === INF) continue;
      // availability check is done at extraction time; for DP we only need feasibility,
      // so compute theoretical min coins first, then check availability with greed fallback.
      if (dp[prev] + 1 < dp[a]) {
        dp[a] = dp[prev] + 1;
        choice[a] = { denom: d, prev };
      }
    }
  }
  if (dp[amountPaise] === INF) {
    return { counts: {}, exact: false, count: 0 };
  }
  // Reconstruct theoretical best
  const theo: DenomCounts = {};
  let a = amountPaise;
  while (a > 0) {
    const d = choice[a].denom!;
    theo[d.id] = (theo[d.id] || 0) + 1;
    a = choice[a].prev;
  }
  // Check availability against drawer
  const available: DenomCounts = { ...drawer };
  const canServe = Object.entries(theo).every(([id, c]) => (available[id] || 0) >= c);
  if (canServe) {
    return { counts: theo, exact: true, count: dp[amountPaise] };
  }
  // Fallback: greedy from drawer
  const greedy: DenomCounts = {};
  let rem = amountPaise;
  const avail = { ...drawer };
  for (const d of [...usable].sort((x, y) => y.value - x.value)) {
    const take = Math.min(Math.floor(rem / d.value), avail[d.id] || 0);
    if (take > 0) { greedy[d.id] = take; rem -= take * d.value; }
  }
  if (rem === 0) {
    let c = 0;
    for (const id of Object.keys(greedy)) c += greedy[id];
    return { counts: greedy, exact: true, count: c };
  }
  return { counts: greedy, exact: false, count: 0 };
}

/** Apply a payment+change movement to a drawer (immutably). */
export function applyDrawer(drawer: DrawerState, give: DenomCounts, take: DenomCounts): DrawerState {
  const next = { ...drawer };
  for (const [id, c] of Object.entries(give)) next[id] = (next[id] || 0) + c;
  for (const [id, c] of Object.entries(take)) next[id] = (next[id] || 0) - c;
  return next;
}
