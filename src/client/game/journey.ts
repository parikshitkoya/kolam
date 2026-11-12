// Devvit Journeys (build spec §8.2). Every call is fire-and-forget: never awaited by gameplay,
// catches everything (including a client that throws synchronously), never sends personal data.

/** The slice of `@devvit/analytics/client/reddit`'s TelemetryClient that Kolam uses. */
export type JourneyTelemetry = {
  appReady(): unknown;
  startJourney(): unknown;
  progress(input: { progress: number }): unknown;
  interaction(input: { action: string }): unknown;
  endJourney(input: { complete: boolean; game: { win: boolean; score: number } }): unknown;
};

const noop = () => undefined;

/** Runs f once `after` settles; any throw or rejection is swallowed. */
const fire = (after: Promise<unknown>, f: () => unknown): Promise<unknown> => after.then(f).catch(noop);

export const createJourney = (t: JourneyTelemetry) => {
  let readySent = false;
  let started: Promise<unknown> | null = null;
  let best = Infinity;
  let ended = false;
  const now = Promise.resolve();

  return {
    ready(): void {
      if (readySent) return;
      readySent = true;
      void fire(now, () => t.appReady());
    },
    /** Call after the local toggle of every tap. */
    tap(loops: number, startLoops: number): void {
      if (!started) {
        started = fire(now, () => t.startJourney());
        best = startLoops;
      }
      if (loops < best) {
        best = loops;
        if (startLoops > 1) {
          const progress = 1 - (loops - 1) / (startLoops - 1);
          void fire(started, () => t.progress({ progress }));
        }
      }
    },
    hint(): void {
      void fire(started ?? now, () => t.interaction({ action: 'hint' }));
    },
    /** Only after a journey started this session, and only once. */
    finish(taps: number, par: number): void {
      if (!started || ended) return;
      ended = true;
      const score = Math.max(0, 100 - 10 * (taps - par));
      void fire(started, () => t.endJourney({ complete: true, game: { win: true, score } }));
    },
  };
};
