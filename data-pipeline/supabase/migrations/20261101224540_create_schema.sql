create table buildings (
  bbl text primary key check (bbl ~ '^[1-5][0-9]{9}$'),
  bin text,
  address text not null,
  borough text not null,
  geom extensions.geography(Point, 4326) not null,
  units_res int,                -- null when PLUTO has no match
  year_built int,
  updated_at timestamptz not null default now()
);

create table issues (
  source text not null check (source in ('hpd_violation','hpd_complaint','rodent','bedbug','311')),
  source_id text not null,
  bbl text check (bbl ~ '^[1-5][0-9]{9}$'),  -- no FK: 311 rows may reference unsearched buildings
  category text not null check (category in ('repairs','heat','pests','bedbugs','noise')),
  severity smallint not null check (severity between 1 and 3),
  status text not null check (status in ('open','closed')),
  observed_at timestamp,        -- NYC wall-clock time; the sources have no time zone
  description text not null,
  geom extensions.geography(Point, 4326),
  raw jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (source, source_id)
);
create index on issues using gist (geom);
create index on issues (bbl, source);

create table source_fetches (
  bbl text not null references buildings on delete cascade,
  source text not null,
  last_attempt_at timestamptz not null,
  last_success_at timestamptz,  -- freshness is checked against this
  last_error text,
  row_count int,
  latest_record_at timestamp,   -- e.g. last bedbug filing, even if it reported zero
  primary key (bbl, source)
);

create function issues_near(lat double precision, lon double precision, radius_m double precision, since timestamp)
returns table (
  source text, source_id text, bbl text, category text, severity smallint, status text,
  observed_at timestamp, description text, geom extensions.geography, raw jsonb,
  fetched_at timestamptz, distance_m double precision
)
language sql stable
set search_path = public, extensions
as $$
  select i.*, st_distance(i.geom, c.point)
  from issues i, (select st_setsrid(st_makepoint(lon, lat), 4326)::geography as point) c
  where st_dwithin(i.geom, c.point, radius_m) and i.observed_at >= since
  order by 12
$$;

alter table buildings enable row level security;
alter table issues enable row level security;
alter table source_fetches enable row level security;

create policy "public read" on buildings for select to anon, authenticated using (true);
create policy "public read" on issues for select to anon, authenticated using (true);

-- explicit because Supabase's default grants vary by project
revoke all on buildings, issues, source_fetches from anon, authenticated;
grant select on buildings, issues to anon, authenticated;
grant all on buildings, issues, source_fetches to service_role;
grant execute on function issues_near to anon, authenticated, service_role;
