// Transaction engine: scenario generation + independent validation.
// All money is integer paise.

import type { Product } from './products';
import { mulberry32, pickProduct } from './products';
import type {
  Bill, CustomerKind, CustomerSpec, DiffCategory, DiffReport, Discount,
  LineBreakdown, OrderLine, PaymentSpec, TransactionSpec
} from './types';
import { DEFAULT_DENOMS, makeChange, round2, rupeeToPaise, sumCounts, type Denom } from './money';

export const SIMPLE_PERCENTS = [5, 10, 15, 20];
export const EXTENDED_PERCENTS = [7, 12, 17, 25, 30];

export type DifficultyProfile = {
  label: string;
  maxLines: number;
  allowQuantities: boolean;      // quantities > 1
  allowPartial: boolean;         // partial quantities
  allowMultiDiscount: boolean;   // different discounts per product
  allowBargain: boolean;         // customer asks for extra % off
  percentPool: number[];
  paymentStyle: 'small' | 'mixed' | 'large';
  allowChangeNotes: boolean;
};

export const DIFFICULTY: Record<'easy' | 'medium' | 'hard' | 'expert', DifficultyProfile> = {
  easy: {
    label: 'Easy',
    maxLines: 1,
    allowQuantities: false,
    allowPartial: false,
    allowMultiDiscount: false,
    allowBargain: false,
    percentPool: SIMPLE_PERCENTS,
    paymentStyle: 'small',
    allowChangeNotes: true
  },
  medium: {
    label: 'Medium',
    maxLines: 3,
    allowQuantities: true,
    allowPartial: false,
    allowMultiDiscount: false,
    allowBargain: false,
    percentPool: SIMPLE_PERCENTS,
    paymentStyle: 'mixed',
    allowChangeNotes: true
  },
  hard: {
    label: 'Hard',
    maxLines: 4,
    allowQuantities: true,
    allowPartial: true,
    allowMultiDiscount: true,
    allowBargain: true,
    percentPool: SIMPLE_PERCENTS.concat(EXTENDED_PERCENTS),
    paymentStyle: 'large',
    allowChangeNotes: true
  },
  expert: {
    label: 'Expert',
    maxLines: 6,
    allowQuantities: true,
    allowPartial: true,
    allowMultiDiscount: true,
    allowBargain: true,
    percentPool: SIMPLE_PERCENTS.concat(EXTENDED_PERCENTS),
    paymentStyle: 'large',
    allowChangeNotes: true
  }
};

const NAMES: Record<CustomerKind, string[]> = {
  patient: ['Ramesh', 'Sita', 'Meera'],
  impatient: ['Vikram', 'Priya', 'Arjun'],
  confused: ['Kavita', 'Sanjay'],
  talkative: ['Chintu', 'Rekha'],
  big: ['Big Order Uncle', 'Sharma Ji'],
  exact: ['Exact-Change Didi', 'Precise Kumar'],
  'large-note': ['Bade Note Wale', 'Five Hundred Sir'],
  bargainer: ['Negotiate Kaka', 'Chhotu Bhaiya'],
  fast: ['Fast Firoz', 'Quick Qasim'],
  elderly: ['Dadi Ji', 'Nanaji'],
  distracting: ['Question Qureshi', 'Gappu']
};

const GREETINGS: Record<CustomerKind, string[]> = {
  patient: ['Bhaiya, dheere se. {order}.'],
  impatient: ['Jaldi karo bhaiya. {order}.'],
  confused: ['Umm… {order}. Yaar, theek se yaad nahi…'],
  talkative: ['Arre bhaiya, suno na. {order}. Aur haan, aaj mausam accha hai!'],
  big: ['Bhaiya, list hai meri. {order}.'],
  exact: ['{order}. Aur main exact paise dunga.'],
  'large-note': ['{order}. Paas mein bas bada note hai.'],
  bargainer: ['{order}. Aur thoda discount to banta hai na?'],
  fast: ['{order}. Fast fast!'],
  elderly: ['Beta, zara sun lena. {order}.'],
  distracting: ['{order}. Waise aapka naam kya hai? Aur ye dukaan kitne baje khulti hai?']
};

