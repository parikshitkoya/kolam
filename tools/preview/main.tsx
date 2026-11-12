// Kolam local preview: play any day's real puzzle in the real game screen, with no Reddit.
// Prev / Next / jump to day, reset, auto-solve. Progress is kept in this browser only.
import '../../src/client/index.css';
import './preview.css';

import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ResultCard } from '../../src/client/game/ResultCard';
import { Screen } from '../../src/client/game/Screen';
import { dateLabel, weekdayOf, WEEKDAY_NAMES } from '../../src/shared/day';
import { assignColours } from '../../src/shared/kolam/colours';
import { parseStart, traceLoops } from '../../src/shared/kolam/core';
import { replay } from '../../src/shared/kolam/replay';
import { TIERS, recipeBoard, type Daily } from '../../src/server/kolam/daily';
import { solve } from '../../src/server/kolam/solver';
import type { FromWorker } from './generator.worker';

const PREFETCH = 3;
const tapsKey = (day: number) => `kolam-preview:taps:${day}`;
const DAY_KEY = 'kolam-preview:day';

const loadTaps = (day: number): number[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(tapsKey(day)) ?? '[]');
    return Array.isArray(v) && v.every((x) => Number.isInteger(x)) ? v : [];
  } catch {
    return [];
  }
};
const saveTaps = (day: number, taps: number[]) => {
  try {
    if (taps.length === 0) localStorage.removeItem(tapsKey(day));
    else localStorage.setItem(tapsKey(day), JSON.stringify(taps));
  } catch {
    // preview only
  }
};
const initialDay = (): number => {
  const fromHash = Number(new URLSearchParams(location.hash.slice(1)).get('day'));
  if (Number.isInteger(fromHash) && fromHash >= 1) return fromHash;
  try {
    const v = Number(localStorage.getItem(DAY_KEY));
    if (Number.isInteger(v) && v >= 1) return v;
  } catch {
    // ignore
  }
  return 1;
};

type Play = { day: number; taps: number[]; segColour: Int8Array | null };

const usePuzzles = () => {
  const [dailies, setDailies] = useState<Map<number, { daily: Daily; ms: number }>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const worker = useMemo(
    () => new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' }),
    []
  );
  useEffect(() => {
    const onMsg = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === 'day') setDailies((prev) => new Map(prev).set(m.daily.day, { daily: m.daily, ms: m.ms }));
      else setError(`Day ${m.day}: ${m.message}`);
    };
    worker.addEventListener('message', onMsg);
    return () => worker.removeEventListener('message', onMsg);
  }, [worker]);
  const want = useCallback((upTo: number) => worker.postMessage({ upTo }), [worker]);
  return { dailies, error, want };
};

