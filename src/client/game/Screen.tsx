// The game screen layout, shared by the expanded entry and the local preview tool.
import type { ReactNode } from 'react';
import type { Board as BoardT, Group, Orbits } from '../../shared/kolam/core';
import { Board } from './Board';
import { Ledge } from './Ledge';
import { announceText } from './announce';

const REACH: Record<Group, string> = {
  mirror: 'across the mirror',
  rot2: 'at the half turn',
  mirror2: 'across both mirrors',
  rot4: 'at every quarter turn',
};

export type PatternsToggle = { on: boolean; toggle(): void };

export const NameStrip = ({
  day,
  date,
  patterns,
}: {
  day: number | null;
  date: string;
  patterns?: PatternsToggle;
}) => (
  <header className="top">
    <div className="mark">
      <h1 className="wordmark">Kolam</h1>
      <span className="ta" lang="ta">
        கோலம்
      </span>
    </div>
    {patterns && (
      <button type="button" className="toggle" aria-pressed={patterns.on} onClick={patterns.toggle}>
        Patterns
      </button>
    )}
    {day !== null && (
      <div className="day">
        <b>No. {day}</b>
        <span>{date}</span>
      </div>
    )}
  </header>
);

export type ScreenProps = {
  day: number;
  date: string;
  group: Group;
  par: number;
  B: BoardT;
  O: Orbits;
  woven: Uint8Array;
  segColour: Int8Array;
  taps: number;
  loops: number;
  done: boolean;
  saving: boolean;
  onTap(orbit: number): void;
  /** Optional strip under the rule (offline notice, preview tools). */
  notice?: ReactNode;
  /** Replaces the ledge once done (the result card). */
  card?: ReactNode;
  onHint?: () => void;
  hintBusy?: boolean;
  nudge?: { orbit: number; n: number } | null;
  patterns?: PatternsToggle;
};

export const Screen = (p: ScreenProps) => (
  <main className="app">
    <NameStrip day={p.day} date={p.date} {...(p.patterns ? { patterns: p.patterns } : {})} />
    <p className="rule">
      {p.done ? (
        'Drawn at the doorstep each morning, gone by night. Come back tomorrow for a new one.'
      ) : (
        <>
          <strong>Tap between two dots</strong> to cross their lines or part them. Each tap repeats{' '}
          {REACH[p.group]}.
        </>
      )}
    </p>
    {p.notice}
    <div className="floor">
      <Board
        B={p.B}
        O={p.O}
        group={p.group}
        woven={p.woven}
        segColour={p.segColour}
        done={p.done}
        fresh={p.taps === 0}
        onTap={p.onTap}
        nudge={p.nudge ?? null}
        patterns={p.patterns?.on ?? false}
      />
    </div>
    <p className="sr-only" aria-live="polite">
      {announceText(p.loops, p.done)}
    </p>
    {p.done && p.card ? (
      p.card
    ) : (
      <Ledge
        loops={p.loops}
        taps={p.taps}
        par={p.par}
        saving={p.saving}
        done={p.done}
        {...(p.onHint ? { onHint: p.onHint } : {})}
        hintBusy={p.hintBusy ?? false}
      />
    )}
  </main>
);
