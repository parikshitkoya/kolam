/** What the live region says after a tap. Never the tap count. */
export const announceText = (loops: number, done: boolean): string =>
  loops === 1 ? (done ? '1 loop. Solved.' : '1 loop') : `${loops} loops`;
