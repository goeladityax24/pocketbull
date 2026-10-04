-- PocketBull schema (Supabase / Postgres). Draft for milestone 2 (web app).
-- Roles: admin, editor, viewer. Invite-only via allowed_emails.

create type app_role as enum ('admin', 'editor', 'viewer');
create type guidance_tag as enum ('met', 'exceeded', 'missed', 'not_comparable');

-- People ---------------------------------------------------------------
create table allowed_emails (
  email text primary key,
  role app_role not null default 'viewer',
  invited_by uuid,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  display_name text,
  role app_role not null default 'viewer',
  monthly_run_limit int,            -- null = use settings.default_monthly_runs
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value jsonb not null
);
insert into settings values
  ('default_monthly_runs', '5'),
  ('met_tolerance_pct', '3'),
  ('monthly_budget_usd', 'null');

create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and not suspended
$$;

-- Companies and saved AI runs -------------------------------------------
create table companies (
  id bigint generated always as identity primary key,
  symbol text not null unique,
  name text not null,
  basis text not null check (basis in ('consolidated', 'standalone')),
  screener_url text not null,
  granularity text not null check (granularity in ('quarter', 'half')),
  snapshot jsonb,                    -- latest CompanySnapshot (numbers, concall list, peers)
  snapshot_fetched_at timestamptz,
  created_at timestamptz not null default now()
);

create table analysis_runs (
  id bigint generated always as identity primary key,
  company_id bigint not null references companies on delete cascade,
  concall_year_month text not null,  -- '2026-05'
  concall_month text not null,       -- 'May 2026'
  transcript_url text not null,
  ppt_url text,
  call_period text,                  -- 'Q1 FY27'
  insights jsonb not null,
  model text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_usd numeric(10, 4),
  created_by uuid references profiles,
  created_at timestamptz not null default now(),
  unique (company_id, concall_year_month)   -- one AI run per concall, ever
);

create table guidance (
  id bigint generated always as identity primary key,
  run_id bigint not null references analysis_runs on delete cascade,
  company_id bigint not null references companies on delete cascade,
  item jsonb not null,               -- GuidanceItem as extracted
  quote_check text not null,         -- verified | partial | not_found | unverifiable
  edited_item jsonb,                 -- editor/admin correction; wins over item
  edited_by uuid references profiles,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index on guidance (company_id);

-- Manual tag changes: anyone can, with a reason; admins can revert
create table tag_overrides (
  id bigint generated always as identity primary key,
  guidance_id bigint not null references guidance on delete cascade,
  period_label text not null,        -- 'Q2 FY27' or 'FY27'
  tag guidance_tag not null,
  reason text not null check (length(trim(reason)) > 0),
  changed_by uuid not null references profiles,
  created_at timestamptz not null default now(),
  reverted_by uuid references profiles,
  reverted_at timestamptz
);

-- Research space -------------------------------------------------------
create table notes (
  id bigint generated always as identity primary key,
  company_id bigint not null references companies on delete cascade,
  guidance_id bigint references guidance on delete set null,
  body text not null,
  author uuid not null references profiles,
  created_at timestamptz not null default now()
);

create table links (
  id bigint generated always as identity primary key,
  company_id bigint not null references companies on delete cascade,
  url text not null,
  title text,
  kind text not null default 'other' check (kind in ('report', 'news', 'video', 'other')),
  added_by uuid not null references profiles,
  created_at timestamptz not null default now()
);

-- Usage and audit --------------------------------------------------------
create table usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles,
  kind text not null check (kind in ('run', 'check')),
  company_id bigint references companies,
  run_id bigint references analysis_runs,
  cost_usd numeric(10, 4),
  created_at timestamptz not null default now()
);

create or replace function runs_this_month(uid uuid) returns int
language sql stable as $$
  select count(*)::int from usage_events
  where user_id = uid and kind = 'run' and created_at >= date_trunc('month', now())
$$;

create table audit_log (
  id bigint generated always as identity primary key,
  actor uuid references profiles,
  action text not null,              -- 'tag.change', 'guidance.edit', 'role.change', ...
  entity text not null,
  entity_id text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- Row level security -------------------------------------------------------
alter table profiles enable row level security;
alter table allowed_emails enable row level security;
alter table settings enable row level security;
alter table companies enable row level security;
alter table analysis_runs enable row level security;
alter table guidance enable row level security;
alter table tag_overrides enable row level security;
alter table notes enable row level security;
alter table links enable row level security;
alter table usage_events enable row level security;
alter table audit_log enable row level security;

-- Every signed-in member reads companies, runs, guidance, tags, links
create policy read_members on companies for select using (my_role() is not null);
create policy read_members on analysis_runs for select using (my_role() is not null);
create policy read_members on guidance for select using (my_role() is not null);
create policy read_members on tag_overrides for select using (my_role() is not null);
create policy read_members on links for select using (my_role() is not null);
create policy read_members on settings for select using (my_role() is not null);

-- Tags: any member may change, with a reason, as themselves
create policy tag_insert on tag_overrides for insert with check (my_role() is not null and changed_by = auth.uid());
create policy tag_revert on tag_overrides for update using (my_role() = 'admin');

-- Guidance corrections: editors and admins
create policy guidance_edit on guidance for update using (my_role() in ('admin', 'editor'));

-- Notes: editors and admins only, both read and write
create policy notes_rw on notes for all using (my_role() in ('admin', 'editor'))
  with check (my_role() in ('admin', 'editor') and author = auth.uid());

-- Links: editors and admins add or remove
create policy links_write on links for insert with check (my_role() in ('admin', 'editor') and added_by = auth.uid());
create policy links_delete on links for delete using (my_role() in ('admin', 'editor'));

-- Profiles: see yourself; admins see and manage everyone
create policy profile_self on profiles for select using (id = auth.uid() or my_role() = 'admin');
create policy profile_admin on profiles for update using (my_role() = 'admin');
create policy invites_admin on allowed_emails for all using (my_role() = 'admin');
create policy settings_admin on settings for update using (my_role() = 'admin');

-- Usage: see your own; admins see all. Inserts happen server-side (service role).
create policy usage_self on usage_events for select using (user_id = auth.uid() or my_role() = 'admin');
create policy audit_admin on audit_log for select using (my_role() = 'admin');

-- Runs, companies, guidance inserts are done by the server with the service key,
-- after it checks the user's role and monthly limit.
