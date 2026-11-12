// Score ledge: loop count, taps, par, saving mark. M1 completion state (M2 replaces it with the result card).
export type LedgeProps = {
  loops: number;
  taps: number;
  par: number;
  saving: boolean;
  done: boolean;
  /** Shown only when given (logged-in players). */
  onHint?: () => void;
  hintBusy?: boolean;
};

export const Ledge = ({ loops, taps, par, saving, done, onHint, hintBusy }: LedgeProps) => (
  <section className="ledge">
    {done ? (
      <div className="result">
        <div>
          <h2>One unbroken line</h2>
          <p>
            {taps} taps, par {par}.{saving ? ' Saving…' : ''}
          </p>
        </div>
      </div>
    ) : (
      <div className="score">
        <div className="count">
          <span className="big">{loops}</span>
          <span className="unit">
            <b>{loops === 1 ? 'line' : 'lines'}</b>make it one
          </span>
        </div>
        <dl className="meta">
          <div>
            <dt>Taps</dt>
            <dd>{taps}</dd>
          </div>
          <div>
            <dt>Par</dt>
            <dd>{par}</dd>
          </div>
        </dl>
        <span className="saving" aria-hidden={!saving}>
          {saving ? 'saving…' : ''}
        </span>
        {onHint && (
          <button type="button" onClick={onHint} disabled={hintBusy}>
            Hint
          </button>
        )}
      </div>
    )}
  </section>
);
