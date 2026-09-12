import { describe, it, expect, beforeAll } from 'vitest';
import {
  DEFAULT_DENOMS, makeChange, makeChangeFromDrawer, sumCounts, defaultDrawer,
  rupeeToPaise, paiseToRupee, formatINR, applyDrawer
} from '../src/engine/money';
import {
  computeBill, generateScenario, validateScenario, DIFFICULTY, diffTransaction,
  classifyBillDiff, classifyChangeDiff
} from '../src/engine/engine';
import type { MedicineData } from '../src/engine/products';
import { mulberry32 } from '../src/engine/products';
import fs from 'node:fs';
import path from 'node:path';

let data: MedicineData;
beforeAll(() => {
  const p = path.resolve(__dirname, '../public/data/medicines.json');
  data = JSON.parse(fs.readFileSync(p, 'utf8')) as MedicineData;
  expect(data.items.length).toBeGreaterThan(50);
});

describe('money', () => {
  it('formats INR', () => {
    expect(formatINR(rupeeToPaise(137))).toBe('₹137');
    expect(formatINR(rupeeToPaise(137.5))).toBe('₹137.50');
    expect(formatINR(rupeeToPaise(1000))).toBe('₹1,000');
  });

  it('round-trips paise', () => {
    expect(paiseToRupee(rupeeToPaise(0.1 + 0.2))).toBe(0.3);
  });

  it('greedy change of 370 = 200+100+50+20 (4 pieces)', () => {
    const c = makeChange(rupeeToPaise(370));
    expect(sumCounts(c)).toBe(rupeeToPaise(370));
    const pieces = Object.values(c).reduce((a, b) => a + b, 0);
    expect(pieces).toBe(4);
    expect((c.n200 ?? 0) + (c.c20 ?? 0) >= 1).toBe(true);
    expect(c.n100 ?? 0).toBe(1);
    expect(c.n50 ?? 0).toBe(1);
  });

  it('change of 27 = 20+5+2', () => {
    const c = makeChange(rupeeToPaise(27));
    expect(sumCounts(c)).toBe(rupeeToPaise(27));
    expect(c).toMatchObject({ c20: 1, c5: 1, c2: 1 });
  });

  it('change of 363 = 200+100+50+10+2+1', () => {
    const c = makeChange(rupeeToPaise(363));
    expect(sumCounts(c)).toBe(rupeeToPaise(363));
    const count = Object.values(c).reduce((a, b) => a + b, 0);
    expect(count).toBe(6);
  });

  it('minimal coin count for 363 is 6', () => {
    const c = makeChange(rupeeToPaise(363));
    const count = Object.values(c).reduce((a, b) => a + b, 0);
    expect(count).toBe(6);
  });

  it('respects drawer constraints (no ₹2 coins)', () => {
    const drawer = defaultDrawer();
    drawer.c2 = 0;
    const r = makeChangeFromDrawer(rupeeToPaise(27), drawer);
    expect(r.exact).toBe(true);
    expect(sumCounts(r.counts)).toBe(rupeeToPaise(27));
    // must not use ₹2
    expect(r.counts.c2 ?? 0).toBe(0);
  });

  it('flags impossible change when drawer empty', () => {
    const empty: Record<string, number> = {};
    const r = makeChangeFromDrawer(rupeeToPaise(27), empty);
    expect(r.exact).toBe(false);
  });

  it('applies drawer movements', () => {
    const d0 = defaultDrawer();
    const t0 = sumCounts(d0);
    const d1 = applyDrawer(d0, { n500: 1 }, { n200: 1, n100: 1, n50: 1, n20: 1 });
    expect(sumCounts(d1)).toBe(t0 + rupeeToPaise(500) - rupeeToPaise(370));
  });
});

