// Reddit side of the daily job: the puzzle post and the app's pinned results comment.
import { reddit } from '@devvit/web/server';
import { dateLabel } from '../../shared/day';
import type { Poster } from './daily';

const isPostId = (id: string): id is `t3_${string}` => id.startsWith('t3_');

export const redditPoster: Poster = {
  submitPost: async (p, data) => {
    const post = await reddit.submitCustomPost({
      title: `Kolam No. ${p.day} · ${dateLabel(p.day)}`,
      entry: 'default',
      postData: data,
      textFallback: {
        text: `Kolam No. ${p.day}. Join every loop into one unbroken line. Par ${p.par}.`,
      },
    });
    return post.id;
  },
  submitSticky: async (postId) => {
    if (!isPostId(postId)) throw new Error(`not a post id: ${postId}`);
    const comment = await reddit.submitComment({
      id: postId,
      text: 'Results thread. Share your trail here.',
      runAs: 'APP',
    });
    await comment.distinguish(true);
    return comment.id;
  },
};
