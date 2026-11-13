# Judging criteria → features

| Criterion | How Shardline meets it | Where |
|---|---|---|
| Delightful UX | One gesture to learn (drag a line); animated hint on first view; the shape physically splits apart with per-piece percentages; one-word verdicts | `src/client/game.tsx`, `draw.ts`; video 0:05-0:30 |
| Polish | Fits the viewport on mobile and desktop; distinct paper-and-blade visual identity; no clutter during play; server-verified scores; unit-tested geometry | `src/shared/geometry.test.ts`; video 0:30-0:45 |
| Reddit-y | Same puzzle for the whole community each day; histogram of how everyone cut; daily top 5; opt-in "Share to comments" fills each day's thread; mods get a menu action | `src/server/routes/api.ts`; video 0:40-0:50 |
| Daily Content | New procedurally generated shape every day in 3 families and a weekly difficulty rhythm; scheduler posts it at 00:05 UTC; streaks; archive posts stay playable | `devvit.json` scheduler; `geometry.ts` |
| Stand-out list: Journeys | App.Ready, Journey.Start/Progress/End with score | `src/server/routes/journey.ts` |
