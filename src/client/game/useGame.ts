// Game state: optimistic taps, ordered server sync, logged-out local play, offline fallback.
import { useEffect, useState } from 'react';
import { context, showToast } from '@devvit/web/client';
import { parsePostData, type StateResponse } from '../../shared/api';
import { dateLabel } from '../../shared/day';
import { assignColours } from '../../shared/kolam/colours';
import {
  layoutCells,
  makeBoard,
  orbits,
  parseStart,
  traceLoops,
  type Board,
  type Group,
  type Orbits,
} from '../../shared/kolam/core';
import { replay } from '../../shared/kolam/replay';
import { fetchState, sendTap } from './api';
import { loadLocal, saveLocal } from './storage';
import { TapQueue } from './tapQueue';

export type Phase = 'loading' | 'ready' | 'notKolam' | 'offline';

type Info = { day: number; rows: number[]; group: Group; start: string; par: number };

export type Game = Info & {
  B: Board;
  O: Orbits;
  startW: Uint8Array;
  taps: number[];
  woven: Uint8Array;
  trail: number[];
  loops: number;
  done: boolean;
  segColour: Int8Array;
};

/** server: logged in, synced through the queue. local: logged out. buffer: logged in but offline. */
type Mode = 'server' | 'local' | 'buffer';

const U = 100;

const withTaps = (g: Omit<Game, 'taps' | 'woven' | 'trail' | 'loops' | 'done' | 'segColour'>, taps: number[], prevSeg: Int8Array | null): Game => {
  let r: ReturnType<typeof replay>;
  let kept = taps;
  try {
    r = replay(g.B, g.O, g.startW, taps);
  } catch {
    kept = [];
    r = replay(g.B, g.O, g.startW, kept);
  }
  const { segColour } = assignColours(g.B, traceLoops(g.B, r.woven, U), prevSeg);
  return { ...g, taps: kept, woven: r.woven, trail: r.trail, loops: r.loops, done: r.loops === 1, segColour };
};

const build = (info: Info, taps: number[]): Game | null => {
  try {
    const B = makeBoard(layoutCells(info.rows));
    const O = orbits(B, info.group);
    const startW = parseStart(info.start);
    if (startW.length !== B.gaps.length) return null;
    return withTaps({ ...info, B, O, startW }, taps, null);
  } catch {
    return null;
  }
};

const infoFromState = (s: StateResponse): Info => ({
  day: s.day,
  rows: s.puzzle.rows,
  group: s.puzzle.group,
  start: s.puzzle.start,
  par: s.par,
});

type Setters = {
  setPhase: (p: Phase) => void;
  setGame: (g: Game | null) => void;
  setSaving: (s: boolean) => void;
};

const createController = (set: Setters) => {
  let phase: Phase = 'loading';
  let game: Game | null = null;
  let mode: Mode = 'local';
  let buffer: number[] = [];

  const setPhase = (p: Phase) => {
    phase = p;
    set.setPhase(p);
  };
  const setGame = (g: Game | null) => {
    game = g;
    set.setGame(g);
  };

  const adopt = (s: StateResponse, extraTaps: number[] = []) => {
    const info = infoFromState(s);
    let taps: number[];
    if (s.loggedIn) {
      mode = 'server';
      taps = s.progress?.taps ?? [];
    } else {
      mode = 'local';
      taps = loadLocal(info.day)?.taps ?? [];
    }
    const g = build(info, [...taps, ...extraTaps]);
    if (!g) {
      setPhase('notKolam');
      return;
    }
    setGame(g);
    setPhase('ready');
  };

  const resync = async () => {
    const res = await fetchState();
    if (res.ok) {
      queue.clear();
      adopt(res.state);
    }
  };

  const queue = new TapQueue({
    send: sendTap,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onConflict: (taps) => {
      if (!game) return;
      setGame(withTaps(game, taps, game.segColour));
      showToast('Synced with your saved game.');
    },
    onDone: () => {
      void resync();
    },
    onResult: (r) => {
      // If the server's count after this tap disagrees with ours, adopt the server state.
      if (game && game.trail[r.taps] !== r.loops) void resync();
    },
    onIdleChange: (idle) => set.setSaving(!idle),
  });

  const goOffline = () => {
    const pd = parsePostData(context.postData);
    if (!pd) {
      setPhase('notKolam');
      return;
    }
    const info: Info = { day: pd.day, rows: pd.rows, group: pd.group, start: pd.start, par: pd.par };
    const loggedIn = Boolean(context.userId);
    mode = loggedIn ? 'buffer' : 'local';
    buffer = [];
    const g = build(info, loggedIn ? [] : (loadLocal(info.day)?.taps ?? []));
    if (!g) {
      setPhase('notKolam');
      return;
    }
    setGame(g);
    setPhase('offline');
  };

  const load = async () => {
    const res = await fetchState();
    if (res.ok) adopt(res.state);
    else if (res.status === 404) setPhase('notKolam');
    else goOffline();
  };

  const retry = async () => {
    const res = await fetchState();
    if (!res.ok) {
      if (res.status === 404) setPhase('notKolam');
      else showToast('Still offline. Your taps are kept here.');
      return;
    }
    const pending = mode === 'buffer' ? buffer : [];
    buffer = [];
    const s = res.state;
    const serverTaps = s.progress?.taps ?? [];
    if (s.loggedIn && pending.length > 0 && serverTaps.length === 0) {
      // Nothing saved yet on the server: replay the offline taps through the queue, in order.
      adopt(s, pending);
      pending.forEach((orbit, index) => queue.push({ orbit, index }));
      return;
    }
    adopt(s);
    if (pending.length > 0) showToast('Synced with your saved game.');
  };

  const tap = (orbit: number) => {
    const g = game;
    if (!g || g.done || (phase !== 'ready' && phase !== 'offline')) return;
    const taps = [...g.taps, orbit];
    const next = withTaps(g, taps, g.segColour);
    setGame(next);
    if (mode === 'server') queue.push({ orbit, index: taps.length - 1 });
    else if (mode === 'buffer') buffer.push(orbit);
    else saveLocal(g.day, { taps, hints: 0, done: next.done });
  };

  return { load, retry, tap };
};

export const useGame = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [game, setGame] = useState<Game | null>(null);
  const [saving, setSaving] = useState(false);
  const [ctl] = useState(() => createController({ setPhase, setGame, setSaving }));

  useEffect(() => {
    void ctl.load();
  }, [ctl]);

  return {
    phase,
    game,
    dateLabel: game ? dateLabel(game.day) : '',
    saving,
    tap: ctl.tap,
    retry: () => void ctl.retry(),
  };
};
