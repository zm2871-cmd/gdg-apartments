create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create table public.buildings(id text primary key check(id ~ '^nyc-[a-f0-9]{24}$'), canonical_address text not null, identity jsonb not null, report jsonb, location extensions.geography(Point,4326), created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index buildings_location_idx on public.buildings using gist(location);
create table public.building_addresses(id uuid primary key default gen_random_uuid(),building_id text references public.buildings on delete cascade,normalized_key text not null,source text,confidence text,unique(building_id,normalized_key));
create table public.data_sources(id text primary key,dataset_id text unique,source_url text not null,last_checked timestamptz,status text not null default 'unchecked',metadata jsonb not null default '{}');
create table public.records(id text primary key,building_id text references public.buildings on delete set null,source_id text not null,external_id text not null,evidence jsonb not null,location extensions.geography(Point,4326),ingested_at timestamptz not null default now(),unique(source_id,external_id));
create index records_building_idx on public.records(building_id);
create index records_location_idx on public.records using gist(location);
create table public.record_groups(id uuid primary key default gen_random_uuid(),building_id text references public.buildings,algorithm_version text not null,group_key text not null,unique(building_id,algorithm_version,group_key));
create table public.record_group_members(group_id uuid references public.record_groups on delete cascade,record_id text references public.records on delete cascade,primary key(group_id,record_id));
create table public.building_score_snapshots(id uuid primary key default gen_random_uuid(),building_id text not null references public.buildings on delete cascade,category text not null check(category in ('pests','bedbugs','heat','maintenance','noise')),grade text check(grade in ('A','B','C','D','F')),scoring_version text not null,calculated_at timestamptz not null default now(),explanation jsonb not null);
create index score_building_idx on public.building_score_snapshots(building_id,calculated_at);
create table public.ingestion_runs(id uuid primary key default gen_random_uuid(),building_id text references public.buildings on delete set null,status text not null,rows_touched integer not null default 0,checkpoint jsonb not null default '{}',created_at timestamptz not null default now());
create table public.user_profiles(owner_id uuid primary key references auth.users on delete cascade,preferences jsonb not null default '{}',created_at timestamptz not null default now());
create table public.saved_buildings(owner_id uuid references auth.users on delete cascade,building_id text references public.buildings on delete cascade,created_at timestamptz not null default now(),primary key(owner_id,building_id));
create table public.saved_comparisons(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,building_ids text[] not null check(cardinality(building_ids) between 2 and 3),name text not null check(length(name)<=120),created_at timestamptz not null default now());
create table public.legal_rules(id text primary key,source_url text not null,rule_text text not null,version text not null,verification_state text not null,last_reviewed date not null);
create table public.lease_documents(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,storage_path text not null unique,status text not null check(status in ('uploaded','parsing','analyzing','ready','failed')),consent_at timestamptz not null,page_count integer check(page_count between 1 and 40),results jsonb,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days',check(storage_path like owner_id::text||'/%'));
create index lease_owner_idx on public.lease_documents(owner_id);
create index lease_expiry_idx on public.lease_documents(expires_at);
create table public.lease_clauses(id uuid primary key default gen_random_uuid(),lease_id uuid not null references public.lease_documents on delete cascade,page integer not null check(page>0),snippet text not null);
create table public.lease_flags(id uuid primary key default gen_random_uuid(),lease_id uuid not null references public.lease_documents on delete cascade,clause_id uuid references public.lease_clauses on delete cascade,rule_id text references public.legal_rules,status text not null,explanation jsonb not null);
create table public.ai_usage(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,operation text not null default 'advisor',created_at timestamptz not null default now());
create index ai_usage_owner_date on public.ai_usage(owner_id,created_at);
-- Public evidence is read-only to clients. Official writes require the server service role.
do $$ declare t text; begin foreach t in array array['buildings','building_addresses','data_sources','records','record_groups','record_group_members','building_score_snapshots','legal_rules'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy public_read on public.%I for select using (true)',t);end loop; end $$;
alter table public.ingestion_runs enable row level security;
-- Every private row is owned and checked on both reads and writes.
do $$ declare t text;begin foreach t in array array['user_profiles','saved_buildings','saved_comparisons','lease_documents'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy own_rows on public.%I for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id)',t);end loop;end $$;
alter table public.ai_usage enable row level security;
create policy own_usage on public.ai_usage for select to authenticated using ((select auth.uid())=owner_id);
alter table public.lease_clauses enable row level security;
create policy own_clauses on public.lease_clauses for all to authenticated using (exists(select 1 from public.lease_documents d where d.id=lease_id and d.owner_id=(select auth.uid()))) with check (exists(select 1 from public.lease_documents d where d.id=lease_id and d.owner_id=(select auth.uid())));
alter table public.lease_flags enable row level security;
create policy own_flags on public.lease_flags for all to authenticated using (exists(select 1 from public.lease_documents d where d.id=lease_id and d.owner_id=(select auth.uid()))) with check (exists(select 1 from public.lease_documents d where d.id=lease_id and d.owner_id=(select auth.uid())));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('leases','leases',false,10485760,array['application/pdf']) on conflict(id) do nothing;
create policy private_pdf on storage.objects for all to authenticated using(bucket_id='leases' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='leases' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Atomic quota reservation; a failed model request still consumes a slot.
create or replace function public.consume_ai_quota(daily_limit integer default 5) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare used integer; uid uuid:=auth.uid();begin
 if uid is null then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select count(*) into used from public.ai_usage where owner_id=uid and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if used>=least(greatest(daily_limit,0),5) then return false;end if;
 insert into public.ai_usage(owner_id) values(uid);return true;end $$;
revoke all on function public.consume_ai_quota(integer) from public,anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;
