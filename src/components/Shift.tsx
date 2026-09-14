import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store/gameStore';
import { ShopScene, type SceneProduct } from '../three/shop';
import { resolveDiscounts } from '../engine/engine';
import { formatINR, sumCounts } from '../engine/money';
import type { TransactionSpec } from '../engine/types';
import Keypad from './Keypad';
import Calculator from './Calculator';
import CashDrawer from './CashDrawer';
import { audio } from '../audio';

export default function Shift() {
  const sceneRef = useRef<ShopScene | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [inspectIndex, setInspectIndex] = useState<number | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);

  const store = useGame();

  // --- create/destroy scene ---
  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new ShopScene(containerRef.current, {
      onProductClick: (i) => { audio.play('beep'); setInspectIndex(i); },
      onDrawerClick: () => useGame.getState().setDrawerOpen(!useGame.getState().drawerOpen),
      onCalculatorClick: () => setCalcOpen(true)
    });
    sceneRef.current = scene;
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => scene.resize());
      ro.observe(containerRef.current);
    }
    return () => { ro?.disconnect(); scene.dispose(); sceneRef.current = null; };
  }, []);

  // --- desktop keyboard controls (digits, Enter, Backspace, Escape) ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useGame.getState();
      if (st.screen !== 'shift') return;
      if (e.key === 'Escape') {
        if (confirmQuit) setConfirmQuit(false);
        else if (calcOpen) setCalcOpen(false);
        else if (inspectIndex != null) setInspectIndex(null);
        else setConfirmQuit(true);
        return;
      }
      if (confirmQuit || calcOpen || inspectIndex != null) return;
      const stage = st.stage;
      if (stage === 'bill' || stage === 'pay' || stage === 'change') {
        if (/^[0-9]$/.test(e.key)) {
          const cur = stage === 'bill' ? st.billInput : stage === 'pay' ? st.paidInput : st.changeInput;
          const apply = (v: string) => stage === 'bill' ? st.setBillInput(v) : stage === 'pay' ? st.setPaidInput(v) : st.setChangeInput(v);
          apply(cur + e.key);
        } else if (e.key === '.') {
          const cur = stage === 'bill' ? st.billInput : stage === 'pay' ? st.paidInput : st.changeInput;
          const apply = (v: string) => stage === 'bill' ? st.setBillInput(v) : stage === 'pay' ? st.setPaidInput(v) : st.setChangeInput(v);
          apply(cur);
        } else if (e.key === 'Backspace') {
          const cur = stage === 'bill' ? st.billInput : stage === 'pay' ? st.paidInput : st.changeInput;
          const apply = (v: string) => stage === 'bill' ? st.setBillInput(v) : stage === 'pay' ? st.setPaidInput(v) : st.setChangeInput(v);
          apply(cur.slice(0, -1));
        } else if (e.key === 'Enter') {
          if (stage === 'bill') st.submitBill();
          else if (stage === 'pay') st.submitPaid();
          else st.submitChange();
        }
      } else if (stage === 'order' && e.key === 'Enter') {
        st.advanceStage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmQuit, calcOpen, inspectIndex]);

  const spec = store.spec;
  const specId = spec?.id ?? 0;

  // --- drive scene on new customer ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !spec) return;
    const products: SceneProduct[] = spec.lines.map(l => ({
      id: l.product.id,
      name: l.product.name,
      mrp: l.product.mrp,
      pack: l.product.pack,
      partialAllowed: l.product.partialAllowed,
      qty: l.quantity,
      units: l.units
    }));
    scene.setProducts(products);
    scene.setCustomer(spec.customer.kind, true);
    scene.setDrawerOpen(false);
    scene.clearPayment();
    scene.setPatience(1);
  }, [specId]);

  // --- drive scene on stage change ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !spec) return;
    if (store.stage === 'pay') scene.setPayment(spec.payment.given);
    if (store.stage === 'cashout') useGame.getState().setDrawerOpen(true);
    if (store.stage === 'review') {
      useGame.getState().setDrawerOpen(false);
      scene.setCustomer(spec.customer.kind, false);
    }
    if (store.stage === 'bill') scene.setDrawerOpen(false);
  }, [store.stage, specId]);

  // --- patience ticker ---
  useEffect(() => {
    const id = setInterval(() => {
      const s = useGame.getState();
      if (s.screen !== 'shift') return;
      if (s.patienceMs > 0) s.tickPatience(100);
      const sp = s.spec;
      const ratio = sp ? s.patienceMs / sp.customer.patienceMs : 1;
      sceneRef.current?.setPatience(ratio);
    }, 100);
    return () => clearInterval(id);
  }, []);

  if (!spec) return null;

  const pcts = resolveDiscounts({ discounts: spec.discounts }, spec.lines);
  const patienceRatio = spec ? Math.max(0, Math.min(1, store.patienceMs / spec.customer.patienceMs)) : 1;

  const nextOrFinish = () => {
    if (store.customerIndex >= store.shiftLength) store.endShift();
    else store.nextCustomer();
  };

  const currentInput = store.stage === 'bill' ? store.billInput
    : store.stage === 'pay' ? store.paidInput
    : store.changeInput;

  const copyResult = (v: string) => {
    store.markCalculator();
    setCalcOpen(false);
    if (store.stage === 'bill') store.setBillInput(v);
    else if (store.stage === 'pay') store.setPaidInput(v);
    else store.setChangeInput(v);
  };

  return (
    <div className="scene-root">
      <div ref={containerRef} className="scene-root" />

      <div className="hud">
        {/* top bar */}
        <div className="topbar">
          <div className="chip">💊 Dukaan Medicos</div>
          <div className="chip">Customer {store.customerIndex}/{store.shiftLength}</div>
          <div className="chip" style={{ color: store.streak >= 3 ? 'var(--amber)' : undefined }}>
            🔥 {store.streak} streak
          </div>
          <div className="spacer" />
          <div className="chip" style={{ color: patienceRatio < 0.35 ? 'var(--red)' : 'var(--green)' }}>
            {patienceRatio < 0.35 ? '😠 impatient!' : '🙂 patient'}
          </div>
          <button className="pill" aria-label="Toggle sound" onClick={() => store.toggleSound()}>
            {store.soundOn ? '🔊' : '🔇'}
          </button>
          <button className="pill" aria-label="Leave shift" onClick={() => setConfirmQuit(true)}>✕</button>
        </div>

        {/* customer bubble */}
        {(store.stage === 'order') && (
          <div className="customer-bubble">
            <div className="who">{spec.customer.name} — {spec.customer.kind.replace(/-/g, ' ')}</div>
            {spec.customer.dialogue[0]}
          </div>
        )}

        {/* order card */}
        {store.stage !== 'review' && (
          <div className="panel order-card">
            <h4>Order</h4>
            {spec.lines.map((l, i) => (
              <div className="order-line" key={i}>
                <span>{l.product.name}</span>
                <span className="qty">
                  {l.units > 0 && l.product.partialAllowed
                    ? `${l.units} tabs`
                    : `${l.quantity}×`}
                  {pcts[i] > 0 ? ` −${pcts[i]}%` : ''}
                </span>
              </div>
            ))}
            {spec.discounts.some(d => d.kind === 'bargain') && (
              <div className="discount-note">Bargain: extra % off agreed</div>
            )}
          </div>
        )}

        {/* inspect overlay */}
        {inspectIndex != null && spec.lines[inspectIndex] && (
          <div className="modal-backdrop" onClick={() => setInspectIndex(null)}>
            <div className="panel modal-panel inspect" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" aria-label="Close label" onClick={() => setInspectIndex(null)}>✕</button>
              <div className="label-card">
                <div className="name">{spec.lines[inspectIndex].product.name}</div>
                <div className="sub">{spec.lines[inspectIndex].product.form}</div>
                <div className="mrp">MRP ₹{spec.lines[inspectIndex].product.mrp}</div>
                <div className="sub">
                  {spec.lines[inspectIndex].product.partialAllowed
                    ? `Strip of ${spec.lines[inspectIndex].product.pack} units`
                    : `Pack of ${spec.lines[inspectIndex].product.pack}`}
                </div>
              </div>
              <button className="big-btn" style={{ margin: 0 }} onClick={() => setInspectIndex(null)}>Done</button>
            </div>
          </div>
        )}

        {/* stage panels */}
        {(store.stage === 'order') && (
          <div className="panel stage-panel">
            <h3>New customer</h3>
            <p>Read the order, then check the items on the counter.</p>
            <button className="big-btn" onClick={() => store.advanceStage()}>Got it — start billing →</button>
          </div>
        )}

        {(store.stage === 'bill' || store.stage === 'pay' || store.stage === 'change') && (
          <div className="panel stage-panel">
            <h3>
              {store.stage === 'bill' && 'What is the total bill?'}
              {store.stage === 'pay' && 'How much did the customer pay?'}
              {store.stage === 'change' && 'How much change to return?'}
            </h3>
            <p>
              {store.stage === 'bill' && 'Read the MRPs, apply quantities and discounts. Tap a box to inspect its label.'}
              {store.stage === 'pay' && 'Count the cash on the counter in front of the customer.'}
              {store.stage === 'change' && 'Change = amount paid − bill total.'}
            </p>
            {store.stage === 'change' && store.playerPaid != null && (
              <p style={{ color: 'var(--amber)' }}>You counted the payment as {formatINR(store.playerPaid)}.</p>
            )}
            <Keypad
              value={currentInput}
              onChange={(v) => {
                if (store.stage === 'bill') store.setBillInput(v);
                else if (store.stage === 'pay') store.setPaidInput(v);
                else store.setChangeInput(v);
              }}
              onSubmit={() => {
                if (store.stage === 'bill') store.submitBill();
                else if (store.stage === 'pay') store.submitPaid();
                else store.submitChange();
              }}
              submitLabel={store.stage === 'bill' ? 'Confirm total' : store.stage === 'pay' ? 'Confirm paid' : 'Confirm change'}
              submitDisabled={currentInput.trim() === ''}
            />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="hint-btn" onClick={() => store.useHint()}>💡 Hint</button>
              <div className="spacer" />
              <button className="pill" onClick={() => setCalcOpen(o => !o)}>🧮 Calculator</button>
            </div>
            {store.hintLevel > 0 && (
              <HintBox stage={store.stage} level={store.hintLevel} spec={spec} onClose={() => store.dismissHint()} />
            )}
          </div>
        )}

        {store.stage === 'cashout' && store.playerChange != null && (
          <CashDrawer
            drawer={store.drawer}
            selected={store.cashout}
            targetPaise={store.playerChange}
            onAdd={store.addDenom}
            onRemove={store.removeDenom}
            onSubmit={() => store.submitCashout()}
            canSubmit={sumCounts(store.cashout) === store.playerChange}
          />
        )}

        {store.stage === 'review' && store.feedback && (
          <div className="feedback-row" style={{ position: 'absolute', left: 0, right: 0, bottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div className={`feedback ${store.feedback.ok ? 'ok' : 'bad'}`}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>{store.feedback.ok ? '✓ Correct' : 'Not quite'}</div>
              {store.feedback.text}
            </div>
            <button className="big-btn" style={{ width: 'min(360px, 80%)', margin: 0 }} onClick={nextOrFinish}>
              {store.customerIndex >= store.shiftLength ? 'Finish shift →' : 'Next customer →'}
            </button>
          </div>
        )}

        {/* calculator */}
        {calcOpen && <Calculator onUse={copyResult} onClose={() => setCalcOpen(false)} />}

        {/* quit confirmation */}
        {confirmQuit && (
          <div className="modal-backdrop" onClick={() => setConfirmQuit(false)}>
            <div className="panel modal-panel confirm-panel" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginBottom: 8 }}>Leave this shift?</h3>
              <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 14 }}>
                You've served {store.customerIndex - 1} customer{store.customerIndex - 1 === 1 ? '' : 's'}.
                Progress in this shift will be lost.
              </p>
              <div className="row">
                <button className="pill" style={{ flex: 1, justifyContent: 'center', padding: 12 }} onClick={() => setConfirmQuit(false)}>Keep playing</button>
                <button className="pill" style={{ flex: 1, justifyContent: 'center', padding: 12, background: '#3a1218', borderColor: '#7f1d1d', color: '#fca5a5' }} onClick={() => store.goMenu()}>Leave</button>
              </div>
            </div>
          </div>
        )}

        {/* patience timer */}
        <div className="timer-bar"><div style={{ width: `${patienceRatio * 100}%` }} /></div>
      </div>
    </div>
  );
}

