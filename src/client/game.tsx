import './index.css';

import { StrictMode, type PointerEvent as RPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { showToast } from '@devvit/web/client';
import type { DayStats, InitResponse, PlayerResult, ShareResponse, Streak, SubmitResponse } from '../shared/api';
import { cutShape, dayStartMs, type Cut, type Pt, type Puzzle } from '../shared/geometry';
import { COLORS, drawPlay, drawReveal } from './draw';

type Drag =
  | { kind: 'end'; cut: number; end: 'a' | 'b'; fresh: boolean }
  | { kind: 'move'; cut: number; from: Pt; orig: Cut };

type Phase = 'loading' | 'play' | 'reveal' | 'done' | 'error';

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y);
const segDist = (p: Pt, c: Cut) => {
  const dx = c.b.x - c.a.x;
  const dy = c.b.y - c.a.y;
  const t = clamp(((p.x - c.a.x) * dx + (p.y - c.a.y) * dy) / (dx * dx + dy * dy || 1));
  return dist(p, { x: c.a.x + dx * t, y: c.a.y + dy * t });
};

const verdict = (score: number) =>
  score >= 98 ? 'Surgical' : score >= 94 ? 'Razor sharp' : score >= 88 ? 'Clean cut' : score >= 75 ? 'A bit ragged' : score >= 50 ? 'Hacked at it' : 'Crumbs everywhere';

