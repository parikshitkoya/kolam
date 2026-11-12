/** How the result card treats the player. `syncing` = logged in but offline, taps not yet saved. */
export type CardAccount = 'user' | 'syncing' | 'anon';

export const cardAccount = (mode: 'server' | 'local' | 'buffer'): CardAccount =>
  mode === 'server' ? 'user' : mode === 'buffer' ? 'syncing' : 'anon';
