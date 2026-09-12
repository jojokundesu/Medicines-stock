import { DEFAULT_DENOMS, formatINR, type DenomCounts } from '../engine/money';

const CHIP_COLORS: Record<string, string> = {
  n10: '#c17a3f', n20: '#4f9d5d', n50: '#7b6fc0', n100: '#6f9fbd',
  n200: '#d9a62e', n500: '#9aa0a6', n2000: '#b04a8b',
  c1: '#8c8c8c', c2: '#a9a9a9', c5: '#8c8c8c', c10: '#c9a227', c20: '#c9a227'
};

type Props = {
  drawer: DenomCounts;
  selected: DenomCounts;
  targetPaise: number;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
};

export default function CashDrawer({ drawer, selected, targetPaise, onAdd, onRemove, onSubmit, canSubmit }: Props) {
  const notes = DEFAULT_DENOMS.filter(d => d.kind === 'note');
  const coins = DEFAULT_DENOMS.filter(d => d.kind === 'coin');
  const selTotal = DEFAULT_DENOMS.reduce((a, d) => a + (selected[d.id] || 0) * d.value, 0);
  const remaining = targetPaise - selTotal;

  const renderDenom = (d: (typeof DEFAULT_DENOMS)[number]) => {
    const have = drawer[d.id] || 0;
    const sel = selected[d.id] || 0;
    const disabled = have <= 0;
    return (
      <div key={d.id} className={`denom ${d.kind} ${disabled ? 'disabled' : ''}`}>
        <div className="note-chip" style={{ background: CHIP_COLORS[d.id] || '#999' }}>
          {d.label}
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="key" style={{ padding: '4px 10px' }} aria-label={`remove-${d.id}`} onClick={() => onRemove(d.id)} disabled={sel <= 0}>−</button>
          <span className="sel" style={{ minWidth: 30 }}>{sel}</span>
          <button className="key" style={{ padding: '4px 10px' }} aria-label={`add-${d.id}`} onClick={() => onAdd(d.id)} disabled={sel >= have}>+</button>
        </div>
        <div className="counts">have {have}</div>
      </div>
    );
  };

  return (
    <div className="panel drawer-overlay">
      <div className="row" style={{ marginBottom: 8 }}>
        <h3>CASH DRAWER</h3>
        <div className="spacer" />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>To give</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--amber)' }}>{formatINR(targetPaise)}</div>
        </div>
      </div>
      <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--muted)' }}>
        Selected: {formatINR(selTotal)}
        {remaining === 0
          ? ' — ✓ exact'
          : remaining > 0
            ? ` — need ${formatINR(remaining)} more`
            : ` — ${formatINR(-remaining)} too much`}
      </div>
      <div className="denom-grid">
        {notes.map(renderDenom)}
        {coins.map(renderDenom)}
      </div>
      <button className="big-btn" style={{ marginTop: 12 }} disabled={!canSubmit} onClick={onSubmit} >
        Hand over change
      </button>
    </div>
  );
}
