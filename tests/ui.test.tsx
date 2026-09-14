// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';

// Mock the WebGL scene — jsdom has no WebGL context.
vi.mock('../src/three/shop', () => ({
  ShopScene: class {
    constructor() {}
    resize() {}
    dispose() {}
    setProducts() {}
    setCustomer() {}
    setPayment() {}
    setDrawerOpen() {}
    setPatience() {}
    clearPayment() {}
    nudgeLook() {}
  }
}));

import App from '../src/App';
import { useGame } from '../src/store/gameStore';
import type { MedicineData } from '../src/engine/products';

const minimalData: MedicineData = {
  generated: 'test',
  count: 4,
  summary: { Tablets: 2, Capsules: 1, 'Syrups & Liquids': 1 },
  items: [
    { id: 1, name: 'PARA 500', category: 'Tablets', form: 'TAB', mrp: 100, pack: 10, unit: 10, partialAllowed: true, stock: 50, expiry: '01/2030' },
    { id: 2, name: 'COUGH SYRUP', category: 'Syrups & Liquids', form: 'SYRUP', mrp: 150, pack: 1, unit: null, partialAllowed: false, stock: 20, expiry: '01/2030' },
    { id: 3, name: 'VIT C CAP', category: 'Capsules', form: 'CAPs', mrp: 80, pack: 10, unit: 8, partialAllowed: true, stock: 40, expiry: '01/2030' },
    { id: 4, name: 'BANDAGE', category: 'Surgical & Consumables', form: 'Bandage', mrp: 45, pack: 1, unit: null, partialAllowed: false, stock: 30, expiry: '01/2030' }
  ]
};

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => minimalData
  })));
  // jsdom lacks ResizeObserver and AudioContext — stub / guard.
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

beforeEach(() => {
  useGame.setState({
    screen: 'menu', spec: null, stage: 'order', customerIndex: 0, results: [],
    streak: 0, bestStreak: 0, billInput: '', paidInput: '', changeInput: '',
    cashout: {}, playerBill: null, playerPaid: null, playerChange: null,
    drawerOpen: false, feedback: null, hintLevel: 0, calculatorUsed: false,
    patienceMs: 0
  });
  cleanup();
});

function rupees(paise: number): string {
  const r = paise / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

describe('UI smoke: full transaction loop', () => {
  it('menu → shift → bill → pay → change → cashout → review', async () => {
    const user = userEvent.setup();
    render(<App />);

    // menu loads medicines and enables start
    await waitFor(() => expect(screen.getByText(/real medicines loaded/i)).toBeTruthy());
    const start = screen.getByRole('button', { name: /open the shop/i });
    await user.click(start);

    // order stage
    expect(screen.getByText(/new customer/i)).toBeTruthy();
    const spec = useGame.getState().spec!;
    expect(spec).toBeTruthy();

    // bill stage
    await user.click(screen.getByRole('button', { name: /got it/i }));
    expect(screen.getByText(/what is the total bill/i)).toBeTruthy();

    // enter correct bill total
    for (const ch of rupees(spec.bill.total)) {
      await user.click(screen.getByRole('button', { name: ch === '.' ? '.' : ch }));
    }
    await user.click(screen.getByRole('button', { name: /confirm total/i }));
    expect(useGame.getState().playerBill).toBe(spec.bill.total);
    expect(useGame.getState().stage).toBe('pay');

    // pay stage
    expect(screen.getByText(/how much did the customer pay/i)).toBeTruthy();
    for (const ch of rupees(spec.payment.amount)) {
      await user.click(screen.getByRole('button', { name: ch === '.' ? '.' : ch }));
    }
    await user.click(screen.getByRole('button', { name: /confirm paid/i }));
    expect(useGame.getState().playerPaid).toBe(spec.payment.amount);
    expect(useGame.getState().stage).toBe('change');

    // change stage
    expect(screen.getByText(/how much change to return/i)).toBeTruthy();
    for (const ch of rupees(spec.payment.change)) {
      await user.click(screen.getByRole('button', { name: ch === '.' ? '.' : ch }));
    }
    await user.click(screen.getByRole('button', { name: /confirm change/i }));
    expect(useGame.getState().playerChange).toBe(spec.payment.change);
    expect(useGame.getState().stage).toBe('cashout');

    // cashout: use store to add optimal denominations
    const st = useGame.getState();
    for (const [id, count] of Object.entries(spec.payment.changeCounts)) {
      for (let i = 0; i < count; i++) st.addDenom(id);
    }
    await user.click(screen.getByRole('button', { name: /hand over change/i }));

    // review
    expect(useGame.getState().stage).toBe('review');
    expect(screen.getByText(/correct/i)).toBeTruthy();
    expect(useGame.getState().results).toHaveLength(1);
    expect(useGame.getState().results[0].billCorrect).toBe(true);
    expect(useGame.getState().results[0].denominationsCorrect).toBe(true);

    cleanup();
  });
});

describe('UI smoke: popups can be dismissed', () => {
  it('calculator opens and closes via ✕', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByText(/open the shop/i)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /open the shop/i }));
    await user.click(screen.getByRole('button', { name: /got it/i }));

    await user.click(screen.getByRole('button', { name: /calculator/i }));
    expect(screen.getByText('CALCULATOR')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /close calculator/i }));
    expect(screen.queryByText('CALCULATOR')).toBeNull();
    expect(useGame.getState().stage).toBe('bill');
  });

  it('hint opens and closes via ✕', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByText(/open the shop/i)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /open the shop/i }));
    await user.click(screen.getByRole('button', { name: /got it/i }));

    await user.click(screen.getByRole('button', { name: /hint/i }));
    expect(screen.getByText('💡 HINT')).toBeTruthy();
    expect(useGame.getState().hintLevel).toBe(1);
    await user.click(screen.getByRole('button', { name: /dismiss hint/i }));
    expect(screen.queryByText('💡 HINT')).toBeNull();
    expect(useGame.getState().hintLevel).toBe(0);
  });
  it('✕ opens a quit confirmation and can be cancelled', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByText(/open the shop/i)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /open the shop/i }));

    await user.click(screen.getByRole('button', { name: /leave shift/i }));
    expect(screen.getByText(/leave this shift/i)).toBeTruthy();
    expect(useGame.getState().screen).toBe('shift');

    await user.click(screen.getByRole('button', { name: /keep playing/i }));
    expect(screen.queryByText(/leave this shift/i)).toBeNull();
    expect(useGame.getState().screen).toBe('shift');
  });
});

