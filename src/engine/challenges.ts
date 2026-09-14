// Training-drill generators. Reuse the tested billing/rounding math so every
// answer matches the main game exactly. All money is integer paise.

import { computeBill, rupeeRound } from './engine';
import type { Discount, OrderLine } from './types';
import { mulberry32, type Product } from './products';
import { rupeeToPaise } from './money';

export type DrillKind = 'change500' | 'change1000' | 'discount' | 'partial' | 'mixed';
export type DrillDifficulty = 'easy' | 'medium' | 'hard';

export type DrillQuestion = {
  id: number;
  prompt: string;
  detail: string;
  answerPaise: number;
  answerLabel: string;
  hint: string;
};

export const DRILL_INFO: Record<DrillKind, { title: string; blurb: string; icon: string }> = {
  change500: { title: '₹500 Note Challenge', blurb: 'Every customer pays ₹500. Make change automatic.', icon: '💵' },
  change1000: { title: '₹1,000 Note Challenge', blurb: 'Big notes, bigger bills. Change in a flash.', icon: '💰' },
  discount: { title: 'Discount Drill', blurb: 'Percent off, instantly. MRP → selling price.', icon: '🏷️' },
  partial: { title: 'Partial Quantity Drill', blurb: 'Loose units from strips — unit-price intuition.', icon: '💊' },
  mixed: { title: 'Mixed Challenge', blurb: 'Bill + discount + change in one go.', icon: '🔥' }
};

// Percent pools with MRPs that produce clean (integer) discounts.
const CLEAN_MRPS: Record<number, number[]> = (() => {
  const out: Record<number, number[]> = {};
  const multiples = (step: number, from: number, to: number) => {
    const arr: number[] = [];
    for (let m = from; m <= to; m += step) arr.push(m);
    return arr;
  };
  out[5] = multiples(20, 100, 2000);
  out[10] = multiples(10, 100, 2000);
  out[15] = multiples(20, 100, 2000);
  out[20] = multiples(5, 100, 2000);
  out[25] = multiples(4, 100, 2000);
  out[30] = multiples(10, 100, 2000);
  out[12] = multiples(25, 100, 2000);
  out[17] = multiples(100, 100, 2000);
  out[7] = multiples(100, 100, 2000);
  return out;
})();

const PERCENT_POOL: Record<DrillDifficulty, number[]> = {
  easy: [5, 10, 20],
  medium: [5, 10, 15, 20, 25],
  hard: [7, 12, 17, 25, 30]
};

function rangeFor(kind: DrillKind, diff: DrillDifficulty): [number, number] {
  if (kind === 'change500') {
    if (diff === 'easy') return [20, 490];
    if (diff === 'medium') return [20, 490];
    return [20, 490];
  }
  if (kind === 'change1000') {
    if (diff === 'easy') return [50, 950];
    if (diff === 'medium') return [50, 950];
    return [50, 950];
  }
  return [0, 0];
}

function changeBill(diff: DrillDifficulty, lo: number, hi: number, rng: () => number): number {
  if (diff === 'easy') {
    // round multiples of 10 — simple subtraction
    const k = Math.floor(rng() * ((hi - lo) / 10 + 1));
    return lo + k * 10;
  }
  if (diff === 'medium') {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }
  // hard: awkward non-round amounts (borrow-heavy)
  let bill = 0;
  do {
    bill = lo + Math.floor(rng() * (hi - lo + 1));
  } while (bill % 10 === 0);
  return bill;
}

function discountPair(diff: DrillDifficulty, rng: () => number): { mrp: number; pct: number } {
  const pcts = PERCENT_POOL[diff];
  const pct = pcts[Math.floor(rng() * pcts.length)];
  const pool = CLEAN_MRPS[pct] || CLEAN_MRPS[10];
  const mrp = pool[Math.floor(rng() * pool.length)];
  return { mrp, pct };
}

function pickPartialProduct(products: Product[], rng: () => number): Product | null {
  const pool = products.filter(p => p.partialAllowed && p.unit != null && p.unit > 0);
  if (!pool.length) return null;
  return pool[Math.floor(rng() * pool.length)];
}

