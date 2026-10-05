-- PocketBull: research notes (six-section analyst report), one per company.
-- Written to data/notes/<SYMBOL>.json and copied here by `npm run sync-db`.
alter table companies
  add column if not exists research_note jsonb,
  add column if not exists research_note_at date;