describe('bill computation', () => {
  const mask = {
    id: 1, name: 'TEST', category: 'Surgical & Consumables', form: 'MASK',
    mrp: 6, pack: 1, unit: null, partialAllowed: false, stock: 100, expiry: '01/2030'
  };
  const strip = {
    id: 2, name: 'TEST STRIP', category: 'Tablets', form: 'TAB',
    mrp: 100, pack: 10, unit: 10, partialAllowed: true, stock: 100, expiry: '01/2030'
  };

  it('10% off 250 = 225', () => {
    const p = { ...strip, mrp: 250, unit: 25 };
    const bill = computeBill(
      [{ product: p, quantity: 1, units: 0 }],
      [{ kind: 'shop', percent: 10, appliesTo: 'all' }]
    );
    expect(bill.total).toBe(rupeeToPaise(225));
    expect(bill.totalDiscount).toBe(rupeeToPaise(25));
  });

  it('partial: 3 tablets of strip 10 @ MRP 100 = 30, 10% off = 27', () => {
    const bill = computeBill(
      [{ product: strip, quantity: 0, units: 3 }],
      [{ kind: 'shop', percent: 10, appliesTo: 'all' }]
    );
    expect(bill.lines[0].gross).toBe(rupeeToPaise(30));
    expect(bill.total).toBe(rupeeToPaise(27));
  });

  it('multiple products with different discounts', () => {
    const a = { ...strip, mrp: 200, unit: 20 };
    const b = { ...strip, mrp: 500, unit: 50 };
    const c = { ...mask, mrp: 150 };
    const bill = computeBill(
      [
        { product: a, quantity: 1, units: 0 },
        { product: b, quantity: 1, units: 0 },
        { product: c, quantity: 1, units: 0 }
      ],
      [
        { kind: 'product', percent: 10, appliesTo: 'single', productIndex: 0 },
        { kind: 'product', percent: 20, appliesTo: 'single', productIndex: 1 },
        { kind: 'product', percent: 5, appliesTo: 'single', productIndex: 2 }
      ]
    );
    // 180 + 400 + (150 → 5% → ₹142.5 → rounded ₹142) = 722
    expect(bill.total).toBe(rupeeToPaise(722));
  });

  it('multiple products 10% off: 100+250+80 = 430 → 387', () => {
    const a = { ...mask, mrp: 100 };
    const b = { ...mask, mrp: 250 };
    const c = { ...mask, mrp: 80 };
    const bill = computeBill(
      [
        { product: a, quantity: 1, units: 0 },
        { product: b, quantity: 1, units: 0 },
        { product: c, quantity: 1, units: 0 }
      ],
      [{ kind: 'shop', percent: 10, appliesTo: 'all' }]
    );
    expect(bill.total).toBe(rupeeToPaise(387));
  });

  it('bargain extra discount stacks on shop discount', () => {
    const p = { ...strip, mrp: 250, unit: 25 };
    const bill = computeBill(
      [{ product: p, quantity: 1, units: 0 }],
      [
        { kind: 'shop', percent: 10, appliesTo: 'all' },
        { kind: 'bargain', percent: 5, appliesTo: 'all' }
      ]
    );
    // 250 @ (10% + 5% bargain) = 15% → ₹37.5 → rounded ₹38 → ₹212
    expect(bill.total).toBe(rupeeToPaise(212));
  });
});

