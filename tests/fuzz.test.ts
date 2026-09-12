import { describe, it, expect, beforeAll } from 'vitest';
import { generateScenario, validateScenario, DIFFICULTY, computeBill } from '../src/engine/engine';
import { makeChangeFromDrawer, defaultDrawer, sumCounts, rupeeToPaise } from '../src/engine/money';
import { mulberry32, type MedicineData } from '../src/engine/products';
import fs from 'node:fs';
import path from 'node:path';

let data: MedicineData;
beforeAll(() => {
  data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/medicines.json'), 'utf8'));
});

describe('fuzz: mass generation invariants', () => {
  it('validates 12k scenarios with zero problems', () => {
    const diffs = [DIFFICULTY.easy, DIFFICULTY.medium, DIFFICULTY.hard, DIFFICULTY.expert];
    let problems = 0;
    const firstProblem = [] as string[];
    for (let i = 0; i < 12000; i++) {
      const spec = generateScenario({
        difficulty: diffs[i % 4],
        products: data.items,
        rng: mulberry32(i * 31 + 7)
      });
      const errs = validateScenario(spec);
      if (errs.length) {
        problems++;
        if (firstProblem.length < 5) firstProblem.push(`[${diffs[i % 4].label}] ${i}: ${errs.join(';')}`);
      }
      const again = computeBill(spec.lines, spec.discounts);
      if (again.total !== spec.bill.total && firstProblem.length < 5) {
        problems++;
        firstProblem.push(`[${diffs[i % 4].label}] ${i}: recompute mismatch`);
      }
    }
    expect(problems, firstProblem.join('\n')).toBe(0);
  });

  it('optimal change is always serviceable from the default float', () => {
    for (let i = 0; i < 2000; i++) {
      const spec = generateScenario({
        difficulty: DIFFICULTY.expert,
        products: data.items,
        rng: mulberry32(i * 97 + 13)
      });
      if (spec.payment.change <= 0) continue;
      const r = makeChangeFromDrawer(spec.payment.change, defaultDrawer());
      expect(r.exact).toBe(true);
      expect(sumCounts(r.counts)).toBe(spec.payment.change);
    }
  });

  it('every generated payment covers the bill', () => {
    for (let i = 0; i < 2000; i++) {
      const spec = generateScenario({
        difficulty: DIFFICULTY.hard,
        products: data.items,
        rng: mulberry32(i * 53 + 3)
      });
      expect(spec.payment.amount).toBeGreaterThanOrEqual(spec.bill.total);
      expect(spec.payment.change).toBe(spec.payment.amount - spec.bill.total);
    }
  });

  it('money is always integer paise and whole-rupee at bill level', () => {
    for (let i = 0; i < 2000; i++) {
      const spec = generateScenario({
        difficulty: DIFFICULTY.expert,
        products: data.items,
        rng: mulberry32(i * 17 + 5)
      });
      for (const v of [spec.bill.total, spec.bill.subtotal, spec.payment.amount, spec.payment.change]) {
        expect(Number.isInteger(v)).toBe(true);
      }
      expect(spec.bill.total % 100).toBe(0);
      expect(spec.payment.amount % 100).toBe(0);
      expect(rupeeToPaise(Math.round(spec.bill.total / 100))).toBe(spec.bill.total);
    }
  });
});
