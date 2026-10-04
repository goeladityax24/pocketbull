-- PocketBull: no sign-in for now. Run after 0001_init.sql.
-- Visitors read through the web server, which uses the secret key; one Admin
-- (unlocked with ADMIN_KEY) makes changes. So people are stored by name, not account.

alter table notes alter column author drop not null, add column author_name text;
alter table links alter column added_by drop not null, add column added_by_name text;
alter table tag_overrides alter column changed_by drop not null, add column changed_by_name text;
alter table tag_overrides drop constraint if exists tag_overrides_changed_by_fkey;
alter table audit_log add column actor_name text;

-- Runs are written by `npm run sync-db` from data/runs/, so keep the rest of SavedRun
alter table analysis_runs
  add column call_date text,
  add column docs jsonb,
  add column created_by_name text;

-- "Request analysis": each request opens a GitHub issue labelled analysis-request
create table analysis_requests (
  id bigint generated always as identity primary key,
  symbol text not null,
  note text,
  requested_by_name text not null,
  issue_number int,
  issue_url text,
  status text not null default 'open' check (status in ('open', 'done', 'closed')),
  created_at timestamptz not null default now()
);
-- Row-level security on, no policies: only the server (secret key) reads and writes
alter table analysis_requests enable row level security;

create index on tag_overrides (guidance_id, period_label, created_at desc);