export function describeOrder(lines: OrderLine[]): string {
  const parts = lines.map(l => {
    if (l.units > 0 && l.product.partialAllowed) {
      return `${l.units} ${unitName(l.product, l.units)} of ${l.product.name}`;
    }
    return `${l.quantity} pack${l.quantity > 1 ? 's' : ''} of ${l.product.name}`;
  });
  return parts.join(', ');
}

function unitName(p: Product, n: number): string {
  const lower = p.form.toLowerCase();
  if (lower.includes('tab')) return n === 1 ? 'tablet' : 'tablets';
  if (lower.includes('cap')) return n === 1 ? 'capsule' : 'capsules';
  return n === 1 ? 'piece' : 'pieces';
}

export function customerDialogue(kind: CustomerKind, lines: OrderLine[], discountPct: number | null, bargainPct: number | null): string {
  const g = GREETINGS[kind] ?? GREETINGS.patient;
  let d = g[0].replace('{order}', describeOrder(lines));
  if (bargainPct != null) d += ` Aur ${bargainPct}% extra off kar do na.`;
  else if (discountPct != null && kind !== 'bargainer') d += ` ${discountPct}% discount laga do.`;
  return d;
}

/** Round paise to the nearest whole rupee (multiple of 100). */
export function rupeeRound(paise: number): number {
  return Math.round(paise / 100) * 100;
}

/** Compute a line breakdown. Integer paise, whole-rupee for v1. */
export function computeLine(line: OrderLine, discountPct: number): LineBreakdown {
  const p = line.product;
  const unitPricePaise = p.partialAllowed && p.unit != null ? rupeeToPaise(p.unit) : null;
  let gross: number;
  if (line.units > 0 && p.partialAllowed && unitPricePaise != null) {
    // loose units priced at unit price (whole-rupee), plus any whole packs
    gross = line.quantity * rupeeToPaise(p.mrp) + line.units * unitPricePaise;
  } else if (line.quantity === 0 && line.units === 0) {
    gross = 0;
  } else {
    gross = line.quantity * rupeeToPaise(p.mrp);
  }
  // Discount rounded to the nearest whole rupee (standard retail rounding).
  const discountAmt = rupeeRound(gross * discountPct / 100);
  const net = gross - discountAmt;
  return {
    product: p,
    quantity: line.quantity,
    units: line.units,
    mrp: rupeeToPaise(p.mrp),
    unitPrice: unitPricePaise,
    gross,
    discountPct,
    discountAmt,
    net
  };
}

/** Resolve per-line discount percentages.
 *  shop / product discounts take the max; bargain discounts stack additively on top. */
export function resolveDiscounts(spec: { discounts: Discount[] }, lines: OrderLine[]): number[] {
  const out = lines.map(() => 0);
  const base = lines.map(() => 0);
  for (const d of spec.discounts) {
    if (d.kind === 'bargain') {
      // additive "extra off" — applies on top of whatever the line already has
      if (d.appliesTo === 'all') {
        for (let i = 0; i < lines.length; i++) out[i] += d.percent;
      } else if (d.productIndex != null && d.productIndex >= 0 && d.productIndex < lines.length) {
        out[d.productIndex] += d.percent;
      }
    } else if (d.appliesTo === 'all') {
      for (let i = 0; i < lines.length; i++) base[i] = Math.max(base[i], d.percent);
    } else if (d.productIndex != null && d.productIndex >= 0 && d.productIndex < lines.length) {
      base[d.productIndex] = Math.max(base[d.productIndex], d.percent);
    }
  }
  for (let i = 0; i < lines.length; i++) out[i] = Math.min(100, base[i] + out[i]);
  return out;
}

