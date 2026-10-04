# PocketBull

A private research tool for a small group investing in Indian equities. It reads a company's concall transcript and investor presentation, records management's guidance, and checks every promise against reported numbers from Screener.

**Status: milestone 1, the analysis pipeline.** It runs from the command line. The web app (Google sign-in, roles, tracker UI) is milestone 2.

## Setup

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm test                     # 22 offline tests, no API key needed
```

## Use

```bash
npm run analyze -- PARTH                    # analyse the latest concall, print report + tracker
npm run analyze -- https://www.screener.in/company/RELIANCE/consolidated/
npm run analyze -- PARTH --check            # free: is there a newer concall on Screener?
npm run analyze -- PARTH --month 2025-11    # analyse an older concall (builds history)
npm run analyze -- PARTH --force            # re-run AI on a saved concall
npm run analyze -- PARTH --json             # machine-readable output
```

Results are saved to `data/runs/<SYMBOL>/<YYYY-MM>.json`. **Each concall is analysed once**; later runs reuse the saved result and cost nothing. Analyse two or three past concalls of a company to build its track record.

## How it works

```
Screener page ──► numbers (quarterly or half-yearly, annual), concall links, peers
      │
      ▼
Transcript + PPT PDFs ──► Claude (one call, forced JSON schema) ──► guidance + insight report
      │                                                               │
      ▼                                                               ▼
 quote check (every quote must appear in the transcript)     expected numbers + Met/Missed tags
```

| File | Job |
| --- | --- |
| `src/lib/pipeline/screener.ts` | Fetch and parse Screener: ratios, results tables, concall documents, peers. Falls back to standalone when a company has no consolidated numbers. |
| `src/lib/pipeline/documents.ts` | Download PDFs, extract text per page, verify quotes. |
| `src/lib/pipeline/extract.ts` | The Claude call. Text transcripts go as text (cheaper); scanned ones and PPTs go as PDF. |
| `src/lib/pipeline/guidance.ts` | The guidance and insight schema (zod), shared by the model, storage and UI. |
| `src/lib/pipeline/expected.ts` | Expected numbers and scoring. |
| `src/lib/pipeline/periods.ts` | Indian fiscal periods (FY27 = Apr 2026–Mar 2027), quarters and halves. |
| `src/lib/pipeline/analyze.ts` | Orchestration, run-once caching, tracker across concalls. |
| `supabase/migrations/0001_init.sql` | Database draft for milestone 2, with row-level security for the three roles. |

### Expected numbers

Growth guidance becomes a rupee range for each period: **expected = same period last year × (1 + guided growth)**. FY27 guidance of 18–20% on a ₹212 Cr quarter gives ₹250.2–254.4 Cr. A margin guide combined with a revenue guide also gives an EBITDA range in ₹ Cr. Year-to-date progress is shown for annual targets.

### Tags

- **Met**: inside the guided range, or within ±3% of a single-number target.
- **Exceeded / Missed**: above / below that.
- Screener shows small companies in whole crores and margins in whole percents, so whole-number actuals get ±0.5 of rounding slack at the range edges.
- Capex, net debt, order book, dates and qualitative statements are kept with their quote and keyword, for people to tag.

## Known limits

- **Screener access from servers.** The pipeline fetches Screener pages on demand. This works from a normal internet connection; cloud hosts (including some serverless platforms) can be blocked. Test from the deploy target before milestone 2, and read Screener's terms of use.
- **SME companies** report half-yearly. The tracker then works in halves (H1/H2).
- **Margins:** Screener's OPM excludes other income; managements sometimes guide EBITDA including it. Editors can correct a tag with a reason.
- **Model and pricing:** default model `claude-sonnet-5-5` (set `PB_MODEL` to change). Cost per run is printed and saved.

For research within the group only. Not investment advice.
