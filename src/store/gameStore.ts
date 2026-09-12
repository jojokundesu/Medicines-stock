import { create } from 'zustand';
import {
  generateScenario, diffTransaction, DIFFICULTY, type DifficultyProfile
} from '../engine/engine';
import {
  DEFAULT_DENOMS, defaultDrawer, makeChange, sumCounts,
  type DrawerState, type DenomCounts
} from '../engine/money';
import type { MedicineData } from '../engine/products';
import type { TransactionSpec, DiffCategory } from '../engine/types';
import { audio } from '../audio';

export type Screen = 'menu' | 'shift' | 'report';
export type Stage = 'order' | 'bill' | 'pay' | 'change' | 'cashout' | 'review';
export type DifficultyKey = keyof typeof DIFFICULTY;

export type TransactionResult = {
  id: number;
  name: string;
  kind: string;
  bill: number;
  paid: number;
  change: number;
  playerBill: number;
  playerPaid: number;
  playerChange: number;
  billCorrect: boolean;
  paidCorrect: boolean;
  changeCorrect: boolean;
  denominationsCorrect: boolean;
  cashoutTotal: number;
  optimalCount: number;
  usedCount: number;
  categories: DiffCategory[];
  calcMs: number;
  changeMs: number;
  totalMs: number;
  calculatorUsed: boolean;
  impatient: boolean;
};

export type ShiftReport = {
  startedAt: number;
  difficulty: DifficultyKey;
  customersServed: number;
  results: TransactionResult[];
  accuracy: number;
  avgTotalMs: number;
  avgCalcMs: number;
  avgChangeMs: number;
  calculatorUsagePct: number;
  bestStreak: number;
  mistakeCounts: Record<string, number>;
  recommended: string[];
};

type StageTime = { order: number; bill: number; pay: number; change: number; cashout: number };

export type GameStore = {
  screen: Screen;
  difficulty: DifficultyKey;
  shiftLength: number;
  soundOn: boolean;
  medicines: MedicineData | null;
  spec: TransactionSpec | null;
  stage: Stage;
  stageStartedAt: number;
  stageMs: StageTime;
  customerIndex: number;
  // inputs
  billInput: string;
  paidInput: string;
  changeInput: string;
  cashout: DenomCounts;
  // committed answers
  playerBill: number | null;
  playerPaid: number | null;
  playerChange: number | null;
  drawer: DrawerState;
  drawerOpen: boolean;
  hintLevel: number;
  calculatorUsed: boolean;
  results: TransactionResult[];
  streak: number;
  bestStreak: number;
  patienceMs: number;
  feedback: { ok: boolean; text: string; categories: DiffCategory[] } | null;

  // actions
  setScreen(s: Screen): void;
  setDifficulty(d: DifficultyKey): void;
  setShiftLength(n: number): void;
  toggleSound(): void;
  loadMedicines(data: MedicineData): void;
  startShift(): void;
  nextCustomer(): void;
  advanceStage(): void;
  goStage(stage: Stage): void;
  setBillInput(v: string): void;
  setPaidInput(v: string): void;
  setChangeInput(v: string): void;
  submitBill(): void;
  submitPaid(): void;
  submitChange(): void;
  addDenom(id: string): void;
  removeDenom(id: string): void;
  submitCashout(): void;
  useHint(): void;
  setDrawerOpen(open: boolean): void;
  tickPatience(dtMs: number): void;
  markCalculator(): void;
  endShift(): void;
  goMenu(): void;
};

const emptyStageMs: StageTime = { order: 0, bill: 0, pay: 0, change: 0, cashout: 0 };

function resetTransactionState(): Pick<GameStore, 'stage' | 'stageStartedAt' | 'stageMs' | 'billInput' | 'paidInput' | 'changeInput' | 'cashout' | 'playerBill' | 'playerPaid' | 'playerChange' | 'drawerOpen' | 'hintLevel' | 'calculatorUsed' | 'feedback' | 'patienceMs'> {
  return {
    stage: 'order' as Stage,
    stageStartedAt: Date.now(),
    stageMs: emptyStageMs,
    billInput: '',
    paidInput: '',
    changeInput: '',
    cashout: {},
    playerBill: null,
    playerPaid: null,
    playerChange: null,
    drawerOpen: false,
    hintLevel: 0,
    calculatorUsed: false,
    feedback: null,
    patienceMs: 0
  };
}

