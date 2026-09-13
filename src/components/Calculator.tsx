import { useState } from 'react';
import { audio } from '../audio';

type Op = '+' | '-' | '×' | '÷' | null;

/** Physical-style calculator with + − × ÷ % C ⌫ = */
export default function Calculator({ onUse, onClose }: { onUse: (result: string) => void; onClose: () => void }) {
  const [display, setDisplay] = useState('0');
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [resetNext, setResetNext] = useState(true);
  const [expr, setExpr] = useState('');

  const compute = (a: number, b: number, o: Exclude<Op, null>): number => {
    switch (o) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? 0 : a / b;
    }
  };

  const fmt = (n: number) => {
    if (!Number.isFinite(n)) return '0';
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? String(r) : String(r);
  };

  const digit = (d: string) => {
    audio.play('click');
    if (resetNext) { setDisplay(d === '.' ? '0.' : d); setResetNext(false); }
    else {
      if (d === '.' && display.includes('.')) return;
      setDisplay(display === '0' && d !== '.' ? d : display + d);
    }
  };

  const setOperator = (o: Exclude<Op, null>) => {
    audio.play('click');
    const cur = parseFloat(display);
    if (acc != null && op && !resetNext) {
      const result = compute(acc, cur, op);
      setAcc(result); setDisplay(fmt(result));
    } else setAcc(cur);
    setOp(o);
    setResetNext(true);
    setExpr(`${fmt(acc != null && op ? compute(acc, cur, op) : cur)} ${o}`);
  };

  const equals = () => {
    audio.play('click');
    if (op == null || acc == null) return;
    const cur = parseFloat(display);
    const result = compute(acc, cur, op);
    setDisplay(fmt(result));
    setExpr(`${fmt(acc)} ${op} ${fmt(cur)} =`);
    setAcc(null); setOp(null); setResetNext(true);
  };

  const percent = () => {
    audio.play('click');
    const cur = parseFloat(display);
    let result = cur / 100;
    if (acc != null && op && (op === '+' || op === '-')) result = (acc * cur) / 100;
    setDisplay(fmt(result)); setResetNext(true);
  };

  const clear = () => { audio.play('click'); setDisplay('0'); setAcc(null); setOp(null); setResetNext(true); setExpr(''); };
  const back = () => {
    audio.play('click');
    if (resetNext) return;
    setDisplay(display.length <= 1 ? '0' : display.slice(0, -1));
  };

  const useResult = () => { audio.play('click'); onUse(display); };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel modal-panel calc-overlay" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" aria-label="Close calculator" onClick={onClose}>✕</button>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>CALCULATOR</span>
          <div className="spacer" />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{expr || ' '}</span>
        </div>
      <div className="display">{display}</div>
      <div className="keypad">
        <button className="key danger" onClick={clear}>C</button>
        <button className="key danger" onClick={back}>⌫</button>
        <button className="key op" onClick={percent}>%</button>
        <button className="key op" onClick={() => setOperator('÷')}>÷</button>
        {['7', '8', '9'].map(d => <button key={d} className="key" onClick={() => digit(d)}>{d}</button>)}
        <button className="key op" onClick={() => setOperator('×')}>×</button>
        {['4', '5', '6'].map(d => <button key={d} className="key" onClick={() => digit(d)}>{d}</button>)}
        <button className="key op" onClick={() => setOperator('-')}>−</button>
        {['1', '2', '3'].map(d => <button key={d} className="key" onClick={() => digit(d)}>{d}</button>)}
        <button className="key op" onClick={() => setOperator('+')}>+</button>
        <button className="key" onClick={() => digit('0')}>0</button>
        <button className="key" onClick={() => digit('.')}>.</button>
        <button className="key confirm" onClick={equals}>=</button>
        <button className="key confirm wide" onClick={useResult}>USE RESULT</button>
      </div>
      </div>
    </div>
  );
}
