// Static board for the inline splash: dots and coloured lines, no hit targets.
import { useMemo } from 'react';
import { layoutCells, makeBoard, traceLoops } from '../../shared/kolam/core';
import { POWDER, assignColours } from '../../shared/kolam/colours';
import { U, boardBox } from '../game/geometry';

export type StillBoardProps = { rows: number[]; woven: Uint8Array };

export const StillBoard = ({ rows, woven }: StillBoardProps) => {
  const B = useMemo(() => makeBoard(layoutCells(rows)), [rows]);
  const { traces, colours } = useMemo(() => {
    const t = traceLoops(B, woven, U);
    return { traces: t, colours: assignColours(B, t, null).colours };
  }, [B, woven]);
  const solved = traces.length === 1;
  return (
    <svg className="still" viewBox={boardBox(B).viewBox} role="img" aria-label="Today's kolam">
      <defs>
        <filter id="hand" x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={7} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={6} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter="url(#hand)">
        {traces.map((t, i) => (
          <path
            key={i}
            className="ln"
            d={t.path}
            stroke={solved ? 'var(--rice)' : POWDER[colours[i] ?? 0]}
          />
        ))}
      </g>
      <g>
        {B.cells.map(([x, y], i) => (
          <circle key={i} className="dot" cx={(x + 0.5) * U} cy={(y + 0.5) * U} r={6.5} />
        ))}
      </g>
    </svg>
  );
};
