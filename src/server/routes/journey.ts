import { Hono } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';

// Devvit Journeys: App.Ready on load, Journey.Start on the first committed cut,
// Journey.Progress per placed cut, Journey.End (with score) on submit.
// Events are dropped by the platform until the app is allowlisted, so all calls are best-effort.
export const journey = new Hono();

const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
  try {
    return await fn();
  } catch (e) {
    console.log('journey event skipped', String(e));
    return null;
  }
};

journey.post('/ready', async (c) => {
  await safe(() => telemetry.appReady());
  return c.json({ ok: true });
});

journey.post('/start', async (c) => {
  const r = await safe(() => telemetry.startJourney());
  return c.json({ journeyId: r?.journeyId ?? '' });
});

journey.post('/progress', async (c) => {
  const journeyId = c.req.header('x-devvit-journey-id') ?? '';
  const { progress, action } = await c.req.json<{ progress: number; action: string }>();
  if (journeyId) await safe(() => telemetry.journeyProgress({ journeyId, progress, action }));
  return c.json({ ok: true });
});

export const endJourney = async (journeyId: string, score: number) => {
  if (!journeyId) return;
  await safe(() => telemetry.endJourney({ journeyId, complete: true, game: { win: score >= 90, score } }));
};
