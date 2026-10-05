-- PocketBull: conference and broker notes as sources of guidance.
-- Admins add the link (kind 'conference'); a Claude session analyses it and
-- `npm run sync-db` marks it analysed.
alter table links drop constraint if exists links_kind_check;
alter table links add constraint links_kind_check
  check (kind in ('report', 'news', 'video', 'conference', 'other'));
alter table links
  add column if not exists event_date date,
  add column if not exists analysed_at timestamptz;

-- Where a run came from when it isn't a concall transcript (event, links, grade)
alter table analysis_runs add column if not exists source jsonb;
