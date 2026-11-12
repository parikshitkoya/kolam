import './splash.css';

import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { context, requestExpandedMode } from '@devvit/web/client';
import { parsePostData, type PostData } from '../shared/api';
import { dateLabel } from '../shared/day';
import { layoutCells, makeBoard, orbits, parseStart } from '../shared/kolam/core';
import { replay } from '../shared/kolam/replay';
import { fetchState } from './game/api';
import { StillBoard } from './splash/StillBoard';

const Mark = () => (
  <div className="mark">
    <h1 className="wordmark">Kolam</h1>
    <span className="ta" lang="ta">
      கோலம்
    </span>
  </div>
);

/** The player's finished picture, if the server says they solved it. */
const useFinished = (pd: PostData) => {
  const [finished, setFinished] = useState<{ woven: Uint8Array; taps: number } | null>(null);
  useEffect(() => {
    let live = true;
    void fetchState().then((res) => {
      if (!live || !res.ok || !res.state.progress?.done || res.state.day !== pd.day) return;
      try {
        const B = makeBoard(layoutCells(pd.rows));
        const O = orbits(B, pd.group);
        const taps = res.state.progress.taps;
        setFinished({ woven: replay(B, O, parseStart(pd.start), taps).woven, taps: taps.length });
      } catch {
        // keep the start picture
      }
    });
    return () => {
      live = false;
    };
  }, [pd]);
  return finished;
};

const Puzzle = ({ pd }: { pd: PostData }) => {
  const startW = useMemo(() => parseStart(pd.start), [pd]);
  const finished = useFinished(pd);
  return (
    <main className="splash">
      <Mark />
      <p className="title">
        Kolam No. {pd.day} · {dateLabel(pd.day)}
      </p>
      <div className="stage">
        <StillBoard rows={pd.rows} woven={finished ? finished.woven : startW} />
      </div>
      <div className="foot">
        <span className="caption">
          {finished ? `Solved in ${finished.taps} taps` : `Par ${pd.par}`}
        </span>
        <button
          type="button"
          className="fill play"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          Play
        </button>
      </div>
    </main>
  );
};

export const Splash = () => {
  const pd = useMemo(() => parsePostData(context.postData), []);
  if (!pd) {
    return (
      <main className="splash">
        <Mark />
        <p className="calm">This post isn't a Kolam puzzle.</p>
      </main>
    );
  }
  return <Puzzle pd={pd} />;
};

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Splash />
    </StrictMode>
  );
}