function HintBox({ stage, level, spec, onClose }: { stage: string; level: number; spec: TransactionSpec; onClose: () => void }) {
  const lines: string[] = [];
  if (stage === 'bill') {
    lines.push('Multiply quantity × MRP for each item, then add them.');
    lines.push('Apply the discount to the subtotal, then subtract it.');
    const pct = spec.discounts.length ? spec.discounts[0].percent : 10;
    lines.push(`Example: subtotal × ${pct}% = discount; total = subtotal − discount.`);
  } else if (stage === 'pay') {
    lines.push('Count every note and coin the customer placed down.');
    lines.push('Add the note values one by one.');
  } else if (stage === 'change') {
    lines.push('Change = amount paid − bill total.');
    lines.push('Or count up: from the bill, add coins to reach the next round number, then notes up to the amount paid.');
    lines.push('Keep it positive: this technique avoids tricky subtraction.');
  } else if (stage === 'cashout') {
    lines.push('Pick the fewest notes/coins that add up to the change.');
    lines.push('Larger notes first, then smaller.');
  }
  return (
    <div className="panel hint-pop">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 700 }}>💡 HINT</span>
        <button className="modal-close hint-close" aria-label="Dismiss hint" onClick={onClose}>✕</button>
      </div>
      {lines.slice(0, level).map((l, i) => <div key={i} style={{ marginBottom: 4 }}>• {l}</div>)}
    </div>
  );
}
