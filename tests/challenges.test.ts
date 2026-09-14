import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateDrillQuestion, generateDrillQuestions, DRILL_INFO, type DrillKind, type DrillDifficulty
} from '../src/engine/challenges';
import { mulberry32, type MedicineData } from '../src/engine/products';
import fs from 'node:fs';
import path from 'node:path';

let data: MedicineData;
beforeAll(() => {
  data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/data/medicines.json'), 'utf8'));
});

const KINDS: DrillKind[] = ['change500', 'change1000', 'discount', 'partial', 'mixed'];
const DIFFS: DrillDifficulty[] = ['easy', 'medium', 'hard'];

describe('drill generators', () => {
  it('all 5 kinds exist with metadata', () => {
    for (const k of KINDS) {
      expect(DRILL_INFO[k].title.length).toBeGreaterThan(0);
      expect(DRILL_INFO[k].blurb.length).toBeGreaterThan(0);
    }
  });

  it('change drills: change = paid − bill, positive, whole rupees', () => {
    for (const kind of ['change500', 'change1000'] as DrillKind[]) {
      const paid = kind === 'change500' ? 500 : 1000;
      for (const diff of DIFFS) {
        for (let i = 0; i < 300; i++) {
          const q = generateDrillQuestion(kind, diff, data.items, mulberry32(i + 77), i);
          expect(q).not.toBeNull();
          const billPaise = paid * 100 - q!.answerPaise;
          expect(billPaise).toBeGreaterThan(0);
          expect(billPaise).toBeLessThan(paid * 100);
          expect(q!.answerPaise % 100).toBe(0); // whole rupees
          expect(q!.answerLabel).toBe(`₹${(q!.answerPaise / 100).toFixed(0)}`);
        }
      }
    }
  });

  it('discount drills: selling = mrp − rounded discount, clean integer', () => {
    for (const diff of DIFFS) {
      for (let i = 0; i < 300; i++) {
        const q = generateDrillQuestion('discount', diff, data.items, mulberry32(i + 999), i)!;
        // parse "X% off MRP ₹Y"
        const m = q.detail.match(/(\d+)% off MRP ₹(\d+)/);
        expect(m).not.toBeNull();
        const pct = Number(m![1]);
        const mrp = Number(m![2]);
        const discount = Math.round((mrp * 100 * pct / 100) / 100) * 100;
        const expected = mrp * 100 - discount;
        expect(q.answerPaise).toBe(expected);
        expect(q.answerPaise % 100).toBe(0);
        expect(q.answerPaise).toBeGreaterThan(0);
      }
    }
  });

  it('partial drills: units × unit price (whole rupees)', () => {
    for (const diff of DIFFS) {
      for (let i = 0; i < 300; i++) {
        const q = generateDrillQuestion('partial', diff, data.items, mulberry32(i + 1234), i)!;
        const m = q.detail.match(/^(\d+) tablet/);
        expect(m).not.toBeNull();
        expect(q.answerPaise % 100).toBe(0);
        expect(q.answerPaise).toBeGreaterThan(0);
      }
    }
  });

  it('mixed drills: change = payment − bill, payment covers bill', () => {
    for (const diff of DIFFS) {
      for (let i = 0; i < 200; i++) {
        const q = generateDrillQuestion('mixed', diff, data.items, mulberry32(i + 5555), i)!;
        // detail contains "total ₹X · pays ₹Y"
        const m = q.detail.match(/total ₹(\d+) · pays ₹(\d+)/);
        expect(m).not.toBeNull();
        const total = Number(m![1]) * 100;
        const paid = Number(m![2]) * 100;
        expect(paid).toBeGreaterThanOrEqual(total);
        expect(q.answerPaise).toBe(paid - total);
        expect(q.answerPaise % 100).toBe(0);
      }
    }
  });

  it('batch generation returns the requested count', () => {
    for (const kind of KINDS) {
      const qs = generateDrillQuestions(kind, 'medium', 20, data.items, 42);
      expect(qs).toHaveLength(20);
      for (const q of qs) {
        expect(q.answerPaise % 100).toBe(0);
        expect(q.answerPaise).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
