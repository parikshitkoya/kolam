// The one result card (build spec §7.5). Replaces the ledge on completion.
import { useEffect, useState } from 'react';
import type { Result } from '../../shared/api';
import { msUntilNextDay } from '../../shared/day';
import { communityLine, trailText, verdictText } from '../../shared/result';
import { CommentConfirm } from './CommentConfirm';
import { formatCountdown } from './countdown';

export type ResultCardProps = {
  day: number;
  result: Result;
  loggedIn: boolean;
  /** Logged in but offline: taps not saved yet, so no comment, join or login buttons. */
  syncing?: boolean;
  username: string | null;
  subredditName: string;
  subscribed: boolean;
  commented: boolean;
  onComment(message: string | null): Promise<boolean>;
  onSubscribe(): Promise<boolean>;
  onLogin(): void;
};

const useNow = (everyMs: number) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
};

export const ResultCard = (p: ResultCardProps) => {
  const [confirming, setConfirming] = useState(false);
  const [joining, setJoining] = useState(false);
  const now = useNow(30000);
  const community = communityLine(p.result.stats);
  const streak = p.loggedIn ? p.result.streak : null;

  const join = async () => {
    if (joining) return;
    setJoining(true);
    await p.onSubscribe();
    setJoining(false);
  };

  return (
    <section className="ledge result">
      <div className="said">
        <h2>One unbroken line</h2>
        <p>
          {verdictText(p.result.taps, p.result.par, p.result.hints)}
          <br />
          <span className="trail">{trailText(p.result.trail)}</span>
        </p>
        {(community || streak) && (
          <p>
            {community}
            {community && streak ? ' ' : ''}
            {streak ? `Streak ${streak.current}` : ''}
          </p>
        )}
      </div>
      {p.syncing ? (
        <p className="done-note">Saved when you're back online.</p>
      ) : confirming ? (
        <CommentConfirm
          day={p.day}
          result={p.result}
          username={p.username}
          onPost={async (m) => {
            const ok = await p.onComment(m);
            if (ok) setConfirming(false);
            return ok;
          }}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <div className="acts">
          {p.loggedIn &&
            (p.commented ? (
              <span className="done-note">Commented</span>
            ) : (
              <button type="button" className="fill" onClick={() => setConfirming(true)}>
                Comment my result
              </button>
            ))}
          {p.loggedIn && !p.subscribed && p.subredditName && (
            <button type="button" onClick={() => void join()} disabled={joining}>
              Join r/{p.subredditName}
            </button>
          )}
          {!p.loggedIn && (
            <button type="button" className="fill" onClick={p.onLogin}>
              Log in to keep a streak
            </button>
          )}
        </div>
      )}
      <p className="countdown">{formatCountdown(msUntilNextDay(now))}</p>
    </section>
  );
};
