# PocketBull handoff

Read this first in any new session. Last updated 7 Oct 2026.

## What PocketBull is

A private research tool for 4–5 friends investing in Indian equities: insights from concall transcripts and investor presentations, plus a tracker that checks each management promise (guidance) against reported numbers from Screener. Admin: Anushka. Not public, not investment advice.

- PRD (living doc): https://claude.ai/code/artifact/c8184776-fc81-4f86-add5-7f520cc97cce
- Mocks (6 screens): https://claude.ai/artifact/2dMTmCxzxcSgZXMyHv5wmG
- Repo: https://github.com/goeladityax24/pocketbull

## Decisions taken

- **No API bill.** Analyses run in a Claude session on the Admin's own plan (see `docs/ANALYSIS_PLAYBOOK.md`). Members request; the Admin is notified through a GitHub issue labelled `analysis-request`. The paid API path (`npm run analyze`) stays in the code for later.
- **Run once per concall.** Saved runs live in `data/runs/<SYMBOL>/<YYYY-MM>.json`, committed to the repo. Opening saved results is free.
- **No sign-in for now (4 Oct).** Anyone with the link views read-only. One Admin edits (tags with a reason, promise corrections, notes, links, settings) after entering `ADMIN_KEY` once on `/admin` (httpOnly cookie). Notes are Admin-only. The server reads and writes Supabase with the secret key; visitors never get a key. Roles (Editor/Viewer) and Google sign-in come back later; `0001_init.sql` still has the RLS draft for them.
- **Requests:** only the Admin adds companies. The home page is a search over saved companies (partial match on name or NSE symbol); the request button shows only when nothing matches (6 Oct). Anyone can then request by typing their name; it lands in the Admin console queue (and opens a GitHub issue if `GITHUB_TOKEN` is set). Per-person monthly limits are off until sign-in returns; at most 20 open requests.
- **Tags:** Met = inside the range, or within ±3% of a single-number target (shown as a tooltip). Above = Exceeded, below = Missed. Whole-number Screener values get ±0.5 rounding slack.
- **Expected numbers:** growth guidance: same period last year × (1 + guided growth). An annual ₹ target is split by season, never evenly: each quarter (or half, for half-yearly reporters) gets the share it had of last year's total (Skygold: Q2 FY26 was 23.6% of FY26, so Q2 FY27 = 23.6% × ₹8,100 Cr). EBITDA/PAT with no guidance get an estimate (expected revenue × last 4 quarters' margin), labelled and never scored.
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

## What is built (milestone 2: the web app, branch `milestone-2-web-app`)

- Next.js 16 app in `src/app/`: Companies (list, request form, queue), company Overview, Insight report, Guidance tracker (next results checklist, by quarter / by year, checked-by-hand list, tag changes, promise edits), Research space, Admin (unlock, queue, tolerance setting, recent changes with revert).
- `src/lib/app/`: data access (`repo.ts`, Supabase or demo mode on `data/` files when no keys), tracker view (`view.ts`, tested), admin check (`auth.ts`), server actions in `src/app/actions.ts`.
- Data flow: repo files are the source of truth. `npm run snapshot` saves Screener numbers to `data/snapshots/`; `npm run sync-db` copies snapshots and runs into Supabase (runs already there are left alone, so edits and tags survive).
- Supabase project `tacqwjzpuigclgferpye` (Mumbai) has `0001_init.sql`, `0002_app.sql` and `0003_research_notes.sql` applied.
- Companies (26): SKYGOLD, TARIL, SENORES, KPL, ZENTEC, AIMTRON, PRIZOR (presentations and conference notes, no calls), CPPLUS, ACUTAAS, AEROFLEX, EBGNG, STLTECH (plus its Sep 2026 'Lakshya' investor meet), HFCL, NETWEB and E2E (both standalone basis). Added 6 Oct: KRN, QPOWER, SANSERA, YASHO, SHANTIGOLD, SOTL (presentations only, no calls held), AFCOM, LTELEVATOR, SHREEREF, SUSAN and VIVIDEL (one presentation only so far; no calls held). SANSERA, YASHO, SHANTIGOLD, SOTL, AFCOM, SUSAN and VIVIDEL are standalone basis. Each has its analysed calls or presentations and a six-section insight report in `data/notes/`.
- BSE SME companies that Screener knows only by BSE code (AFCOM 544224, LTELEVATOR 544518, SHREEREF 544458, SUSAN 544793) use their BSE symbol in `data/`; snapshot them with `npm run snapshot -- AFCOM --page tmp/AFCOM.html --url https://www.screener.in/company/544224/` so the Screener link keeps working.
- Conference compendia (playbook section 8): broker PDFs with notes on many companies live in `data/conferences/<id>/`. First one: Arihant Bharat Connect Rising Stars, Sep 2026 (322 companies). **Check every company against them** with `npm run conference-notes -- <SYMBOL>`. From that compendium, HFCL and SHREEREF have broker-note runs (`data/runs/<SYMBOL>/2026-09-arihant-bharat-connect.json`); QPOWER, SHANTIGOLD and SKYGOLD are only mentioned.
- Env vars: see `.env.example`. Local values in `.env.local` (git-ignored); the same in Vercel (Production and Preview).
- Local preview: `.claude/launch.json` has `web` (as a visitor) and `web-admin` (port 3001, Admin without a key).

## Next steps

1. Merge the milestone 2 pull request; check the live site on Vercel (unlock `/admin` with `ADMIN_KEY`).
2. Optional: add `GITHUB_TOKEN` (fine-grained, Issues read/write on the repo) in Vercel so requests open GitHub issues.
3. Keep Supabase awake: free projects pause after a week idle. Add a scheduled GitHub Action that reads one row every few days.
4. Keep adding companies the group follows; refresh insight reports after each annual report.
5. Later: Google sign-in and Editor/Viewer roles, peer view, technical scans, US markets.

## Status (4 Oct 2026)

- Milestone 1 merged into `main`. Milestone 2 on branch `milestone-2-web-app`.
- GitHub label `analysis-request` created.
- Local folder: `~/Downloads/pocketbull-milestone-1` (consider moving it to a permanent place such as `~/Projects/pocketbull`; git does not mind).