export function computeBill(lines: OrderLine[], discounts: Discount[]): Bill {
  const pcts = resolveDiscounts({ discounts }, lines);
  const breakdown = lines.map((l, i) => computeLine(l, pcts[i]));
  let subtotal = 0, totalDiscount = 0;
  for (const b of breakdown) { subtotal += b.gross; totalDiscount += b.discountAmt; }
  return { lines: breakdown, subtotal, totalDiscount, total: subtotal - totalDiscount };
}

// ---------- Scenario generation ----------

export type ScenarioParams = {
  difficulty: DifficultyProfile;
  products: Product[];
  denoms?: Denom[];
  rng?: () => number;
};

function chooseCountable(products: Product[], allowPartial: boolean, rng: () => number): Product {
  const pool = allowPartial
    ? products.filter(p => p.partialAllowed)
    : products;
  const source = pool.length ? pool : products;
  return pickProduct(source, rng);
}

function chooseQuantity(p: Product, allowQuantities: boolean, rng: () => number): { quantity: number; units: number } {
  if (!allowQuantities) return { quantity: 1, units: 0 };
  const roll = rng();
  if (p.partialAllowed && roll < 0.5) {
    // partial quantity: 0..2 packs + loose units
    const quantity = Math.floor(rng() * 2);
    const maxUnits = p.pack - 1;
    const units = maxUnits > 0 ? 1 + Math.floor(rng() * maxUnits) : 0;
    return { quantity, units };
  }
  const quantity = 1 + Math.floor(rng() * 4); // 1..4
  return { quantity, units: 0 };
}

function buildDiscounts(
  lines: OrderLine[],
  profile: DifficultyProfile,
  rng: () => number
): { discounts: Discount[]; shopPct: number | null; bargainPct: number | null } {
  const discounts: Discount[] = [];
  let shopPct: number | null = null;
  let bargainPct: number | null = null;

  const applyShop = rng() < 0.6;
  if (applyShop) {
    shopPct = profile.percentPool[Math.floor(rng() * profile.percentPool.length)];
    discounts.push({ kind: 'shop', percent: shopPct, appliesTo: 'all' });
  }

  if (profile.allowMultiDiscount && lines.length > 1 && rng() < 0.35) {
    // per-product discounts on top of shop discount
    for (let i = 0; i < lines.length; i++) {
      if (rng() < 0.4) {
        const p = profile.percentPool[Math.floor(rng() * profile.percentPool.length)];
        discounts.push({ kind: 'product', percent: p, appliesTo: 'single', productIndex: i });
      }
    }
  }

  if (profile.allowBargain && rng() < 0.25) {
    const opts = [5, 10, 15, 20];
    bargainPct = opts[Math.floor(rng() * opts.length)];
    discounts.push({ kind: 'bargain', percent: bargainPct, appliesTo: 'all' });
  }

  return { discounts, shopPct, bargainPct };
}

function pickPayment(
  totalPaise: number,
  style: DifficultyProfile['paymentStyle'],
  rng: () => number,
  denoms: Denom[]
): PaymentSpec {
  if (style === 'small') {
    // small overpayments: 100, 200, 500 or exact-ish
    const opts = [100, 200, 500];
    const over = Math.max(100, opts[Math.floor(rng() * opts.length)]);
    // ensure payment >= total (use exact if total already bigger than pick)
    const pay = Math.max(over, Math.ceil(totalPaise / 100) * 100);
    return buildPayment(totalPaise, pay, denoms);
  }
  if (style === 'mixed') {
    const opts = [100, 200, 500, 1000];
    const over = opts[Math.floor(rng() * opts.length)];
    const pay = Math.max(over, Math.ceil(totalPaise / 100) * 100);
    return buildPayment(totalPaise, pay, denoms);
  }
  // large: 500 / 1000 / 2000
  const opts = [500, 1000, 2000];
  const over = opts[Math.floor(rng() * opts.length)];
  const pay = Math.max(over, Math.ceil(totalPaise / 100) * 100);
  return buildPayment(totalPaise, pay, denoms);
}

