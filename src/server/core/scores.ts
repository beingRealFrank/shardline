import { redis } from '@devvit/web/server';
import type { DayStats, PlayerResult, Streak } from '../../shared/api';
import { HIST_BUCKETS, bucketOf, type Cut } from '../../shared/geometry';

const k = {
  scores: (d: number) => `day:${d}:scores`,
  hist: (d: number) => `day:${d}:hist`,
  sum: (d: number) => `day:${d}:sum`,
  play: (d: number, u: string) => `day:${d}:play:${u}`,
  streak: (u: string) => `user:${u}:streak`,
};

export const getStats = async (day: number): Promise<DayStats> => {
  const [players, hist, sum, top] = await Promise.all([
    redis.zCard(k.scores(day)),
    redis.hGetAll(k.hist(day)),
    redis.get(k.sum(day)),
    redis.zRange(k.scores(day), 0, 9, { by: 'rank', reverse: true }),
  ]);
  const buckets = Array.from({ length: HIST_BUCKETS }, (_, i) => Number(hist[String(i)] ?? 0));
  return {
    players,
    average: players ? Math.round((Number(sum ?? 0) / 10 / players) * 10) / 10 : 0,
    hist: buckets,
    top: top.map((m) => ({ name: m.member, score: m.score })),
  };
};

export const getResult = async (day: number, user: string): Promise<PlayerResult | null> => {
  const raw = await redis.get(k.play(day, user));
  if (!raw) return null;
  const { score, cuts } = JSON.parse(raw) as { score: number; cuts: Cut[] };
  return { score, cuts, ...(await standing(day, user)) };
};

const standing = async (day: number, user: string) => {
  const [players, ascRank] = await Promise.all([
    redis.zCard(k.scores(day)),
    redis.zRank(k.scores(day), user),
  ]);
  const below = ascRank ?? 0;
  return {
    players,
    rank: players - below,
    beat: players > 1 ? Math.round((below / (players - 1)) * 100) : 100,
  };
};

// Records the first attempt only; later calls return the stored result.
export const recordPlay = async (
  day: number,
  user: string,
  score: number,
  cuts: Cut[]
): Promise<{ result: PlayerResult; fresh: boolean }> => {
  const existing = await getResult(day, user);
  if (existing) return { result: existing, fresh: false };
  await redis.set(k.play(day, user), JSON.stringify({ score, cuts, at: Date.now() }));
  await redis.zAdd(k.scores(day), { member: user, score });
  await redis.hIncrBy(k.hist(day), String(bucketOf(score)), 1);
  await redis.incrBy(k.sum(day), Math.round(score * 10));
  return { result: { score, cuts, ...(await standing(day, user)) }, fresh: true };
};

export const getStreak = async (user: string, today: number): Promise<Streak> => {
  const s = await redis.hGetAll(k.streak(user));
  const last = Number(s.last ?? 0);
  const current = last >= today - 1 ? Number(s.current ?? 0) : 0;
  return { current, best: Number(s.best ?? 0) };
};

export const bumpStreak = async (user: string, today: number): Promise<Streak> => {
  const s = await redis.hGetAll(k.streak(user));
  const last = Number(s.last ?? 0);
  if (last === today) return { current: Number(s.current ?? 1), best: Number(s.best ?? 1) };
  const current = last === today - 1 ? Number(s.current ?? 0) + 1 : 1;
  const best = Math.max(current, Number(s.best ?? 0));
  await redis.hSet(k.streak(user), { last: String(today), current: String(current), best: String(best) });
  return { current, best };
};
