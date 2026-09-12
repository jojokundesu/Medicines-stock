import { useGame, buildReport } from '../store/gameStore';
import { formatINR } from '../engine/money';
import { audio } from '../audio';

export default function Report() {
  const { results, difficulty, bestStreak, goMenu, setScreen } = useGame();
  const report = buildReport(results, difficulty, bestStreak);

  const again = () => { audio.play('chime'); setScreen('menu'); };

  return (
    <div className="report-screen">
      <div className="panel report-card">
        <h1 style={{ fontSize: 28 }}>SHIFT COMPLETE</h1>
        <p style={{ color: 'var(--muted)', margin: '4px 0 4px' }}>You served {report.customersServed} customers.</p>

        <div className="stat-grid">
          <div className="stat"><div className="v">{report.accuracy}%</div><div className="k">Accuracy</div></div>
          <div className="stat"><div className="v">{(report.avgTotalMs / 1000).toFixed(1)}s</div><div className="k">Avg transaction</div></div>
          <div className="stat"><div className="v">{(report.avgCalcMs / 1000).toFixed(1)}s</div><div className="k">Avg bill calc</div></div>
          <div className="stat"><div className="v">{(report.avgChangeMs / 1000).toFixed(1)}s</div><div className="k">Avg change calc</div></div>
          <div className="stat"><div className="v">{report.calculatorUsagePct}%</div><div className="k">Calculator use</div></div>
          <div className="stat"><div className="v">🔥 {report.bestStreak}</div><div className="k">Best streak</div></div>
        </div>

        {Object.keys(report.mistakeCounts).length > 0 && (
          <>
            <h3 style={{ margin: '8px 0' }}>Mistake breakdown</h3>
            {Object.entries(report.mistakeCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div className="receipt rrow" key={k} style={{ background: 'transparent', color: 'var(--ink)' }}>
                <span>{k.replace(/-/g, ' ')}</span><span style={{ fontWeight: 700, color: 'var(--amber)' }}>{v}</span>
              </div>
            ))}
          </>
        )}

        <h3 style={{ margin: '12px 0 6px' }}>Recommended next practice</h3>
        <ul style={{ paddingLeft: 20, fontSize: 14, color: 'var(--muted)' }}>
          {report.recommended.map((r, i) => <li key={i}>{r}</li>)}
        </ul>

        <h3 style={{ margin: '14px 0 6px' }}>Last receipt</h3>
        {results.length > 0 && <LastReceipt idx={results.length - 1} />}

        <div className="row" style={{ marginTop: 16 }}>
          <button className="big-btn" onClick={again} style={{ margin: 0 }}>Run another shift</button>
          <button className="pill" onClick={goMenu} style={{ padding: 16 }}>Menu</button>
        </div>
      </div>
    </div>
  );
}

function LastReceipt({ idx }: { idx: number }) {
  const r = useGame.getState().results[idx];
  if (!r) return null;
  return (
    <div className="receipt">
      <div className="rrow"><span>DUKAAN MEDICOS</span></div>
      <div className="rrow"><span>Bill</span><span>{formatINR(r.bill)}</span></div>
      <div className="rrow"><span>Paid</span><span>{formatINR(r.paid)}</span></div>
      <div className="rrow"><span>Change</span><span>{formatINR(r.change)}</span></div>
      <div className="rrow total"><span>You gave</span><span>{formatINR(r.cashoutTotal)}</span></div>
      <div className="rrow" style={{ color: r.denominationsCorrect && r.billCorrect ? '#15803d' : '#b91c1c' }}>
        <span>{r.denominationsCorrect && r.billCorrect ? '✓ Correct' : '✗ Needs review'}</span>
      </div>
    </div>
  );
}
