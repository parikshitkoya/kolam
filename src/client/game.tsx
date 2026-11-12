import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ResultCard } from './game/ResultCard';
import { NameStrip, Screen } from './game/Screen';
import { useGame } from './game/useGame';

export const App = () => {
  const g = useGame();
  const { phase, game, dateLabel, saving, tap, retry } = g;

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
    <Screen
      day={game.day}
      date={dateLabel}
      group={game.group}
      par={game.par}
      B={game.B}
      O={game.O}
      woven={game.woven}
      segColour={game.segColour}
      taps={game.taps.length}
      loops={game.loops}
      done={game.done}
      saving={saving}
      onTap={tap}
      {...(g.loggedIn ? { onHint: g.hint } : {})}
      hintBusy={g.hintBusy}
      nudge={g.nudge}
      card={
        g.result && (
          <ResultCard
            day={game.day}
            result={g.result}
            loggedIn={g.loggedIn}
            username={g.username}
            subredditName={g.subredditName}
            subscribed={g.subscribed}
            commented={g.commented}
            onComment={g.comment}
            onSubscribe={g.subscribe}
            onLogin={g.login}
          />
        )
      }
      notice={
        phase === 'offline' && (
          <div className="strip" role="status">
            <span>Can't reach Reddit. Your taps are kept here.</span>
            <button type="button" onClick={retry}>
              Retry
            </button>
          </div>
        )
      }
    />
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