const useBoardSize = () => {
  const calc = () => Math.floor(Math.min(window.innerWidth - 24, window.innerHeight - 210, 520));
  const [size, setSize] = useState(calc);
  useEffect(() => {
    const on = () => setSize(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return Math.max(220, size);
};

const post = async <T,>(url: string, body: unknown, journeyId?: string): Promise<T> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(journeyId ? { 'x-devvit-journey-id': journeyId } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
};

export const App = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [init, setInit] = useState<InitResponse | null>(null);
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [result, setResult] = useState<PlayerResult | null>(null);
  const [stats, setStats] = useState<DayStats | null>(null);
  const [streak, setStreak] = useState<Streak>({ current: 0, best: 0 });
  const [saved, setSaved] = useState(true);
  const [anim, setAnim] = useState(0);
  const [nudge, setNudge] = useState('');
  const journeyId = useRef('');
  const drag = useRef<Drag | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useBoardSize();

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as InitResponse;
        setInit(data);
        setStats(data.stats);
        setStreak(data.streak);
        if (data.result) {
          setCuts(data.result.cuts);
          setResult(data.result);
          setAnim(1);
          setPhase('done');
        } else setPhase('play');
        void post('/api/journey/ready', {});
      } catch (e) {
        console.error(e);
        setPhase('error');
      }
    })();
  }, []);

  const puzzle: Puzzle | null = init?.puzzle ?? null;
  const pieces = useMemo(
    () => (puzzle && (phase === 'reveal' || phase === 'done') ? cutShape(puzzle, cuts).pieces : []),
    [puzzle, cuts, phase]
  );

  // Render.
  useEffect(() => {
    const el = canvas.current;
    if (!el || !puzzle) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = size * dpr;
    el.height = size * dpr;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (phase === 'reveal' || phase === 'done') drawReveal(ctx, size, puzzle, cuts, pieces, anim);
    else drawPlay(ctx, size, puzzle, cuts, active);
  }, [puzzle, cuts, active, phase, pieces, anim, size]);

  // Reveal animation.
  useEffect(() => {
    if (phase !== 'reveal') return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = (now - t0) / 900;
      setAnim(Math.min(1, t));
      if (t < 1) raf = requestAnimationFrame(step);
      else setPhase('done');
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const toUnit = (e: RPointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  const onDown = (e: RPointerEvent) => {
    if (phase !== 'play' || !puzzle) return;
    const p = toUnit(e);
    const handleR = 24 / size;
    canvas.current!.setPointerCapture(e.pointerId);
    for (let i = cuts.length - 1; i >= 0; i--) {
      const c = cuts[i]!;
      if (dist(p, c.a) < handleR) return void ((drag.current = { kind: 'end', cut: i, end: 'a', fresh: false }), setActive(i));
      if (dist(p, c.b) < handleR) return void ((drag.current = { kind: 'end', cut: i, end: 'b', fresh: false }), setActive(i));
    }
    for (let i = cuts.length - 1; i >= 0; i--) {
      if (segDist(p, cuts[i]!) < 16 / size)
        return void ((drag.current = { kind: 'move', cut: i, from: p, orig: cuts[i]! }), setActive(i));
    }
    if (cuts.length >= puzzle.cuts) {
      setNudge('All cuts placed. Drag a handle to adjust, or press Cut.');
      return;
    }
    drag.current = { kind: 'end', cut: cuts.length, end: 'b', fresh: true };
    setActive(cuts.length);
    setCuts([...cuts, { a: p, b: p }]);
  };

  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toUnit(e);
    setCuts((prev) =>
      prev.map((c, i) => {
        if (i !== d.cut) return c;
        if (d.kind === 'end') return { ...c, [d.end]: p };
        const dx = p.x - d.from.x;
        const dy = p.y - d.from.y;
        return {
          a: { x: clamp(d.orig.a.x + dx), y: clamp(d.orig.a.y + dy) },
          b: { x: clamp(d.orig.b.x + dx), y: clamp(d.orig.b.y + dy) },
        };
      })
    );
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !puzzle) return;
    const c = cuts[d.cut];
    if (d.kind === 'end' && d.fresh) {
      if (!c || dist(c.a, c.b) < 0.05) {
        setCuts(cuts.slice(0, d.cut));
        setActive(null);
        setNudge('Drag further: a cut is a straight line through the whole shape.');
        return;
      }
      setNudge('');
      void (async () => {
        if (!journeyId.current) {
          const r = await post<{ journeyId: string }>('/api/journey/start', {}).catch(() => ({ journeyId: '' }));
          journeyId.current = r.journeyId;
        }
        await post('/api/journey/progress', { progress: ((d.cut + 1) / puzzle.cuts) * 0.9, action: 'cut_placed' }, journeyId.current).catch(() => undefined);
      })();
    }
  };

  const submit = useCallback(async () => {
    if (!puzzle || cuts.length !== puzzle.cuts) return;
    setActive(null);
    try {
      const r = await post<SubmitResponse>('/api/submit', { cuts }, journeyId.current);
      setCuts(r.result.cuts);
      setResult(r.result);
      setStats(r.stats);
      setStreak(r.streak);
      setSaved(r.saved);
      setAnim(0);
      setPhase('reveal');
    } catch (e) {
      console.error(e);
      showToast('Could not submit, try again');
    }
  }, [puzzle, cuts]);

  const share = async () => {
    const r = await post<ShareResponse>('/api/share', {}).catch(() => ({ ok: false, message: 'Could not post comment' }));
    showToast(r.message);
  };

  if (phase === 'loading') return <Shell><p className="text-[#b9b2a3] animate-pulse">Sharpening the blade…</p></Shell>;
  if (phase === 'error' || !puzzle || !init)
    return <Shell><p className="text-[#b9b2a3]">Couldn’t load today’s shape. Pull to refresh.</p></Shell>;

  const placed = cuts.length;
  const hint =
    nudge ||
    (placed === 0
      ? 'Drag a straight line across the shape.'
      : placed < puzzle.cuts
        ? `Cut ${placed + 1} of ${puzzle.cuts}: drag another line.`
        : 'Fine-tune with the handles. You get one shot.');

  return (
    <Shell>
      <header className="w-full max-w-[520px] flex items-end justify-between px-1">
        <div>
          <div className="text-[11px] tracking-[0.25em] text-[#ff5c4d] font-semibold">SHARDLINE #{puzzle.day}</div>
          <h1 className="font-serif text-2xl leading-tight text-[#f4ead5]">The {puzzle.name}</h1>
        </div>
        <div className="text-right text-xs text-[#b9b2a3] leading-snug">
          <div>
            <b className="text-[#f4ead5] text-base">{puzzle.pieces}</b> equal pieces
          </div>
          <div>
            <b className="text-[#f4ead5] text-base">{puzzle.cuts}</b> straight cut{puzzle.cuts > 1 ? 's' : ''}
          </div>
        </div>
      </header>

      <div className="relative mt-2" style={{ width: size, height: size }}>
        <canvas
          ref={canvas}
          style={{ width: size, height: size, touchAction: 'none' }}
          className="rounded-2xl bg-[#1d1c26] cursor-crosshair"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label={`Shape to cut into ${puzzle.pieces} equal pieces`}
        />
        {phase === 'play' && placed === 0 && <GhostHint />}
      </div>

      {phase === 'play' && (
        <>
          <p className="mt-2 text-sm text-[#b9b2a3] min-h-[1.25rem] text-center px-4">{hint}</p>
          <div className="mt-2 flex gap-3">
            <button
              className="h-11 px-5 rounded-full border border-[#3a3846] text-[#f4ead5] disabled:opacity-30"
              disabled={placed === 0}
              onClick={() => {
                setCuts(cuts.slice(0, -1));
                setActive(null);
                setNudge('');
              }}
            >
              Undo
            </button>
            <button
              className="h-11 px-8 rounded-full font-semibold text-[#16151d] bg-[#ff5c4d] disabled:bg-[#3a3846] disabled:text-[#77727f] transition-colors"
              disabled={placed !== puzzle.cuts}
              onClick={() => void submit()}
            >
              Cut!
            </button>
          </div>
        </>
      )}

      {phase === 'done' && result && stats && (
        <ResultCard result={result} stats={stats} streak={streak} saved={saved} today={init.today} day={puzzle.day} onShare={share} />
      )}
    </Shell>
  );
};

