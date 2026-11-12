import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Group } from '../shared/kolam/core';
import { Board } from './game/Board';
import { Ledge } from './game/Ledge';
import { useGame } from './game/useGame';

const REACH: Record<Group, string> = {
  mirror: 'across the mirror',
  rot2: 'at the half turn',
  mirror2: 'across both mirrors',
  rot4: 'at every quarter turn',
};

const NameStrip = ({ day, date }: { day: number | null; date: string }) => (
  <header className="top">
    <div className="mark">
      <h1 className="wordmark">Kolam</h1>
      <span className="ta" lang="ta">
        கோலம்
      </span>
    </div>
    {day !== null && (
      <div className="day">
        <b>No. {day}</b>
        <span>{date}</span>
      </div>
    )}
  </header>
);

export const App = () => {
  const { phase, game, dateLabel, saving, tap, retry } = useGame();

  if (phase === 'notKolam') {
    return (
      <main className="app">
        <NameStrip day={null} date="" />
        <p className="calm">This post isn't a Kolam puzzle.</p>
      </main>
    );
  }

  if (phase === 'loading' || !game) {
    return (
      <main className="app" aria-busy="true">
        <NameStrip day={null} date="" />
      </main>
    );
  }

  return (
    <main className="app">
      <NameStrip day={game.day} date={dateLabel} />
      <p className="rule">
        {game.done ? (
          'Drawn at the doorstep each morning, gone by night. Come back tomorrow for a new one.'
        ) : (
          <>
            <strong>Tap between two dots</strong> to cross their lines or part them. Each tap repeats{' '}
            {REACH[game.group]}.
          </>
        )}
      </p>
      {phase === 'offline' && (
        <div className="strip" role="status">
          <span>Can't reach Reddit. Your taps are kept here.</span>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      <div className="floor">
        <Board
          B={game.B}
          O={game.O}
          group={game.group}
          woven={game.woven}
          segColour={game.segColour}
          done={game.done}
          fresh={game.taps.length === 0}
          onTap={tap}
        />
      </div>
      <Ledge loops={game.loops} taps={game.taps.length} par={game.par} saving={saving} done={game.done} />
    </main>
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
