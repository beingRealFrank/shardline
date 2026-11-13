import { context, redis, reddit } from '@devvit/web/server';
import { dayNumber, puzzleForDay } from '../../shared/geometry';

export const postTitle = (day: number): string => {
  const p = puzzleForDay(day);
  return `Shardline #${day}: cut the ${p.name} into ${p.pieces} equal pieces with ${p.cuts} cut${p.cuts > 1 ? 's' : ''}`;
};

// Creates the post for `day` unless one already exists in this subreddit.
export const createDailyPost = async (day = dayNumber(Date.now()), force = false) => {
  const existing = await redis.get(`daily:${day}:post`);
  if (existing && !force) return { id: existing, created: false };
  const post = await reddit.submitCustomPost({
    subredditName: context.subredditName,
    title: postTitle(day),
    entry: 'default',
    postData: { day },
  });
  await redis.set(`daily:${day}:post`, post.id);
  await redis.set(`post:${post.id}:day`, String(day));
  return { id: post.id, created: true };
};

export const dayForPost = async (postId: string): Promise<number> => {
  const stored = await redis.get(`post:${postId}:day`);
  if (stored) return Number(stored);
  const fromData = context.postData?.day;
  if (typeof fromData === 'number') return fromData;
  return dayNumber(Date.now());
};
