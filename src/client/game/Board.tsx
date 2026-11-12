// SVG board after the prototype's buildBoard/paint: dots, coloured loops, gap hit targets,
// orbit highlight, flash rings, fresh pulse and the completion draw-on.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { traceLoops, type Board as BoardT, type Group, type Orbits } from '../../shared/kolam/core';
import { POWDER } from '../../shared/kolam/colours';
import { PAD, U, boardBox } from './geometry';

export type BoardProps = {
  B: BoardT;
  O: Orbits;
  group: Group;
  woven: Uint8Array;
  segColour: Int8Array;
  done: boolean;
  fresh: boolean;
  onTap(orbit: number): void;
  /** Pulse an orbit's rings (hint). A new `n` replays the pulse. */
  nudge?: { orbit: number; n: number } | null;
};

/** Row and dot numbers (1-based) for each cell, for gap labels. */
const cellNames = (B: BoardT) => {
  const perRow = new Map<number, number>();
  return B.cells.map(([, y]) => {
    const k = (perRow.get(y) ?? 0) + 1;
    perRow.set(y, k);
    return { row: y + 1, dot: k };
  });
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export const Guides = ({ B, group }: { B: BoardT; group: Group }) => {
  if (group !== 'mirror' && group !== 'mirror2') return null;
  const { minx, miny, W, H } = boardBox(B);
  const cx = minx * U + W / 2;
  const cy = miny * U + H / 2;
  return (
    <g>
      <line className="guide" x1={cx} y1={miny * U - PAD * 0.7} x2={cx} y2={miny * U + H + PAD * 0.7} />
      {group === 'mirror2' && (
        <line className="guide" x1={minx * U - PAD * 0.7} y1={cy} x2={minx * U + W + PAD * 0.7} y2={cy} />
      )}
    </g>
  );
};

export const HandFilter = ({ id }: { id: string }) => (
  <filter id={id} x="-4%" y="-4%" width="108%" height="108%">
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={7} result="n" />
    <feDisplacementMap in="SourceGraphic" in2="n" scale={6} xChannelSelector="R" yChannelSelector="G" />
  </filter>
);

export const Board = ({ B, O, group, woven, segColour, done, fresh, onTap, nudge }: BoardProps) => {
  const [hot, setHot] = useState<number | null>(null);
  const ringRefs = useRef<(SVGCircleElement | null)[]>([]);
  const prevWoven = useRef<Uint8Array | null>(null);
  // The draw-on plays only when the puzzle is solved during this visit.
  const [animateFinish] = useState(() => !done);

  const box = useMemo(() => boardBox(B), [B]);
  const names = useMemo(() => cellNames(B), [B]);
  const traces = useMemo(() => traceLoops(B, woven, U), [B, woven]);

  // Flash a ring on every gap that changed since the last render.
  useEffect(() => {
    const prev = prevWoven.current;
    prevWoven.current = woven;
    if (!prev || prev.length !== woven.length || prefersReducedMotion()) return;
    for (let gi = 0; gi < woven.length; gi++) {
      if (prev[gi] === woven[gi]) continue;
      ringRefs.current[gi]?.animate?.(
        [
          { opacity: 0.95, transform: 'scale(.5)' },
          { opacity: 0, transform: 'scale(1.5)' },
        ],
        { duration: 500, easing: 'ease-out' }
      );
    }
  }, [woven]);

  // Hint: pulse every ring of the hinted orbit (prototype pulse(o, 'nudge')).
  useEffect(() => {
    if (!nudge) return;
    const reduced = prefersReducedMotion();
    for (const gi of O.orbs[nudge.orbit] ?? []) {
      ringRefs.current[gi]?.animate?.(
        reduced
          ? [{ opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }]
          : [
              { opacity: 0.15, transform: 'scale(.8)' },
              { opacity: 1, transform: 'scale(1.2)' },
              { opacity: 0.15, transform: 'scale(.8)' },
            ],
        { duration: 1000, easing: 'ease-in-out', iterations: 3 }
      );
    }
  }, [nudge, O]);

  const solved = done && traces.length === 1;
  const svgClass = ['board', solved ? 'solved' : '', fresh && !solved ? 'fresh' : ''].join(' ').trim();

  const onKey = (o: number) => (e: KeyboardEvent<SVGCircleElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTap(o);
    }
  };
  const onEnter = (o: number) => (e: PointerEvent<SVGCircleElement>) => {
    if (e.pointerType === 'mouse') setHot(o);
  };

  return (
    <svg className={svgClass} viewBox={box.viewBox} role="group" aria-label="Kolam board">
      <defs>
        <HandFilter id="hand" />
      </defs>
      <Guides B={B} group={group} />
      <g filter="url(#hand)">
        {traces.map((t, i) => {
          const c = segColour[t.segs[0] ?? 0] ?? 0;
          return (
            <path
              key={i}
              className={solved && !animateFinish ? 'ln still' : 'ln'}
              d={t.path}
              stroke={POWDER[c >= 0 ? c : 0]}
              pathLength={1}
            />
          );
        })}
      </g>
      <g>
        {B.cells.map(([x, y], i) => (
          <circle key={i} className="dot" cx={(x + 0.5) * U} cy={(y + 0.5) * U} r={6.5} />
        ))}
      </g>
      <g>
        {B.gaps.map((g, gi) => {
          const cx = (g.mx * U) / 2;
          const cy = (g.my * U) / 2;
          const o = O.of[gi] ?? -1;
          const isHot = hot !== null && o === hot;
          const a = names[g.a];
          const b = names[g.b];
          const label = `Gap between row ${a?.row}, dot ${a?.dot} and row ${b?.row}, dot ${b?.dot}, ${woven[gi] ? 'crossed' : 'parted'}`;
          return (
            <g key={gi}>
              <circle className={isHot ? 'tick hot' : 'tick'} cx={cx} cy={cy} r={3.2} />
              <circle
                className="hit"
                cx={cx}
                cy={cy}
                r={33}
                tabIndex={solved ? -1 : 0}
                role="button"
                aria-label={label}
                onClick={() => onTap(o)}
                onKeyDown={onKey(o)}
                onPointerEnter={onEnter(o)}
                onPointerLeave={() => setHot(null)}
                onFocus={() => setHot(o)}
                onBlur={() => setHot(null)}
              />
              <circle
                ref={(el) => {
                  ringRefs.current[gi] = el;
                }}
                className={isHot ? 'ring hot' : 'ring'}
                cx={cx}
                cy={cy}
                r={17}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
};
