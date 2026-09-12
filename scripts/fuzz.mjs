// Fuzz harness: generate tens of thousands of scenarios and validate invariants.
// Catches edge cases the focused unit tests may miss. Run: npm run fuzz
import { generateScenario, validateScenario, diffTransaction, DIFFICULTY, computeBill } from '../src/engine/engine.ts';
import { makeChange, makeChangeFromDrawer, sumCounts, defaultDrawer, rupeeToPaise } from '../src/engine/money.ts';
import { mulberry32 } from '../src/engine/products.ts';
import fs from 'node:fs';

const raw = fs.readFileSync(new URL('../public/data/medicines.json', import.meta.url), 'utf8');
const data = JSON.parse(raw);

const N = 8000;
let generated = 0;
let problems = 0;
const diffStats = {};
const changeDiffStats = {};
let impossibleChange = 0;

for (let i = 0; i < N; i++) {
  const dlist = [DIFFICULTY.easy, DIFFICULTY.medium, DIFFICULTY.hard, DIFFICULTY.expert];
  const d = dlist[i % 4];
  const spec = generateScenario({ difficulty: d, products: data.items, rng: mulberry32(i * 31 + 7) });
  generated++;

  const errs = validateScenario(spec);
  if (errs.length) {
    problems++;
    console.log(`[${d.label}] seed ${i}: ${errs.join('; ')}`);
    if (problems > 20) { console.log('too many problems, aborting'); process.exit(1); }
  }

  // Exercise diff classification with random wrong answers
  const wrongTotal = spec.bill.total + rupeeToPaise(Math.floor((i % 5) - 2) * 10);
  const wrongChange = Math.max(0, spec.payment.change + rupeeToPaise(Math.floor((i % 7) - 3) * 5));
  const report = diffTransaction(
    { billTotalPaise: wrongTotal, changePaise: wrongChange, changeCounts: {} },
    spec
  );
  for (const c of report.categories) diffStats[c] = (diffStats[c] || 0) + 1;
  if (report.categories.includes('change-calculation')) changeDiffStats['change-calculation'] = (changeDiffStats['change-calculation'] || 0) + 1;

  // Drawer feasibility: can the optimal change ever exceed the default drawer float?
  if (spec.payment.change > 0) {
    const drawer = defaultDrawer();
    const r = makeChangeFromDrawer(spec.payment.change, drawer);
    if (!r.exact) impossibleChange++;
  }

  // Verify bill is reproducible from lines (idempotent)
  const bill2 = computeBill(spec.lines, spec.discounts);
  if (bill2.total !== spec.bill.total) {
    problems++;
    console.log(`[${d.label}] recompute mismatch seed ${i}`);
  }
}

console.log(`\nFuzz complete: ${generated} scenarios, ${problems} problems`);
console.log('Diff categories seen:', diffStats);
console.log('Impossible change with default float:', impossibleChange);
if (problems > 0) process.exit(1);
console.log('OK');
