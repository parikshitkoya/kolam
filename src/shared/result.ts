// Result copy shared by the server (what gets posted) and the client (what the card and confirm show),
// so the confirm step previews exactly what will be posted. Wording fixed by build spec §7.5.
import type { Result, Stats } from './api';

const tapsWord = (n: number) => `${n} tap${n === 1 ? '' : 's'}`;

export const verdictText = (taps: number, par: number, hints: number): string => {
  const base =
    taps <= par ? `Perfect. ${tapsWord(taps)}, right on par.` : `${tapsWord(taps)}, ${taps - par} over par.`;
  return hints > 0 ? `${base} ${hints} hint${hints === 1 ? '' : 's'} used.` : base;
};

export const trailText = (trail: number[]): string => trail.join(' › ');

export const communityLine = (stats: Stats): string | null => {
  if (stats.solved < 1) return null;
  const pct = Math.round((100 * (stats.over[0] ?? 0)) / stats.solved);
  return `${pct}% of players matched par.`;
};

export const commentText = (day: number, r: Result, message: string | null): string =>
  `Kolam No. ${day}: ${trailText(r.trail)}  (${r.taps} taps, par ${r.par})` + (message ? `\n\n${message}` : '');

export const MESSAGE_MAX = 500;

export const cleanMessage = (x: unknown): string | null => {
  if (typeof x !== 'string') return null;
  const t = x.trim();
  if (t.length === 0) return null;
  return t.length > MESSAGE_MAX ? t.slice(0, MESSAGE_MAX) : t;
};