const Shell = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen w-full flex flex-col items-center justify-start pt-3 pb-6 px-3 select-none" style={{ background: COLORS.ink }}>
    {children}
  </div>
);

const GhostHint = () => (
  <svg className="pointer-events-none absolute inset-0" viewBox="0 0 100 100" preserveAspectRatio="none">
    <line x1="12" y1="78" x2="88" y2="22" stroke="#ff5c4d" strokeWidth="0.8" strokeDasharray="3 2" className="ghost-line" />
    <circle r="2.2" fill="#ff5c4d" className="ghost-dot" />
  </svg>
);

const Countdown = ({ today }: { today: number }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, dayStartMs(today + 1) - now);
  const h = Math.floor(ms / 3.6e6);
  const m = Math.floor((ms % 3.6e6) / 6e4);
  const s = Math.floor((ms % 6e4) / 1000);
  return <span className="font-mono">{`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`}</span>;
};

const ResultCard = (props: {
  result: PlayerResult;
  stats: DayStats;
  streak: Streak;
  saved: boolean;
  today: number;
  day: number;
  onShare: () => void;
}) => {
  const { result, stats, streak, saved, today, day } = props;
  const max = Math.max(1, ...stats.hist);
  const mine = Math.min(19, Math.floor(result.score / 5));
  return (
    <section className="mt-4 w-full max-w-[520px] rounded-2xl bg-[#1d1c26] p-4 text-[#f4ead5] fade-in">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-4xl font-bold font-mono">{result.score.toFixed(1)}%</div>
          <div className="text-sm text-[#ff5c4d] font-semibold">{verdict(result.score)}</div>
        </div>
        <div className="text-right text-sm text-[#b9b2a3]">
          {saved && result.rank > 0 ? (
            <>
              <div>
                <b className="text-[#f4ead5]">#{result.rank}</b> of {result.players}
              </div>
              <div>beat {result.beat}% of cutters</div>
            </>
          ) : (
            <div>Log in to rank</div>
          )}
          {streak.current > 0 && <div className="text-[#f2b84b]">🔥 {streak.current}-day streak</div>}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[11px] tracking-widest text-[#77727f] mb-1">HOW EVERYONE CUT · AVG {stats.average.toFixed(1)}%</div>
        <div className="flex items-end gap-[3px] h-14">
          {stats.hist.map((n, i) => (
            <div
              key={i}
              title={`${i * 5}–${i * 5 + 5}%: ${n}`}
              className="flex-1 rounded-t-sm"
              style={{ height: `${Math.max(4, (n / max) * 100)}%`, background: i === mine ? '#ff5c4d' : '#3a3846' }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-[#77727f] mt-1 font-mono">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {stats.top.length > 0 && (
        <ol className="mt-4 text-sm space-y-1">
          {stats.top.slice(0, 5).map((t, i) => (
            <li key={t.name} className="flex justify-between">
              <span className="text-[#b9b2a3]">
                {i + 1}. u/{t.name}
              </span>
              <span className="font-mono">{t.score.toFixed(1)}%</span>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        {saved ? (
          <button className="h-10 px-4 rounded-full bg-[#ff5c4d] text-[#16151d] font-semibold whitespace-nowrap" onClick={props.onShare}>
            Share to comments
          </button>
        ) : (
          <span />
        )}
        <div className="text-xs text-[#b9b2a3] text-right">
          {day === today ? (
            <>
              Next shape in <Countdown today={today} />
            </>
          ) : (
            <>Today’s shape is #{today}: find it in the sub</>
          )}
        </div>
      </div>
    </section>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
