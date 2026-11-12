/** e.g. 'New puzzle in 5h 12m', 'New puzzle in 12m', 'New puzzle in under a minute'. */
export const formatCountdown = (ms: number): string => {
  if (ms < 60e3) return 'New puzzle in under a minute';
  const h = Math.floor(ms / 3600e3);
  const m = Math.floor((ms % 3600e3) / 60e3);
  return h > 0 ? `New puzzle in ${h}h ${m}m` : `New puzzle in ${m}m`;
};