export const useGame = create<GameStore>((set, get) => ({
  screen: 'menu',
  difficulty: 'easy',
  shiftLength: 5,
  soundOn: true,
  medicines: null,
  spec: null,
  stage: 'order',
  stageStartedAt: Date.now(),
  stageMs: emptyStageMs,
  customerIndex: 0,
  billInput: '',
  paidInput: '',
  changeInput: '',
  cashout: {},
  playerBill: null,
  playerPaid: null,
  playerChange: null,
  drawer: defaultDrawer(),
  drawerOpen: false,
  hintLevel: 0,
  calculatorUsed: false,
  results: [],
  streak: 0,
  bestStreak: 0,
  patienceMs: 0,
  feedback: null,

  setScreen: (s) => set({ screen: s }),
  setDifficulty: (d) => set({ difficulty: d }),
  setShiftLength: (n) => set({ shiftLength: n }),
  toggleSound: () => {
    const next = !get().soundOn;
    audio.setMuted(!next);
    set({ soundOn: next });
  },
  loadMedicines: (data) => set({ medicines: data }),

  startShift: () => {
    const profile = DIFFICULTY[get().difficulty];
    const spec = makeScenario(get(), profile);
    set({
      screen: 'shift',
      results: [],
      streak: 0,
      bestStreak: 0,
      customerIndex: 1,
      drawer: defaultDrawer(),
      spec,
      ...resetTransactionState(),
      patienceMs: spec.customer.patienceMs,
      stageStartedAt: Date.now()
    });
    audio.init();
    audio.play('bell');
  },

  nextCustomer: () => {
    const profile = DIFFICULTY[get().difficulty];
    const idx = get().customerIndex + 1;
    const spec = makeScenario(get(), profile);
    set({
      customerIndex: idx,
      spec,
      ...resetTransactionState(),
      patienceMs: spec.customer.patienceMs,
      stageStartedAt: Date.now(),
      feedback: null
    });
    audio.play('bell');
  },

  advanceStage: () => {
    const { stage, stageMs, stageStartedAt } = get();
    const now = Date.now();
    const elapsed = now - stageStartedAt;
    const next: StageTime = { ...stageMs };
    if (stage in next) next[stage as keyof StageTime] += elapsed;
    const order: Stage[] = ['order', 'bill', 'pay', 'change', 'cashout', 'review'];
    const i = order.indexOf(stage);
    const ns = i >= 0 && i < order.length - 1 ? order[i + 1] : stage;
    set({ stage: ns, stageMs: next, stageStartedAt: now });
  },

  goStage: (stage) => {
    const { stageMs, stageStartedAt } = get();
    const now = Date.now();
    const elapsed = now - stageStartedAt;
    const next: StageTime = { ...stageMs };
    const cur = get().stage;
    if (cur in next) next[cur as keyof StageTime] += elapsed;
    set({ stage, stageMs: next, stageStartedAt: now });
  },

  setBillInput: (v) => set({ billInput: sanitizeNum(v, 6) }),
  setPaidInput: (v) => set({ paidInput: sanitizeNum(v, 6) }),
  setChangeInput: (v) => set({ changeInput: sanitizeNum(v, 6) }),

  submitBill: () => {
    const val = parseInput(get().billInput);
    const playerBill = val == null ? null : Math.round(val * 100);
    set({ playerBill });
    if (playerBill != null) audio.play('beep');
    get().goStage('pay');
  },

  submitPaid: () => {
    const val = parseInput(get().paidInput);
    const playerPaid = val == null ? null : Math.round(val * 100);
    set({ playerPaid });
    if (playerPaid != null) audio.play('beep');
    get().goStage('change');
  },

  submitChange: () => {
    const val = parseInput(get().changeInput);
    const playerChange = val == null ? null : Math.round(val * 100);
    set({ playerChange });
    if (playerChange != null) audio.play('beep');
    get().goStage('cashout');
  },

  addDenom: (id) => {
    const { cashout, drawer } = get();
    const have = drawer[id] || 0;
    const sel = cashout[id] || 0;
    if (sel >= have) { audio.play('error'); return; }
    set({ cashout: { ...cashout, [id]: sel + 1 } });
    audio.play(id.startsWith('c') ? 'coin' : 'note');
  },
  removeDenom: (id) => {
    const { cashout } = get();
    const sel = cashout[id] || 0;
    if (sel <= 0) return;
    const next = { ...cashout, [id]: sel - 1 };
    if (next[id] === 0) delete next[id];
    set({ cashout: next });
    audio.play('click');
  },

  submitCashout: () => {
    const spec = get().spec;
    if (!spec) return;
    const { cashout, playerChange, stageMs, stageStartedAt, results, streak, bestStreak, drawer } = get();
    const now = Date.now();
    const elapsed = now - stageStartedAt;
    const ms: StageTime = { ...stageMs };
    if (get().stage in ms) ms[get().stage as keyof StageTime] += elapsed;

    const cashoutTotal = sumCounts(cashout);
    const report = diffTransaction(
      { billTotalPaise: get().playerBill ?? 0, changePaise: playerChange ?? 0, changeCounts: cashout },
      spec
    );
    const optimal = spec.payment.change > 0 ? makeChange(spec.payment.change) ?? {} : {};
    const optimalCount = Object.values(optimal).reduce((a, b) => a + b, 0);
    const usedCount = Object.values(cashout).reduce((a, b) => a + b, 0);

    const isCorrect = report.billCorrect && report.denominationsCorrect;
    const newStreak = isCorrect ? streak + 1 : 0;
    const best = Math.max(bestStreak, newStreak);

    const result: TransactionResult = {
      id: spec.id,
      name: spec.customer.name,
      kind: spec.customer.kind,
      bill: spec.bill.total,
      paid: spec.payment.amount,
      change: spec.payment.change,
      playerBill: get().playerBill ?? 0,
      playerPaid: get().playerPaid ?? 0,
      playerChange: playerChange ?? 0,
      billCorrect: report.billCorrect,
      paidCorrect: get().playerPaid === spec.payment.amount,
      changeCorrect: report.changeCorrect,
      denominationsCorrect: report.denominationsCorrect,
      cashoutTotal,
      optimalCount,
      usedCount,
      categories: report.categories,
      calcMs: ms.bill,
      changeMs: ms.pay + ms.change + ms.cashout,
      totalMs: ms.order + ms.bill + ms.pay + ms.change + ms.cashout,
      calculatorUsed: get().calculatorUsed,
      impatient: get().patienceMs <= 0
    };

    // apply drawer movement: receive payment, give change
    const nextDrawer = applyDrawerMovement(drawer, spec.payment.given, cashout);

    // build feedback text
    const fb = buildFeedback(result, report);

    set({
      stage: 'review',
      stageMs: ms,
      results: [...results, result],
      streak: newStreak,
      bestStreak: best,
      drawer: nextDrawer,
      drawerOpen: false,
      feedback: { ok: isCorrect, text: fb.text, categories: report.categories }
    });
    if (isCorrect) {
      audio.play('success');
      if (newStreak > 0 && newStreak % 5 === 0) audio.play('chime');
    } else {
      audio.play('error');
    }
  },

  useHint: () => {
    const level = get().hintLevel;
    if (level >= 3) return;
    set({ hintLevel: level + 1 });
    audio.play('hint');
  },

  setDrawerOpen: (open) => {
    set({ drawerOpen: open });
    audio.play(open ? 'drawerOpen' : 'drawerClose');
  },

  tickPatience: (dtMs) => set((s) => ({ patienceMs: Math.max(0, s.patienceMs - dtMs) })),
  markCalculator: () => set({ calculatorUsed: true }),

  endShift: () => set({ screen: 'report' }),

  goMenu: () => set({ screen: 'menu', spec: null, results: [], stage: 'order', customerIndex: 0 })
}));

