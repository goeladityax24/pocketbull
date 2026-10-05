# Analysis playbook (Claude session on the Admin's plan)

How a Claude session turns an analysis request into a saved run, with no API key and no API bill. Claude follows this when the Admin says **"run the pending requests"** or **"analyse <SYMBOL>"**.

## 1. Find the requests

Open issues labelled `analysis-request` are the queue:

```bash
gh issue list --label analysis-request --state open
```

Each issue names a company (NSE symbol or Screener link) and, for a refresh, the concall month. Requests also show in the web app's Admin queue.

## 2. Check there is something new (free)

Look at the company's Screener page, Documents › Concalls. Compare the latest concall with the files in `data/runs/<SYMBOL>/`. If there is nothing newer, comment on the issue and close it. **Never analyse the same concall twice.**

Screener and BSE/NSE may block cloud sessions. If `npm run analyze -- <SYMBOL> --check` fails with 403, read them through the browser on the Admin's Mac instead and save:

- the Screener page sections (`#company-info`, `h1`, `#top-ratios`, `#quarters`, `#profit-loss`, `.documents.concalls`) to `tmp/<SYMBOL>.html`
- the transcript text with `[[page N]]` markers (pdf.js in the browser works) to `tmp/<SYMBOL>-<YYYY-MM>.txt`

`tmp/` is git-ignored.

## 3. Read and write the analysis

- Read the full transcript and, if listed, the investor presentation. Some SME companies file no transcripts: analyse the investor presentation instead and pass it as `--transcript` with the month (quotes are then checked against the slides).
- Read earlier runs in `data/runs/<SYMBOL>/` so `revises` and `what_changed` are right.
- Follow `EXTRACTION_RULES` in `src/lib/pipeline/extract.ts` exactly: management only, quotes copied word for word with PDF page numbers, Indian fiscal years, ₹ in crore, percent as plain numbers, vague bands → qualitative.
- Write the result as JSON in the `ExtractionResult` shape from `src/lib/pipeline/guidance.ts` to `tmp/<SYMBOL>-<YYYY-MM>.json`.

## 4. Import (checks and scoring)

```bash
npm run import-run -- <SYMBOL> --file tmp/<SYMBOL>-<YYYY-MM>.json --month <YYYY-MM> \
  [--page tmp/<SYMBOL>.html] [--transcript tmp/<SYMBOL>-<YYYY-MM>.txt] --by "<Admin name>"
```

It validates the format, checks every quote against the transcript and prints the report. Exit code 2 means a quote was not found: fix the quote and import again. Never import with quotes marked `not_found`.

## 5. Insight report (new companies, and once a year after the annual report)

The Insight report tab shows a six-section analyst write-up when one exists: business, financials, management and governance (walking the talk), peers, risks with bull/base/bear scenarios, and valuation. There is no buy/hold/sell call.

- Sources: Screener (5-year P&L, balance sheet, cash flow, ratios, shareholding, prices), the last two concalls, the latest annual report (auditor changes, related-party transactions, pledges, key audit matters, contingent liabilities, pay), and 3-4 real peers (not Screener's list if it names customers).
- Compute the same derived figures every time: revenue growth, borrowings/equity, interest cover (EBIT/interest), profit vs operating cash flow, ROIIC over two years, EV/EBITDA.
- "Walking the talk" comes from the guidance tracker: what they said, when, what happened.
- Scenarios are illustrative, with the assumptions stated in each card.
- Write it as JSON in the `ResearchNote` shape (`src/lib/pipeline/note.ts`) to `data/notes/<SYMBOL>.json`. `npm test` and `npm run sync-db` both validate it.

## 6. Save, publish to the web app and close

```bash
npm run snapshot -- <SYMBOL> [--page tmp/<SYMBOL>.html]   # latest Screener numbers → data/snapshots/
npm run sync-db -- <SYMBOL>                               # copies runs, snapshot and insight report into Supabase
git add data/runs/<SYMBOL> data/snapshots/<SYMBOL>.json data/notes/<SYMBOL>.json
git commit -m "Analyse <SYMBOL> <Mon YYYY> concall"
git push
gh issue close <n> --comment "Done: <SYMBOL> <Mon YYYY> concall. <one-line headline>. Next results: <expected numbers>."
```

Mark the request done on the web app's Admin page (or it closes with the GitHub issue). Then tell the Admin in chat: the headline, numbers to check in the next results, and anything that needs a human tag.
