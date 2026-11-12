// Inline confirm step before a score comment (build spec §8.1): shows the exact text and who posts it.
import { useState } from 'react';
import type { Result } from '../../shared/api';
import { MESSAGE_MAX, cleanMessage, commentText } from '../../shared/result';

export type CommentConfirmProps = {
  day: number;
  result: Result;
  username: string | null;
  onPost(message: string | null): Promise<boolean>;
  onCancel(): void;
};

export const CommentConfirm = ({ day, result, username, onPost, onCancel }: CommentConfirmProps) => {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const clean = cleanMessage(message);
  const post = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onPost(clean);
    if (!ok) setBusy(false);
  };
  return (
    <div className="confirm" role="group" aria-label="Comment my result">
      <pre className="preview">{commentText(day, result, clean)}</pre>
      <textarea
        aria-label="Add a message (optional)"
        placeholder="Add a message (optional)"
        rows={2}
        maxLength={MESSAGE_MAX}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <p className="as">This will be posted as u/{username ?? 'you'}</p>
      <div className="acts">
        <button type="button" className="fill" onClick={() => void post()} disabled={busy}>
          Post
        </button>
        <button type="button" className="quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
};
