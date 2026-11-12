// Ordered tap sync: one request in flight, retries with backoff, never blocks play (design §4).
import type { TapRequest, TapResponse } from '../../shared/api';

export type SendResult =
  | { ok: true; body: TapResponse }
  | { ok: false; status: number; taps?: number[]; message?: string };

export type TapQueueOptions = {
  send: (r: TapRequest) => Promise<SendResult>;
  sleep: (ms: number) => Promise<void>;
  onConflict: (taps: number[]) => void;
  onDone: () => void;
  onResult: (r: TapResponse) => void;
  onIdleChange: (idle: boolean) => void;
};

const BACKOFF = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export class TapQueue {
  private queue: TapRequest[] = [];
  private running = false;
  private readonly opts: TapQueueOptions;

  constructor(opts: TapQueueOptions) {
    this.opts = opts;
  }

  push(r: TapRequest): void {
    this.queue.push(r);
    if (!this.running) {
      this.running = true;
      this.opts.onIdleChange(false);
      void this.run();
    }
  }

  clear(): void {
    this.queue = [];
  }

  private async run(): Promise<void> {
    let attempt = 0;
    while (this.queue.length > 0) {
      const r = this.queue[0];
      if (!r) break;
      let res: SendResult;
      try {
        res = await this.opts.send(r);
      } catch {
        res = { ok: false, status: 0 };
      }
      if (this.queue[0] !== r) {
        // cleared (or replaced) while this request was in flight
        attempt = 0;
        continue;
      }
      if (res.ok) {
        this.queue.shift();
        attempt = 0;
        this.opts.onResult(res.body);
      } else if (res.status === 0 || res.status >= 500) {
        await this.opts.sleep(BACKOFF[Math.min(attempt, BACKOFF.length - 1)] ?? 30000);
        attempt++;
      } else if (res.status === 409) {
        this.queue = [];
        this.opts.onConflict(res.taps ?? []);
      } else if (res.status === 400 && res.message === 'done') {
        this.queue = [];
        this.opts.onDone();
      } else {
        this.queue.shift(); // any other 4xx: drop this request and continue
        attempt = 0;
      }
    }
    this.running = false;
    this.opts.onIdleChange(true);
  }
}
