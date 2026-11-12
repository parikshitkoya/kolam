// Game state: optimistic taps, ordered server sync, logged-out local play, offline fallback,
// and (M2) the result card, hints, comment and subscribe.
import { useEffect, useState } from 'react';
import { telemetry } from '@devvit/analytics/client/reddit';
import { context, showLoginPrompt, showToast } from '@devvit/web/client';
import { parsePostData, type Result, type StateResponse } from '../../shared/api';
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
import { fetchState, postComment, postSubscribe, requestHint, sendTap } from './api';
import { createJourney } from './journey';
import { clearLocal, loadLocal, saveLocal } from './storage';
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

export type Social = { subscribed: boolean; commented: boolean; username: string | null };
export type Nudge = { orbit: number; n: number };

/** server: logged in, synced through the queue. local: logged out. buffer: logged in but offline. */
type Mode = 'server' | 'local' | 'buffer';

const U = 100;

type Base = Omit<Game, 'taps' | 'woven' | 'trail' | 'loops' | 'done' | 'segColour'>;

const withTaps = (g: Base, taps: number[], prevSeg: Int8Array | null): Game => {
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

/** What the card shows before (or without) the server's result: no stats, no streak. */
export const localResult = (g: Game, hints: number): Result => ({
  trail: g.trail,
  taps: g.taps.length,
  par: g.par,
  hints,
  streak: null,
  stats: { players: 0, solved: 0, over: [0, 0, 0, 0, 0, 0] },
});

type Setters = {
  setPhase: (p: Phase) => void;
  setGame: (g: Game | null) => void;
  setSaving: (s: boolean) => void;
  setServerResult: (r: Result | null) => void;
  setSocial: (s: Social) => void;
  setLoggedIn: (b: boolean) => void;
  setJustFinished: (b: boolean) => void;
  setHints: (n: number) => void;
  setHintBusy: (b: boolean) => void;
  setNudge: (n: Nudge) => void;
};

const createController = (set: Setters) => {
  let phase: Phase = 'loading';
  let game: Game | null = null;
  let mode: Mode = 'local';
  let buffer: number[] = [];
  let social: Social = { subscribed: false, commented: false, username: null };
  let hintBusy = false;
  let nudges = 0;
  const journey = createJourney(telemetry);

  const setPhase = (p: Phase) => {
    phase = p;
    set.setPhase(p);
  };
  const setGame = (g: Game | null) => {
    game = g;
    set.setGame(g);
  };
  const setSocial = (s: Social) => {
    social = s;
    set.setSocial(s);
  };
  const setMode = (m: Mode) => {
    mode = m;
    set.setLoggedIn(m === 'server');
  };

  const adopt = (s: StateResponse, extraTaps: number[] = []) => {
    const info = infoFromState(s);
    let taps: number[];
    if (s.loggedIn) {
      setMode('server');
      taps = s.progress?.taps ?? [];
      // Local progress is never merged into the account (design §3.4). Say so once if it was a finish.
      const local = loadLocal(info.day);
      if (local) {
        if (local.done && taps.length === 0) {
          showToast("Your earlier taps on this device weren't saved to your account");
        }
        clearLocal(info.day);
      }
    } else {
      setMode('local');
      taps = loadLocal(info.day)?.taps ?? [];
    }
    const g = build(info, [...taps, ...extraTaps]);
    if (!g) {
      setPhase('notKolam');
      return;
    }
    setGame(g);
    set.setServerResult(s.result ?? null);
    set.setHints(s.progress?.hints ?? 0);
    setSocial({ subscribed: s.subscribed, commented: s.commented, username: s.username });
    setPhase('ready');
    journey.ready();
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
      if (r.result) set.setServerResult(r.result);
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
    setMode(loggedIn ? 'buffer' : 'local');
    buffer = [];
    const g = build(info, loggedIn ? [] : (loadLocal(info.day)?.taps ?? []));
    if (!g) {
      setPhase('notKolam');
      return;
    }
    setGame(g);
    setPhase('offline');
    journey.ready();
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
    journey.tap(next.loops, next.trail[0] ?? next.loops);
    if (next.done) {
      set.setJustFinished(true);
      journey.finish(taps.length, g.par);
    }
    if (mode === 'server') queue.push({ orbit, index: taps.length - 1 });
    else if (mode === 'buffer') buffer.push(orbit);
    else saveLocal(g.day, { taps, hints: 0, done: next.done });
  };

  const hint = async () => {
    if (mode !== 'server' || !game || game.done || hintBusy) return;
    hintBusy = true;
    set.setHintBusy(true);
    try {
      const r = await requestHint();
      if (r.ok) {
        nudges++;
        set.setNudge({ orbit: r.orbit, n: nudges });
        set.setHints(r.hints);
        journey.hint();
      } else if (r.status === 400) {
        void resync();
      } else {
        showToast('No hint available right now');
      }
    } finally {
      hintBusy = false;
      set.setHintBusy(false);
    }
  };

  const comment = async (message: string | null): Promise<boolean> => {
    const r = await postComment(message);
    if (r.ok || r.status === 409) {
      setSocial({ ...social, commented: true });
      showToast(r.ok ? 'Comment posted' : "You've already commented on today's puzzle.");
      return true;
    }
    showToast("Couldn't post. Try again.");
    return false;
  };

  const subscribe = async (): Promise<boolean> => {
    const r = await postSubscribe();
    if (r.ok) {
      setSocial({ ...social, subscribed: true });
      return true;
    }
    showToast("Couldn't join. Try again.");
    return false;
  };

  /** Logged out: keep the finished game, then ask Reddit to log in (the page reloads). */
  const login = () => {
    if (game) saveLocal(game.day, { taps: game.taps, hints: 0, done: game.done });
    showLoginPrompt();
  };

  return { load, retry, tap, hint, comment, subscribe, login };
};

export const useGame = () => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [game, setGame] = useState<Game | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverResult, setServerResult] = useState<Result | null>(null);
  const [social, setSocial] = useState<Social>({ subscribed: false, commented: false, username: null });
  const [loggedIn, setLoggedIn] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const [hintsUsed, setHints] = useState(0);
  const [hintBusy, setHintBusy] = useState(false);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [ctl] = useState(() =>
    createController({
      setPhase,
      setGame,
      setSaving,
      setServerResult,
      setSocial,
      setLoggedIn,
      setJustFinished,
      setHints,
      setHintBusy,
      setNudge,
    })
  );

  useEffect(() => {
    void ctl.load();
  }, [ctl]);

  const result = serverResult ?? (game?.done ? localResult(game, hintsUsed) : null);

  return {
    phase,
    game,
    dateLabel: game ? dateLabel(game.day) : '',
    saving,
    loggedIn,
    result,
    justFinished,
    hintsUsed,
    hintBusy,
    nudge,
    ...social,
    subredditName: context.subredditName ?? '',
    tap: ctl.tap,
    retry: () => void ctl.retry(),
    hint: () => void ctl.hint(),
    comment: ctl.comment,
    subscribe: ctl.subscribe,
    login: ctl.login,
  };
};