function makeScenario(state: Pick<GameStore, 'difficulty' | 'medicines'>, profile: DifficultyProfile): TransactionSpec {
  const items = state.medicines?.items ?? [];
  return generateScenario({
    difficulty: profile,
    products: items,
    denoms: DEFAULT_DENOMS
  });
}

function sanitizeNum(v: string, maxLen: number): string {
  let s = v.replace(/[^0-9.]/g, '');
  if (s.length > maxLen) s = s.slice(0, maxLen);
  const parts = s.split('.');
  if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');
  if (parts.length === 2) s = parts[0] + '.' + parts[1].slice(0, 2);
  return s;
}

function parseInput(s: string): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function applyDrawerMovement(drawer: DrawerState, receive: DenomCounts, give: DenomCounts): DrawerState {
  const next = { ...drawer };
  for (const [id, c] of Object.entries(receive)) next[id] = (next[id] || 0) + c;
  for (const [id, c] of Object.entries(give)) next[id] = (next[id] || 0) - c;
  return next;
}

function buildFeedback(
  result: TransactionResult,
  report: ReturnType<typeof diffTransaction>
): { text: string } {
  if (report.billCorrect && report.changeCorrect && report.denominationsCorrect) {
    const eff = result.usedCount === result.optimalCount && result.optimalCount > 0
      ? ' Perfect denominations!'
      : '';
    return { text: `Perfect transaction! Change ₹${(result.change / 100).toFixed(0)}.${eff}` };
  }
  const parts: string[] = [];
  if (!report.billCorrect) parts.push(`Bill was ₹${fmt(result.bill)}, you entered ₹${fmt(result.playerBill)}.`);
  if (!report.changeCorrect) {
    parts.push(`Change should be ₹${fmt(result.change)}, you said ₹${fmt(result.playerChange)}.`);
    if (result.paidCorrect === false) parts.push(`The customer paid ₹${fmt(result.paid)}, not ₹${fmt(result.playerPaid)}.`);
  } else if (!report.denominationsCorrect) {
    parts.push(`You counted ₹${fmt(result.cashoutTotal)} in cash, but the change is ₹${fmt(result.change)}.`);
  }
  const cat = report.categories[0];
  if (cat) parts.push(`Tip: ${categoryTip(cat)}`);
  return { text: parts.join(' ') };
}

