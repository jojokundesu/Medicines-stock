import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../store/gameStore';
import {
  DRILL_INFO, generateDrillQuestions, type DrillDifficulty, type DrillKind, type DrillQuestion
} from '../engine/challenges';
import Keypad from './Keypad';
import { audio } from '../audio';

type Phase = 'menu' | 'play' | 'done';

type Result = { q: DrillQuestion; given: number | null; correct: boolean; ms: number };

const COUNTS = [10, 20, 30];
const DIFFS: DrillDifficulty[] = ['easy', 'medium', 'hard'];

export default function Drills() {
  const medicines = useGame(s => s.medicines);
  const goMenu = useGame(s => s.goMenu);
  const products = useMemo(() => medicines?.items ?? [], [medicines]);

  const [phase, setPhase] = useState<Phase>('menu');
  const [kind, setKind] = useState<DrillKind>('change500');
  const [diff, setDiff] = useState<DrillDifficulty>('easy');
  const [count, setCount] = useState(10);
  const [questions, setQuestions] = useState<DrillQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const [reveal, setReveal] = useState(false);
  const qStart = useRef(0);

  const start = () => {
    audio.play('chime');
    const qs = generateDrillQuestions(kind, diff, count, products);
    if (!qs.length) return;
    setQuestions(qs);
    setIndex(0);
    setInput('');
    setResults([]);
    setStreak(0);
    setBestStreak(0);
    setFlash(null);
    setReveal(false);
    setPhase('play');
    qStart.current = performance.now();
  };

  // advance to the next question on "Next" (wrong answers)
  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => {
      setReveal(false);
      setFlash(null);
      setInput('');
      if (index + 1 >= questions.length) setPhase('done');
      else {
        setIndex(i => i + 1);
        qStart.current = performance.now();
      }
    }, 1600);
    return () => clearTimeout(t);
  }, [reveal, index, questions.length]);

  const submit = () => {
    const q = questions[index];
    const n = Number(input);
    const given = Number.isFinite(n) ? Math.round(n * 100) : null;
    const correct = given === q.answerPaise;
    const ms = performance.now() - qStart.current;
    const nextStreak = correct ? streak + 1 : 0;
    setResults(r => [...r, { q, given, correct, ms }]);
    setStreak(nextStreak);
    setBestStreak(b => Math.max(b, nextStreak));
    setFlash(correct ? 'ok' : 'bad');
    if (correct) {
      audio.play('success');
      // auto-advance quickly on correct
      setReveal(true);
    } else {
      audio.play('error');
      setReveal(true);
    }
  };

  // ---- results ----
  const correctCount = results.filter(r => r.correct).length;
  const accuracy = results.length ? Math.round((correctCount / results.length) * 100) : 0;
  const avgMs = results.length ? Math.round(results.reduce((a, r) => a + r.ms, 0) / results.length) : 0;

  if (phase === 'menu') {
    return (
      <div className="menu-screen">
        <div className="panel menu-card" style={{ textAlign: 'left' }}>
          <h1 style={{ textAlign: 'center' }}>TRAINING DRILLS</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', margin: '8px 0 16px' }}>
            Rapid-fire practice. Build automatic mental math — no customers, no consequences.
          </p>

          <div className="drill-grid">
            {(Object.keys(DRILL_INFO) as DrillKind[]).map(k => (
              <button
                key={k}
                className={`drill-card ${kind === k ? 'active' : ''}`}
                onClick={() => { audio.play('click'); setKind(k); }}
              >
                <div className="drill-icon">{DRILL_INFO[k].icon}</div>
                <div className="drill-title">{DRILL_INFO[k].title}</div>
                <div className="drill-blurb">{DRILL_INFO[k].blurb}</div>
              </button>
            ))}
          </div>

          <div className="menu-row">
            <label>Difficulty</label>
            <div className="pill-row">
              {DIFFS.map(d => (
                <button key={d} className={`pill ${diff === d ? 'active' : ''}`} onClick={() => { audio.play('click'); setDiff(d); }}>{d}</button>
              ))}
            </div>
          </div>
          <div className="menu-row">
            <label>Questions</label>
            <div className="pill-row">
              {COUNTS.map(n => (
                <button key={n} className={`pill ${count === n ? 'active' : ''}`} onClick={() => { audio.play('click'); setCount(n); }}>{n}</button>
              ))}
            </div>
          </div>

          <div className="row" style={{ marginTop: 16 }}>
            <button className="big-btn" style={{ margin: 0 }} onClick={start} disabled={!products.length}>Start drill →</button>
            <button className="pill" style={{ padding: 16 }} onClick={goMenu}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'play' && questions[index]) {
    const q = questions[index];
    return (
      <div className="menu-screen" style={{ alignItems: 'flex-start', paddingTop: 8 }}>
        <div className="panel drill-play" style={{ width: 'min(520px, 100%)' }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <div className="chip">{DRILL_INFO[kind].icon} {DRILL_INFO[kind].title}</div>
            <div className="spacer" />
            <div className="chip">{index + 1}/{questions.length}</div>
            <div className="chip" style={{ color: streak >= 3 ? 'var(--amber)' : undefined }}>🔥 {streak}</div>
          </div>

          <div className={`drill-question ${flash}`}>
            <div className="drill-prompt">{q.prompt}</div>
            <div className="drill-detail">{q.detail}</div>
          </div>

          {flash && reveal && (
            <div className={`feedback ${flash === 'ok' ? 'ok' : 'bad'}`} style={{ position: 'static', margin: '10px 0', transform: 'none' }}>
              {flash === 'ok' ? (
                <div>✓ {q.answerLabel}</div>
              ) : (
                <div>
                  <div style={{ fontWeight: 800 }}>Answer: {q.answerLabel}</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>💡 {q.hint}</div>
                </div>
              )}
            </div>
          )}

          {!reveal && (
            <Keypad
              value={input}
              onChange={setInput}
              onSubmit={submit}
              submitLabel="Check"
              submitDisabled={input.trim() === ''}
            />
          )}

          <div className="row" style={{ marginTop: 10 }}>
            <button className="pill" onClick={() => setPhase('menu')}>End drill</button>
            <div className="spacer" />
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Progress bar</div>
          </div>
          <div className="drill-progress"><div style={{ width: `${((index) / questions.length) * 100}%` }} /></div>
        </div>
      </div>
    );
  }

  // ---- done ----
  return (
    <div className="report-screen">
      <div className="panel report-card">
        <h1 style={{ fontSize: 26 }}>DRILL COMPLETE</h1>
        <p style={{ color: 'var(--muted)', margin: '4px 0 12px' }}>{DRILL_INFO[kind].title} · {diff} · {results.length} questions</p>

        <div className="stat-grid">
          <div className="stat"><div className="v">{accuracy}%</div><div className="k">Accuracy</div></div>
          <div className="stat"><div className="v">{(avgMs / 1000).toFixed(1)}s</div><div className="k">Avg answer</div></div>
          <div className="stat"><div className="v">🔥 {bestStreak}</div><div className="k">Best streak</div></div>
          <div className="stat"><div className="v">{correctCount}/{results.length}</div><div className="k">Correct</div></div>
        </div>

        {results.filter(r => !r.correct).length > 0 && (
          <>
            <h3 style={{ margin: '14px 0 6px' }}>Review these</h3>
            <div className="review-list">
              {results.filter(r => !r.correct).map((r, i) => (
                <div className="review-row" key={i}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.q.detail}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.q.prompt}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: 'var(--green)', fontWeight: 700 }}>{r.q.answerLabel}</div>
                    <div style={{ color: 'var(--red)', fontSize: 13 }}>
                      {r.given != null ? `₹${(r.given / 100).toFixed(0)}` : '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button className="big-btn" style={{ margin: 0 }} onClick={start}>Run again</button>
          <button className="big-btn" style={{ margin: 0, background: 'var(--panel2)' }} onClick={() => setPhase('menu')}>Change drill</button>
          <button className="pill" style={{ padding: 16 }} onClick={goMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}
