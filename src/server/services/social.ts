// Comment as the player and subscribe (build spec §8.1). Comments post with runAs: 'USER' only after
// the client's confirm step; a plain score comment replies to the pinned results comment.
import { reddit } from '@devvit/web/server';
import { isRecord } from '../../shared/api';
import { cleanMessage, commentText } from '../../shared/result';
import {
  clearCommented,
  clearSticky,
  getCommented,
  getDayForPost,
  getProgress,
  getPuzzle,
  getStats,
  setCommented,
  setCommentedNX,
  setSubscribed,
} from '../store';
import { ensureSticky, type Poster } from './daily';
import { buildResult } from './play';

export type Commenter = { reply(parentId: string, text: string): Promise<string> };

const isThingId = (id: string): id is `t1_${string}` | `t3_${string}` =>
  id.startsWith('t1_') || id.startsWith('t3_');

export const redditCommenter: Commenter = {
  reply: async (parentId, text) => {
    if (!isThingId(parentId)) throw new Error(`not a comment or post id: ${parentId}`);
    const c = await reddit.submitComment({ id: parentId, text, runAs: 'USER' });
    return c.id;
  },
};

export type CommentOutcome =
  | { kind: 'ok'; commentId: string }
  | { kind: 'already'; commentId: string }
  | { kind: 'notDone' }
  | { kind: 'notfound' };

/** Errors that mean the parent comment is gone (deleted by a mod), so a new sticky is needed. */
const isMissingParent = (e: unknown): boolean =>
  /not.?found|404|deleted|does ?n[o']t exist/i.test(e instanceof Error ? e.message : String(e));

export const postComment = async (
  postId: string,
  userId: string,
  body: unknown,
  deps: { commenter: Commenter; poster: Poster }
): Promise<CommentOutcome> => {
  const day = await getDayForPost(postId);
  const puzzle = day === null ? null : await getPuzzle(day);
  if (day === null || !puzzle) return { kind: 'notfound' };
  const progress = await getProgress(day, userId);
  if (!progress?.done) return { kind: 'notDone' };

  const message = cleanMessage(isRecord(body) ? body.message : undefined);
  // Claim before posting so a double click or a retry can never post twice.
  if (!(await setCommentedNX(day, userId, 'pending'))) {
    return { kind: 'already', commentId: (await getCommented(day, userId)) ?? 'pending' };
  }
  try {
    const text = commentText(day, buildResult(progress, puzzle, null, await getStats(day)), message);
    let commentId: string;
    if (message) {
      commentId = await deps.commenter.reply(postId, text);
    } else {
      const parent = await ensureSticky(postId, deps.poster);
      try {
        commentId = await deps.commenter.reply(parent, text);
      } catch (e) {
        if (!isMissingParent(e)) throw e;
        // The pinned comment was removed: recreate it once and retry, never fall back to top level.
        await clearSticky(postId);
        commentId = await deps.commenter.reply(await ensureSticky(postId, deps.poster), text);
      }
    }
    await setCommented(day, userId, commentId);
    return { kind: 'ok', commentId };
  } catch (e) {
    await clearCommented(day, userId);
    throw e;
  }
};

export const subscribe = async (
  userId: string,
  deps: { subscribeToCurrentSubreddit: () => Promise<void> }
): Promise<void> => {
  await deps.subscribeToCurrentSubreddit();
  await setSubscribed(userId);
};