/** Decompose a payment amount into the fewest notes (greedy). */
function buildPayment(totalPaise: number, payPaise: number, denoms: Denom[]): PaymentSpec {
  const counts = makeChange(payPaise, denoms) ?? {};
  const change = payPaise - totalPaise;
  const changeCounts = change > 0 ? (makeChange(change, denoms) ?? {}) : {};
  return { given: counts, amount: payPaise, change, changeCounts };
}

function pickCustomerKind(profile: DifficultyProfile, rng: () => number): CustomerKind {
  const roll = rng();
  if (profile === DIFFICULTY.easy) {
    return roll < 0.7 ? 'patient' : 'exact';
  }
  const pool: CustomerKind[] = ['patient', 'impatient', 'confused', 'talkative', 'big', 'exact', 'large-note', 'bargainer', 'fast', 'elderly'];
  return pool[Math.floor(rng() * pool.length)];
}

export function generateScenario(
  params: ScenarioParams
): TransactionSpec {
  const profile = params.difficulty;
  const products = params.products;
  const rng = params.rng ?? mulberry32(Math.floor(Math.random() * 1e9));
  const denoms = params.denoms ?? DEFAULT_DENOMS;

  const lineCount = 1 + Math.floor(rng() * profile.maxLines);
  const lines: OrderLine[] = [];
  const usedNames = new Set<number>();
  for (let i = 0; i < lineCount; i++) {
    let p = chooseCountable(products, profile.allowPartial, rng);
    let guard = 0;
    while (usedNames.has(p.id) && guard++ < 10) p = chooseCountable(products, profile.allowPartial, rng);
    usedNames.add(p.id);
    const { quantity, units } = chooseQuantity(p, profile.allowQuantities, rng);
    if (quantity === 0 && units === 0) { /* ensure at least something */ }
    lines.push({ product: p, quantity: Math.max(0, quantity), units });
  }

  const { discounts, shopPct, bargainPct } = buildDiscounts(lines, profile, rng);
  const bill = computeBill(lines, discounts);

  // Guard against pathological freebies / zero totals
  if (bill.total < rupeeToPaise(1)) {
    return generateScenario(params);
  }

  const kind = pickCustomerKind(profile, rng);
  const payment = pickPayment(bill.total, profile.paymentStyle, rng, denoms);

  const names = NAMES[kind];
  const customer: CustomerSpec = {
    id: Math.floor(rng() * 1e9),
    kind,
    name: names[Math.floor(rng() * names.length)],
    dialogue: [],
    patienceMs: patienceFor(kind, profile, rng),
    speaksFast: kind === 'fast' || kind === 'impatient'
  };
  customer.dialogue = [customerDialogue(kind, lines, shopPct, bargainPct)];

  return {
    id: Math.floor(rng() * 1e9),
    lines,
    discounts,
    customer,
    bill,
    payment
  };
}

function patienceFor(kind: CustomerKind, profile: DifficultyProfile, rng: () => number): number {
  const base = profile === DIFFICULTY.easy ? 45000
    : profile === DIFFICULTY.medium ? 30000
    : profile === DIFFICULTY.hard ? 22000
    : 15000;
  const factor = kind === 'patient' || kind === 'elderly' ? 1.6
    : kind === 'impatient' || kind === 'fast' ? 0.55
    : 1.0;
  return Math.round(base * factor * (0.85 + rng() * 0.3));
}

// ---------- Validation / diffing ----------

