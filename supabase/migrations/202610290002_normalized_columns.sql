-- Queryable normalized provenance alongside allowlisted JSON evidence.
alter table public.buildings add column borough text generated always as (identity->>'borough') stored, add column bbl text generated always as (identity->>'bbl') stored, add column hpd_building_id text generated always as (identity->>'hpd') stored, add column bin text generated always as (identity->>'bin') stored, add column match_confidence text generated always as (identity->>'confidence') stored;
create index buildings_bbl_idx on public.buildings(bbl);
create index buildings_hpd_idx on public.buildings(hpd_building_id);
alter table public.records add column category text generated always as (evidence->>'category') stored, add column kind text generated always as (evidence->>'kind') stored, add column match_scope text generated always as (evidence->>'scope') stored, add column source_date text generated always as (evidence->>'date') stored, add column source_status text generated always as (evidence->>'status') stored;
create index records_category_date on public.records(building_id,category,source_date);
create or replace function public.populate_building_point() returns trigger language plpgsql set search_path=public,extensions as $$ begin new.location=extensions.st_setsrid(extensions.st_makepoint((new.identity->>'lng')::double precision,(new.identity->>'lat')::double precision),4326)::extensions.geography;return new;end $$;
create trigger building_point before insert or update of identity on public.buildings for each row execute function public.populate_building_point();
