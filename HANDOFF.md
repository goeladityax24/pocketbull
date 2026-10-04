# PocketBull handoff

Read this first in any new session. Last updated 4 Oct 2026.

## What PocketBull is

A private research tool for 4–5 friends investing in Indian equities: insights from concall transcripts and investor presentations, plus a tracker that checks each management promise (guidance) against reported numbers from Screener. Admin: Anushka. Not public, not investment advice.

- PRD (living doc): https://claude.ai/code/artifact/c8184776-fc81-4f86-add5-7f520cc97cce
- Mocks (6 screens): https://claude.ai/artifact/2dMTmCxzxcSgZXMyHv5wmG
- Repo: https://github.com/goeladityax24/pocketbull

## Decisions taken

- **No API bill.** Analyses run in a Claude session on the Admin's own plan (see `docs/ANALYSIS_PLAYBOOK.md`). Members request; the Admin is notified through a GitHub issue labelled `analysis-request`. The paid API path (`npm run analyze`) stays in the code for later.
- **Run once per concall.** Saved runs live in `data/runs/<SYMBOL>/<YYYY-MM>.json`, committed to the repo. Opening saved results is free.
- **Limit:** 5 requests per member per month; the Admin can change it per user.
- **Roles:** Admin, Editor, Viewer. Editors and Admins edit guidance and write notes (notes hidden from Viewers). Only Editors and Admins add links. Anyone can change a tag, with a reason; the Admin can revert.
- **Tags:** Met = inside the range, or within ±3% of a single-number target (shown as a tooltip). Above = Exceeded, below = Missed. Whole-number Screener values get ±0.5 rounding slack.
- **Expected numbers:** same period last year × (1 + guided growth). An annual ₹ target (e.g. ₹8,100 Cr for FY27) becomes the growth it implies over last year, so every quarter gets an expected number.
- **Basis:** consolidated by default, standalone when a company has no consolidated numbers. SME companies report half-yearly; the tracker then works in halves.
- **Data source:** Screener, read on demand at low volume. Cloud sessions are blocked from Screener and BSE/NSE; read them through the browser on the Admin's Mac.
- **Free hosting plan (milestone 2):** Supabase free (database, Google sign-in; pauses after a week idle) and Vercel free.
- **Later:** peer view (curated peers), technical scans (below 50-DMA etc.), US markets.

## What is built (milestone 1: the pipeline)

- `src/lib/pipeline/`: Screener parser, PDF text and quote check, extraction rules and schema, expected numbers and scoring, run store, text report.
- `npm run import-run`: saves an analysis written by a Claude session, after format and quote checks.
- `npm run analyze`: the same with the paid API (needs `ANTHROPIC_API_KEY`).
- `supabase/migrations/0001_init.sql`: database draft with row-level security for the three roles.
- Tested on Skygold with real data: Screener page, May and Aug 2026 concalls, 31 quotes verified word for word. 31 tests (`npm test`).

## How to start a new session

Use the Claude desktop app › **Code** tab › **Local**, and open this repo folder. A local session runs on the Admin's Mac, so it:
- loads this file automatically (through `CLAUDE.md`),
- can reach Screener and BSE/NSE (cloud sessions are blocked from them),
- pushes with the Mac's GitHub login (`gh auth login` is done).

First message to send: "Read HANDOFF.md and continue with the next step."

Cloud sessions (claude.ai/code) also work for coding once the Claude GitHub App is installed on the repo, but they cannot read Screener or BSE/NSE, so run analyses locally.

## Next steps

1. Merge `milestone-1-pipeline` into `main` (pull request on GitHub).
2. Milestone 2: the web app. Google sign-in, roles, company page, tracker (quarter and year views, expected numbers), research space, admin console, "Request analysis" button that opens a GitHub issue. Host free on Vercel + Supabase.
3. Analyse 10 companies the group follows, to tune the format and check accuracy.

## Status (4 Oct 2026)

- Branch `milestone-1-pipeline` pushed to GitHub from the Admin's Mac.
- GitHub label `analysis-request` created.
- Local folder: `~/Downloads/pocketbull-milestone-1` (consider moving it to a permanent place such as `~/Projects/pocketbull`; git does not mind).