function categoryTip(cat: DiffCategory): string {
  switch (cat) {
    case 'forgot-discount': return 'the discount was not applied.';
    case 'discount-twice': return 'the discount was applied twice.';
    case 'discount': return 're-check the discount amount.';
    case 'wrong-product': return 're-check one product MRP.';
    case 'quantity': return 're-check the quantity.';
    case 'forgot-partial': return 'partial quantity (loose units) was missed.';
    case 'addition': return 're-check the sum.';
    case 'subtraction': return 're-check the subtraction.';
    case 'payment-recognition': return 'count the notes the customer handed you.';
    case 'change-calculation': return 'subtract bill from the amount paid.';
    case 'wrong-denomination': return 'your notes/coins did not add up to the change.';
    default: return 'slow down and re-check.';
  }
}

function fmt(paise: number): string {
  const r = paise / 100;
  return Number.isInteger(r) ? r.toLocaleString('en-IN') : r.toFixed(2);
}

// ---- selectors / helpers exported for the UI ----
export function buildReport(results: TransactionResult[], difficulty: DifficultyKey, bestStreak: number): ShiftReport {
  const n = results.length || 1;
  const correct = results.filter(r => r.billCorrect && r.changeCorrect && r.denominationsCorrect).length;
  const accuracy = Math.round((correct / n) * 1000) / 10;
  const avgTotal = Math.round(results.reduce((a, r) => a + r.totalMs, 0) / n);
  const avgCalc = Math.round(results.reduce((a, r) => a + r.calcMs, 0) / n);
  const avgChange = Math.round(results.reduce((a, r) => a + r.changeMs, 0) / n);
  const calcUse = Math.round((results.filter(r => r.calculatorUsed).length / n) * 100);
  const mistakes: Record<string, number> = {};
  for (const r of results) for (const c of r.categories) mistakes[c] = (mistakes[c] || 0) + 1;
  const sorted = Object.entries(mistakes).sort((a, b) => b[1] - a[1]);
  const recommended: string[] = [];
  if (sorted.length) recommended.push(`Practice ${sorted[0][1]}× ${categoryTip(sorted[0][0] as DiffCategory)}`);
  else recommended.push('Flawless — increase difficulty!');
  return {
    startedAt: Date.now(),
    difficulty,
    customersServed: results.length,
    results,
    accuracy,
    avgTotalMs: avgTotal,
    avgCalcMs: avgCalc,
    avgChangeMs: avgChange,
    calculatorUsagePct: calcUse,
    bestStreak,
    mistakeCounts: mistakes,
    recommended
  };
}
