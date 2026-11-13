import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type { ErrorResponse, InitResponse, ShareResponse, SubmitRequest, SubmitResponse } from '../../shared/api';
import { cutShape, dayNumber, puzzleForDay, validCut } from '../../shared/geometry';
import { dayForPost } from '../core/post';
import { endJourney } from './journey';
import { bumpStreak, getResult, getStats, getStreak, recordPlay } from '../core/scores';

export const api = new Hono();

const err = (message: string) => ({ status: 'error', message }) satisfies ErrorResponse;

api.get('/init', async (c) => {
  const { postId } = context;
  if (!postId) return c.json(err('postId missing'), 400);
  const today = dayNumber(Date.now());
  const day = await dayForPost(postId);
  const username = (await reddit.getCurrentUsername()) ?? null;
  const [result, stats, streak] = await Promise.all([
    username ? getResult(day, username) : Promise.resolve(null),
    getStats(day),
    username ? getStreak(username, today) : Promise.resolve({ current: 0, best: 0 }),
  ]);
  return c.json<InitResponse>({ type: 'init', postId, username, puzzle: puzzleForDay(day), today, result, stats, streak });
});

api.post('/submit', async (c) => {
  const { postId } = context;
  if (!postId) return c.json(err('postId missing'), 400);
  const body = await c.req.json<SubmitRequest>();
  const day = await dayForPost(postId);
  const puzzle = puzzleForDay(day);
  const cuts = Array.isArray(body.cuts) ? body.cuts.slice(0, puzzle.cuts) : [];
  if (cuts.length !== puzzle.cuts || !cuts.every(validCut)) return c.json(err('Place every cut first'), 400);
  const { score } = cutShape(puzzle, cuts);
  const username = await reddit.getCurrentUsername();
  const today = dayNumber(Date.now());
  if (!username) {
    // Logged-out players still see their score; it just is not ranked.
    const stats = await getStats(day);
    return c.json<SubmitResponse>({
      type: 'submit',
      result: { score, cuts, rank: 0, players: stats.players, beat: 0 },
      stats,
      streak: { current: 0, best: 0 },
      saved: false,
    });
  }
  const { result, fresh } = await recordPlay(day, username, score, cuts);
  if (fresh) await endJourney(c.req.header('x-devvit-journey-id') ?? '', score);
  const streak = day === today ? await bumpStreak(username, today) : await getStreak(username, today);
  return c.json<SubmitResponse>({ type: 'submit', result, stats: await getStats(day), streak, saved: true });
});

// Posts the player's result as a comment, from their account, only when they tap Share.
api.post('/share', async (c) => {
  const { postId } = context;
  const username = await reddit.getCurrentUsername();
  if (!postId || !username) return c.json<ShareResponse>({ type: 'share', ok: false, message: 'Log in to share' });
  const day = await dayForPost(postId);
  const result = await getResult(day, username);
  if (!result) return c.json<ShareResponse>({ type: 'share', ok: false, message: 'Play first' });
  const p = puzzleForDay(day);
  const bar = (n: number) => '▰'.repeat(Math.round(n / 10)) + '▱'.repeat(10 - Math.round(n / 10));
  const text = `Shardline #${day} · ${p.pieces} pieces / ${p.cuts} cut${p.cuts > 1 ? 's' : ''}\n\n${bar(result.score)} **${result.score.toFixed(1)}%**  ·  #${result.rank} of ${result.players}`;
  try {
    await reddit.submitComment({ id: postId, text, runAs: 'USER' });
    return c.json<ShareResponse>({ type: 'share', ok: true, message: 'Result posted' });
  } catch (e) {
    console.error('share failed', e);
    return c.json<ShareResponse>({ type: 'share', ok: false, message: 'Could not post comment' });
  }
});
