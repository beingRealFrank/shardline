import { Hono } from 'hono';
import type { TaskResponse } from '@devvit/web/server';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { createDailyPost } from '../core/post';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    await c.req.json<OnAppInstallRequest>();
    const post = await createDailyPost();
    return c.json<TriggerResponse>({ status: 'success', message: `Daily post ${post.id}` }, 200);
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<TriggerResponse>({ status: 'error', message: 'Failed to create post' }, 400);
  }
});

export const scheduler = new Hono();

// Runs at 00:05 UTC: one fresh puzzle post per day.
scheduler.post('/daily-post', async (c) => {
  try {
    const post = await createDailyPost();
    console.log(`daily post ${post.id} created=${post.created}`);
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  } catch (error) {
    console.error(`daily post failed: ${error}`);
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  }
});
