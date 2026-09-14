import { useGame, loadBest } from '../store/gameStore';
import { DIFFICULTY } from '../engine/engine';
import { audio } from '../audio';

const LENGTHS = [5, 10, 15, 20];

export default function Menu() {
  const { difficulty, shiftLength, soundOn, setDifficulty, setShiftLength, toggleSound, startShift, medicines } = useGame();
  const best = loadBest();

  const begin = () => {
    audio.init();
    audio.play('chime');
    startShift();
  };

  return (
    <div className="menu-screen">
      <div className="panel menu-card">
        <h1>DUKAAN</h1>
        <div className="tag">3D Pharmacy Cashier Trainer</div>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>
          You're behind the counter of a real pharmacy. Serve customers fast and accurate —
          read MRPs, apply discounts, count change, and hand back the right notes &amp; coins.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 4 }}>
          {medicines ? `${medicines.count} real medicines loaded from your stock CSV` : 'Loading medicines…'}
        </p>
        {best && (
          <div className="panel" style={{ margin: '10px 0', padding: 10, fontSize: 13, textAlign: 'left' }}>
            <span style={{ color: 'var(--amber)', fontWeight: 700 }}>🏆 Personal best:</span>{' '}
            {best.accuracy}% accuracy · 🔥 {best.bestStreak} streak · {best.difficulty} · {best.served} customers
          </div>
        )}

        <div className="menu-row">
          <label>Difficulty</label>
          <div className="pill-row">
            {(Object.keys(DIFFICULTY) as (keyof typeof DIFFICULTY)[]).map(d => (
              <button key={d} className={`pill ${difficulty === d ? 'active' : ''}`} onClick={() => { audio.play('click'); setDifficulty(d); }}>
                {DIFFICULTY[d].label}
              </button>
            ))}
          </div>
        </div>

        <div className="menu-row">
          <label>Customers this shift</label>
          <div className="pill-row">
            {LENGTHS.map(n => (
              <button key={n} className={`pill ${shiftLength === n ? 'active' : ''}`} onClick={() => { audio.play('click'); setShiftLength(n); }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="menu-row row">
          <label style={{ margin: 0 }}>Sound</label>
          <div className="spacer" />
          <button className={`pill ${soundOn ? 'active' : ''}`} onClick={toggleSound}>{soundOn ? 'ON' : 'OFF'}</button>
        </div>

        <button className="big-btn" onClick={begin} disabled={!medicines}>Open the shop →</button>

        <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 12 }}>
          Tip: tap a box on the counter to read its MRP. The calculator is a tool — you'll need it less over time.
        </p>
      </div>
    </div>
  );
}
