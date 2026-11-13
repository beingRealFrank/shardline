import type { Cut, Puzzle } from './geometry';

export type PlayerResult = {
  score: number;
  cuts: Cut[];
  rank: number; // 1 = best
  players: number;
  beat: number; // % of other players with a lower score
};

export type Streak = { current: number; best: number };

export type DayStats = {
  players: number;
  average: number;
  hist: number[];
  top: { name: string; score: number }[];
};

export type InitResponse = {
  type: 'init';
  postId: string;
  username: string | null;
  puzzle: Puzzle;
  today: number;
  result: PlayerResult | null;
  stats: DayStats;
  streak: Streak;
};

export type SubmitRequest = { cuts: Cut[] };

export type SubmitResponse = {
  type: 'submit';
  result: PlayerResult;
  stats: DayStats;
  streak: Streak;
  saved: boolean;
};

export type ShareResponse = { type: 'share'; ok: boolean; message: string };

export type ErrorResponse = { status: 'error'; message: string };