describe('scenario generation + validation', () => {
  it('generates valid scenarios across all difficulties', () => {
    const difficulties = [DIFFICULTY.easy, DIFFICULTY.medium, DIFFICULTY.hard, DIFFICULTY.expert];
    for (const d of difficulties) {
      for (let i = 0; i < 400; i++) {
        const spec = generateScenario({
          difficulty: d,
          products: data.items,
          rng: mulberry32(i + 1000)
        });
        const problems = validateScenario(spec);
        expect(problems, `${d.label} seed ${i}: ${problems.join('; ')}`).toEqual([]);
        expect(spec.bill.total).toBeGreaterThan(0);
        expect(spec.payment.amount).toBeGreaterThanOrEqual(spec.bill.total);
      }
    }
  });

  it('partial quantity lines always price from unit MRP', () => {
    for (let i = 0; i < 200; i++) {
      const spec = generateScenario({
        difficulty: DIFFICULTY.expert,
        products: data.items,
        rng: mulberry32(i + 5000)
      });
      for (const line of spec.bill.lines) {
        if (line.units > 0) {
          expect(line.product.partialAllowed).toBe(true);
          expect(line.unitPrice).toBe(rupeeToPaise(line.product.unit!));
        }
      }
    }
  });

  it('change is always non-negative and achievable', () => {
    for (let i = 0; i < 200; i++) {
      const spec = generateScenario({
        difficulty: DIFFICULTY.hard,
        products: data.items,
        rng: mulberry32(i + 9000)
      });
      expect(spec.payment.change).toBeGreaterThanOrEqual(0);
      if (spec.payment.change > 0) {
        expect(sumCounts(spec.payment.changeCounts)).toBe(spec.payment.change);
      }
    }
  });
});

describe('diff classification', () => {
  it('detects forgot-discount', () => {
    const p = {
      id: 9, name: 'X', category: 'Tablets', form: 'TAB', mrp: 100, pack: 10,
      unit: 10, partialAllowed: true, stock: 10, expiry: '01/2030'
    };
    const bill = computeBill(
      [{ product: p, quantity: 1, units: 0 }],
      [{ kind: 'shop', percent: 10, appliesTo: 'all' }]
    );
    const spec = {
      id: 1, lines: [{ product: p, quantity: 1, units: 0 }],
      discounts: [{ kind: 'shop' as const, percent: 10, appliesTo: 'all' as const }],
      customer: { id: 1, kind: 'patient' as const, name: 'T', dialogue: [], patienceMs: 10000, speaksFast: false },
      bill,
      payment: { given: { n100: 1 }, amount: 10000, change: 1000, changeCounts: { c10: 1 } }
    };
    const cats = classifyBillDiff(spec.bill.subtotal, spec);
    expect(cats).toContain('forgot-discount');
  });

  it('correct total yields no categories', () => {
    const spec = generateScenario({
      difficulty: DIFFICULTY.medium,
      products: data.items,
      rng: mulberry32(42)
    });
    expect(classifyBillDiff(spec.bill.total, spec)).toEqual([]);
  });

  it('change diff flags payment-recognition vs change-calculation', () => {
    const spec = generateScenario({
      difficulty: DIFFICULTY.medium,
      products: data.items,
      rng: mulberry32(7)
    });
    // If player thought payment was smaller than it was
    const wrongChange = spec.payment.amount - spec.bill.total - rupeeToPaise(100);
    const cat = classifyChangeDiff(wrongChange, spec);
    expect(['payment-recognition', 'change-calculation', 'subtraction']).toContain(cat);
  });
});

describe('math sanity (regression)', () => {
  it('500 − 137 = 363', () => {
    expect(rupeeToPaise(500) - rupeeToPaise(137)).toBe(rupeeToPaise(363));
  });
  it('2000 − 1376 = 624', () => {
    expect(rupeeToPaise(2000) - rupeeToPaise(1376)).toBe(rupeeToPaise(624));
  });
  it('10% of 475 = 47.5', () => {
    expect(Math.round(rupeeToPaise(475) * 10 / 100)).toBe(rupeeToPaise(47.5));
  });
  it('1275 × 15% discount → 1083.75', () => {
    const gross = rupeeToPaise(1275);
    const net = gross - Math.round(gross * 15 / 100);
    expect(net).toBe(rupeeToPaise(1083.75));
  });
});

describe('denominations config', () => {
  it('disables ₹2000 note', () => {
    const denoms = DEFAULT_DENOMS.map(d => d.id === 'n2000' ? { ...d, enabled: false } : d);
    const c = makeChange(rupeeToPaise(4000), denoms);
    expect(c.n2000 ?? 0).toBe(0);
    expect(sumCounts(c)).toBe(rupeeToPaise(4000));
  });
});
