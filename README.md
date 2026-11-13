# Shardline

**One shape a day. A few straight cuts. Make every piece the same size, by eye.**

Shardline is a daily game for Reddit, built on Devvit Web as an interactive post.
Every day at 00:05 UTC the app posts a new shape to the subreddit, for example
*"Shardline #12: cut the Paper Harbor into 3 equal pieces with 2 cuts."*
Everyone in the community gets the same shape and the same challenge, and one shot at it.

## How to play

1. Open today's Shardline post and tap **Pick up the blade**.
2. **Drag a straight line** across the shape. Each cut runs through the whole shape, like a knife.
3. Place the number of cuts the day asks for. Drag a red handle to tilt a cut, or drag the
   middle of a cut to slide it. **Undo** removes the last cut.
4. Press **Cut!** The shape splits apart and each piece shows its share of the area.
5. Your score is your accuracy: 100% means every piece is exactly the same size.
   Extra slivers (from cutting through a concave edge) count against you.

No rulers, no live numbers: you judge the areas with your eyes. You get one attempt per day.

## Daily loop

- **One shared puzzle per day**, generated from the date, in three shape families
  (sharp shards, lobed blobs, and shapes with deep bites taken out) so the week does not
  feel the same twice.
- **A weekly rhythm of difficulty:** Monday is a warm-up (halve it with 1 cut), mid-week
  asks for 3 or 4 pieces, and the weekend asks for 5 or 6 pieces from 3 cuts.
- **Results card:** your accuracy and a one-word verdict, your rank among today's cutters,
  a histogram of how the whole community cut, the day's top 5, your streak, and a
  countdown to the next shape.
- **Share to comments:** one tap posts your result (score bar, rank) as a comment from your
  account, so each day's thread fills with everyone's cuts. Nothing is ever posted without
  that tap.
- Older posts stay playable, and each keeps its own leaderboard.

## For moderators

Install the app on a subreddit. It creates today's post on install and a new post every day
at 00:05 UTC. Moderators can also create today's post from the subreddit menu
(**Shardline: post today's puzzle**).

## How it is built

- **Devvit Web** interactive post: React 19 + Canvas client (`src/client`), Hono server
  (`src/server`), Redis for scores, histograms and streaks, the Devvit scheduler for the
  daily post, and user actions (`SUBMIT_COMMENT`) for opt-in result sharing.
- **Geometry** (`src/shared/geometry.ts`) is shared by client and server. Cutting is
  computed by rasterising the shape at 480 x 480 and labelling connected regions, which is
  robust for concave shapes. **The server recomputes every score from the submitted cuts**,
  so scores cannot be forged from the client.
- **Devvit Journeys** instrumentation: App.Ready on load, Journey.Start on the first cut,
  Journey.Progress per cut, Journey.End with the score.

```bash
npm install
npm run test:unit   # geometry and scoring tests
npm run dev         # devvit playtest
npm run deploy      # type-check, lint, devvit upload
```

## AI disclosure

The code, documentation and video for this project were produced by Claude Code AI agents.
The entrant chose and edited the concept, approved the scope and reviewed the submission.
See [AI_USE.md](AI_USE.md).

## License

MIT. See [LICENSE](LICENSE).