export function classifyBillDiff(
  playerTotalPaise: number,
  spec: TransactionSpec
): DiffCategory[] {
  const cats: DiffCategory[] = [];
  const correct = spec.bill.total;
  if (playerTotalPaise === correct) return cats;
  const diff = correct - playerTotalPaise;

  // Did they forget a discount entirely?
  const gross = spec.bill.subtotal;
  if (playerTotalPaise === gross) cats.push('forgot-discount');
  // Did they double-apply a discount?
  const doubleDisc = Math.round(gross - 2 * spec.bill.totalDiscount);
  if (playerTotalPaise === doubleDisc) cats.push('discount-twice');
  // Off by a whole product MRP?
  for (const line of spec.bill.lines) {
    if (Math.abs(diff) === line.mrp) { cats.push('wrong-product'); break; }
    if (line.unitPrice && Math.abs(diff) === line.unitPrice) { cats.push('quantity'); break; }
    if (line.units > 0 && Math.abs(diff) === line.unitPrice) { cats.push('forgot-partial'); break; }
  }
  if (!cats.length) {
    if (spec.bill.totalDiscount > 0 && Math.abs(diff) === spec.bill.totalDiscount) cats.push('discount');
    else cats.push('addition');
  }
  return cats;
}

export function classifyChangeDiff(
  playerChangePaise: number,
  spec: TransactionSpec
): DiffCategory {
  if (playerChangePaise === spec.payment.change) return 'none';
  // Distinguish subtraction errors from payment-recognition errors
  const paidTotal = spec.payment.amount;
  const wouldBe = paidTotal - playerChangePaise;
  if (wouldBe === spec.bill.total) return 'payment-recognition';
  if (wouldBe === spec.bill.subtotal) return 'subtraction';
  return 'change-calculation';
}

export function diffTransaction(
  answers: {
    billTotalPaise: number;
    changePaise: number;
    changeCounts: Record<string, number>;
  },
  spec: TransactionSpec
): DiffReport {
  const billCorrect = answers.billTotalPaise === spec.bill.total;
  const changeCorrect = answers.changePaise === spec.payment.change;
  const denomTotal = sumCounts(answers.changeCounts);
  const denominationsCorrect = changeCorrect && denomTotal === spec.payment.change;

  const categories: DiffCategory[] = [];
  if (!billCorrect) categories.push(...classifyBillDiff(answers.billTotalPaise, spec));
  if (!changeCorrect) categories.push(classifyChangeDiff(answers.changePaise, spec));
  else if (!denominationsCorrect) categories.push('wrong-denomination');

  return { billCorrect, changeCorrect, denominationsCorrect, categories };
}

/** Round-trip the whole transaction and assert internal consistency. */
export function validateScenario(spec: TransactionSpec): string[] {
  const problems: string[] = [];
  const { bill, payment } = spec;
  for (const line of bill.lines) {
    if (line.gross - line.discountAmt !== line.net) problems.push(`line net mismatch: ${line.product.name}`);
    if (line.net < 0) problems.push(`negative line: ${line.product.name}`);
    if (line.discountPct < 0 || line.discountPct > 100) problems.push(`bad discount: ${line.product.name}`);
  }
  if (bill.subtotal - bill.totalDiscount !== bill.total) problems.push('bill total mismatch');
  if (payment.change !== payment.amount - bill.total) problems.push('payment/change mismatch');
  if (payment.change < 0) problems.push('negative change');
  const givenTotal = sumCounts(payment.given);
  if (givenTotal !== payment.amount) problems.push('payment given mismatch');
  const changeTotal = sumCounts(payment.changeCounts);
  if (payment.change > 0 && changeTotal !== payment.change) problems.push('change counts mismatch');
  for (const b of bill.lines) {
    if (b.product.partialAllowed && b.units > 0 && b.product.unit == null) problems.push('partial without unit');
    if (b.units > 0 && b.units >= b.product.pack) problems.push('loose units exceed pack');
  }
  // Rounding sanity: every value must be integer paise
  const vals = [bill.subtotal, bill.totalDiscount, bill.total, payment.amount, payment.change];
  for (const v of vals) if (!Number.isInteger(v)) problems.push('non-integer money');
  return problems;
}

export { round2 };