describe('UI smoke: drills flow', () => {
  it('opens drills from menu, plays a question, sees results', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByText(/open the shop/i)).toBeTruthy());

    await user.click(screen.getByRole('button', { name: /training drills/i }));
    expect(screen.getByText('TRAINING DRILLS')).toBeTruthy();
    expect(useGame.getState().screen).toBe('drills');

    // default: ₹500 note challenge, easy, 10 questions
    await user.click(screen.getByRole('button', { name: /start drill/i }));
    expect(screen.getByText(/change to return/i)).toBeTruthy();

    const st = useGame.getState();
    // answer first question correctly via the store? No — type it.
    // We don't know the answer; just verify the keypad renders and can type.
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: /check/i }));
    // after answering (right or wrong), a feedback area appears
    await waitFor(() => expect(screen.getByText(/answer:|✓|not/i)).toBeTruthy(), { timeout: 3000 });
  });
});

describe('UI smoke: calculator + wrong answer feedback', () => {
  it('detects a wrong bill and reports the error at review', async () => {
    const user = userEvent.setup();
    useGame.setState({ medicines: minimalData });
    render(<App />);
    await waitFor(() => expect(screen.getByText(/open the shop/i)).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /open the shop/i }));
    const spec = useGame.getState().spec!;

    await user.click(screen.getByRole('button', { name: /got it/i }));

    // enter a wrong bill (add 10 rupees)
    const wrong = rupees(spec.bill.total + 1000);
    for (const ch of wrong) await user.click(screen.getByRole('button', { name: ch === '.' ? '.' : ch }));
    await user.click(screen.getByRole('button', { name: /confirm total/i }));

    // correct payment
    for (const ch of rupees(spec.payment.amount)) await user.click(screen.getByRole('button', { name: ch === '.' ? '.' : ch }));
    await user.click(screen.getByRole('button', { name: /confirm paid/i }));

    // change = paid - bill (correct math, but bill was wrong)
    const change = spec.payment.change;
    for (const ch of rupees(change)) await user.click(screen.getByRole('button', { name: ch === '.' ? '.' : ch }));
    await user.click(screen.getByRole('button', { name: /confirm change/i }));

    const st = useGame.getState();
    for (const [id, count] of Object.entries(spec.payment.changeCounts)) {
      for (let i = 0; i < count; i++) st.addDenom(id);
    }
    await user.click(screen.getByRole('button', { name: /hand over change/i }));

    expect(useGame.getState().stage).toBe('review');
    expect(screen.getByText(/not quite/i)).toBeTruthy();
    expect(useGame.getState().results[0].billCorrect).toBe(false);

    cleanup();
  });
});