function buildMixed(products: Product[], diff: DrillDifficulty, rng: () => number): DrillQuestion | null {
  // Reasonably-priced items so the bill is neither trivial nor over ₹2,000.
  const pool = products.filter(p => p.mrp >= 20 && p.mrp <= 500);
  if (!pool.length) return null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const lineCount = diff === 'easy' ? 1 : 1 + Math.floor(rng() * 2);
    const lines: OrderLine[] = [];
    const discounts: Discount[] = [];
    const used = new Set<number>();
    for (let i = 0; i < lineCount; i++) {
      let p: Product;
      let guard = 0;
      do {
        p = pool[Math.floor(rng() * pool.length)];
      } while (used.has(p.id) && guard++ < 20);
      used.add(p.id);
      let quantity = 1, units = 0;
      if (p.partialAllowed && p.unit != null && diff !== 'easy' && rng() < 0.5) {
        units = 1 + Math.floor(rng() * (p.pack - 1));
        quantity = 0;
      } else {
        quantity = 1 + Math.floor(rng() * (diff === 'easy' ? 1 : 2));
      }
      lines.push({ product: p, quantity, units });
    }
    const pct = PERCENT_POOL[diff][Math.floor(rng() * PERCENT_POOL[diff].length)];
    discounts.push({ kind: 'shop', percent: pct, appliesTo: 'all' });
    const bill = computeBill(lines, discounts);
    if (bill.total < rupeeToPaise(5)) continue;
    if (bill.total > 200000) continue; // payment caps at ₹2,000

    const opts = [20000, 50000, 100000, 200000];
    const pay = opts.find(o => o >= bill.total)!;
    const change = pay - bill.total;

    const parts = lines.map(l => {
      const name = l.product.name;
      if (l.units > 0) return `${l.units} units of ${name}`;
      return `${l.quantity}× ${name}`;
    });
    const totalLabel = `₹${(bill.total / 100).toFixed(0)}`;
    const payLabel = `₹${(pay / 100).toFixed(0)}`;
    return {
      id: 0,
      prompt: 'Change to return?',
      detail: `${parts.join(', ')} · ${pct}% off · total ${totalLabel} · pays ${payLabel}`,
      answerPaise: change,
      answerLabel: `₹${(change / 100).toFixed(0)}`,
      hint: `Bill ${totalLabel}, paid ${payLabel}. Subtract.`
    };
  }
  return null;
}

export function generateDrillQuestion(kind: DrillKind, diff: DrillDifficulty, products: Product[], rng: () => number, id: number): DrillQuestion | null {
  if (kind === 'change500' || kind === 'change1000') {
    const paid = kind === 'change500' ? 50000 : 100000;
    const [lo, hi] = rangeFor(kind, diff);
    const bill = changeBill(diff, lo, hi, rng);
    const change = paid - rupeeToPaise(bill);
    return {
      id,
      prompt: 'Change to return?',
      detail: `Bill ₹${bill} · customer pays ₹${paid / 100}`,
      answerPaise: change,
      answerLabel: `₹${(change / 100).toFixed(0)}`,
      hint: `Count up from ₹${bill} to ₹${paid / 100}.`
    };
  }
  if (kind === 'discount') {
    const { mrp, pct } = discountPair(diff, rng);
    const discount = rupeeRound(rupeeToPaise(mrp) * pct / 100);
    const sell = rupeeToPaise(mrp) - discount;
    return {
      id,
      prompt: 'Selling price?',
      detail: `${pct}% off MRP ₹${mrp}`,
      answerPaise: sell,
      answerLabel: `₹${(sell / 100).toFixed(0)}`,
      hint: `${pct}% of ₹${mrp} = ₹${(discount / 100).toFixed(0)} off.`
    };
  }
  if (kind === 'partial') {
    const p = pickPartialProduct(products, rng);
    if (!p) return null;
    const units = 1 + Math.floor(rng() * (p.pack - 1));
    let gross = units * rupeeToPaise(p.unit!);
    let extra = '';
    let hint = `Strip ₹${p.mrp} / ${p.pack} → ₹${p.unit} each. ${units} × ₹${p.unit}.`;
    if (diff === 'hard' && rng() < 0.5) {
      const pct = [5, 10, 20][Math.floor(rng() * 3)];
      const discount = rupeeRound(gross * pct / 100);
      gross -= discount;
      extra = ` · ${pct}% off`;
      hint += ` Then ${pct}% off.`;
    }
    return {
      id,
      prompt: 'Total price?',
      detail: `${units} tablet${units > 1 ? 's' : ''} of ${p.name}${extra}`,
      answerPaise: gross,
      answerLabel: `₹${(gross / 100).toFixed(0)}`,
      hint
    };
  }
  if (kind === 'mixed') {
    return buildMixed(products, diff, rng);
  }
  return null;
}

export function generateDrillQuestions(
  kind: DrillKind,
  diff: DrillDifficulty,
  count: number,
  products: Product[],
  seed?: number
): DrillQuestion[] {
  const rng = mulberry32(seed ?? Math.floor(Math.random() * 1e9));
  const out: DrillQuestion[] = [];
  let attempts = 0;
  while (out.length < count && attempts < count * 20) {
    attempts++;
    const q = generateDrillQuestion(kind, diff, products, rng, out.length + 1);
    if (q) out.push(q);
  }
  return out;
}

// Provide whole-rupee helpers for UI formatting.
export function rupees(paise: number): string {
  return `₹${(paise / 100).toFixed(0)}`;
}