const App = () => {
  const { dailies, error, want } = usePuzzles();
  const [day, setDay] = useState(initialDay);
  const [play, setPlay] = useState<Play>(() => ({ day, taps: loadTaps(day), segColour: null }));
  const [showTools, setShowTools] = useState(true);
  const [jump, setJump] = useState(String(day));
  const [round, setRound] = useState(0); // remounts the board after Reset
  const autoTimer = useRef<number | null>(null);

  const entry = dailies.get(day);

  useEffect(() => {
    want(day + PREFETCH);
  }, [day, want]);

  // Derived board state for the current day.
  const view = useMemo(() => {
    if (!entry || play.day !== day) return null;
    const { B, O } = recipeBoard(`${entry.daily.layout}:${entry.daily.group}`);
    const startW = parseStart(entry.daily.start);
    let r: ReturnType<typeof replay>;
    try {
      r = replay(B, O, startW, play.taps);
    } catch {
      r = replay(B, O, startW, []);
    }
    const segColour = play.segColour ?? assignColours(B, traceLoops(B, r.woven, 100), null).segColour;
    return { B, O, startW, ...r, segColour, done: r.loops === 1 };
  }, [entry, play, day]);

  const stopAuto = () => {
    if (autoTimer.current !== null) window.clearTimeout(autoTimer.current);
    autoTimer.current = null;
  };

  const goTo = useCallback((d: number) => {
    const next = Math.max(1, Math.floor(d));
    stopAuto();
    setDay(next);
    setJump(String(next));
    setPlay({ day: next, taps: loadTaps(next), segColour: null });
    try {
      localStorage.setItem(DAY_KEY, String(next));
    } catch {
      // ignore
    }
    history.replaceState(null, '', `#day=${next}`);
  }, []);

  const tap = useCallback(
    (orbit: number) => {
      setPlay((p) => {
        if (!entry || p.day !== day) return p;
        const { B, O } = recipeBoard(`${entry.daily.layout}:${entry.daily.group}`);
        const startW = parseStart(entry.daily.start);
        if (replay(B, O, startW, p.taps).loops === 1) return p; // done: ignore taps
        const taps = [...p.taps, orbit];
        const r = replay(B, O, startW, taps);
        const prevSeg = p.segColour ?? assignColours(B, traceLoops(B, replay(B, O, startW, p.taps).woven, 100), null).segColour;
        const { segColour } = assignColours(B, traceLoops(B, r.woven, 100), prevSeg);
        saveTaps(p.day, taps);
        return { ...p, taps, segColour };
      });
    },
    [entry, day]
  );

  const reset = () => {
    stopAuto();
    saveTaps(day, []);
    setPlay({ day, taps: [], segColour: null });
    setRound((n) => n + 1);
  };

  const autoSolve = () => {
    if (!view || view.done) return;
    stopAuto();
    const r = solve(view.B, view.O, view.woven, view.O.orbs.length);
    if (!r) return;
    const seq = r.sol.slice();
    const next = () => {
      const o = seq.shift();
      if (o === undefined) return;
      tap(o);
      autoTimer.current = window.setTimeout(next, 450);
    };
    next();
  };

  // Keyboard: [ and ] change day, h hides the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === '[') goTo(day - 1);
      else if (e.key === ']') goTo(day + 1);
      else if (e.key === 'h') setShowTools((s) => !s);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [day, goTo]);

  const tier = TIERS[weekdayOf(day)];
  const solvedDays = useMemo(() => {
    let n = 0;
    for (const [d] of dailies) if (loadTaps(d).length > 0) n++;
    return n;
  }, [dailies, play]);

  const tools = showTools ? (
    <div className="tools" role="region" aria-label="Preview tools">
      <div className="row">
        <button type="button" onClick={() => goTo(day - 1)} disabled={day <= 1}>
          ‹ Prev
        </button>
        <input
          aria-label="Go to day"
          value={jump}
          onChange={(e) => setJump(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') goTo(Number(jump) || 1);
          }}
        />
        <button type="button" onClick={() => goTo(day + 1)}>
          Next ›
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
        <button type="button" onClick={autoSolve} disabled={!view || view.done}>
          Auto-solve
        </button>
        <button type="button" onClick={() => setShowTools(false)} title="Hide (h)">
          ×
        </button>
      </div>
      {entry ? (
        <div className="info">
          {WEEKDAY_NAMES[weekdayOf(day)]} ({tier?.name}) · {entry.daily.layout}:{entry.daily.group} · par{' '}
          {entry.daily.par} · {entry.daily.loops} loops · {entry.daily.nsol} shortest ·{' '}
          {entry.daily.mono ? 'greedy works' : 'needs a sideways tap'} · made in {entry.ms} ms
          {entry.daily.strict ? '' : ' · relaxed rules'}
        </div>
      ) : (
        <div className="info">Generating No. {day}… ({dailies.size} days ready)</div>
      )}
      <div className="info">
        Days played: {solvedDays} · keys: [ ] change day, h hide panel
      </div>
      {error && <div className="warn">{error}</div>}
    </div>
  ) : (
    <button type="button" className="tools-tab" onClick={() => setShowTools(true)}>
      Tools (h)
    </button>
  );

  if (!view || !entry) {
    return (
      <>
        <main className="app" aria-busy="true">
          <p className="calm">Generating No. {day}…</p>
        </main>
        {tools}
      </>
    );
  }

  return (
    <>
      <Screen
        key={`${day}:${round}`}
        day={day}
        date={dateLabel(day)}
        group={entry.daily.group}
        par={entry.daily.par}
        B={view.B}
        O={view.O}
        woven={view.woven}
        segColour={view.segColour}
        taps={play.taps.length}
        loops={view.loops}
        done={view.done}
        saving={false}
        onTap={tap}
        card={
          <ResultCard
            day={day}
            result={{
              trail: view.trail,
              taps: play.taps.length,
              par: entry.daily.par,
              hints: 0,
              streak: null,
              stats: { players: 0, solved: 0, over: [0, 0, 0, 0, 0, 0] },
            }}
            loggedIn={false}
            username={null}
            subredditName="kolamdaily_dev"
            subscribed={false}
            commented={false}
            onComment={async () => true}
            onSubscribe={async () => true}
            onLogin={() => {}}
          />
        }
      />
      {tools}
    </>
  );
};

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
