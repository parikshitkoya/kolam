# Kolam

A daily puzzle for Reddit. A kolam is a line pattern drawn around a grid of dots at the doorstep each morning. Each day's board starts as a tangle of separate loops; tap between two dots to cross or part the lines there, and turn the tangle into **one unbroken line**. Every tap repeats at the board's symmetric positions, and every tap counts against par.

Built with Devvit Web (React, Hono, TypeScript) for Reddit's Daily Games Hackathon 2026.

## How it works

- One puzzle per UTC day, the same for everyone. Kolam No. 1 is Monday 23 November 2026.
- A scheduled job (00:00 UTC) generates puzzles a week ahead, stores them, and posts the day's puzzle with a pinned results comment. Moderators can run it by hand with the subreddit menu item **Post today's Kolam**.
- Difficulty follows the week: Monday is gentle, Saturday needs a "sideways" tap, Sunday is the big board.
- No puzzle is ever issued twice, including rotated or mirrored copies.
- Completion is decided on the server by replaying the player's taps. The solver never ships to the browser.

## What it stores

Per subreddit installation, in Devvit Redis:

- the puzzles, their signatures, and the day-to-post mapping;
- per player and day: the ordered list of taps, hints used, and whether they finished (keyed by Reddit user id);
- per player: current and best streak;
- per day: counts of players, solvers, and taps over par.

Logged-out players' progress stays in their browser only. No other personal data is stored.

## Development

- `npm test`: unit and service tests (Vitest, `@devvit/test`)
- `npm run test:types`, `npm run lint`, `npm run build`
- `npm run dev`: playtest on Reddit
- `npm run deploy`: type-check, lint, upload. Do not run `npm run launch`.

## Status (M1)

- Done: game core and generator (reference test vectors pass), daily job with idempotent posting, `/api/state` and `/api/tap` with server replay, stats and streaks, game screen with optimistic taps and ordered sync, logged-out local play, inline splash.
- Not yet checked on Reddit: playtest in the dev subreddit, viewport checks at 360×640, 390×844 and 1280×800, keyboard play, mobile web and the iOS and Android apps.
- Next (M2): result card, comment and subscribe buttons, hints, login prompt, accessibility pass, Journeys events.
