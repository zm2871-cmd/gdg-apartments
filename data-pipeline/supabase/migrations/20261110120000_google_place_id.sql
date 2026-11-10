-- GMAPS-05. One row per building we've searched on Google. The place ID is the only Google field we may store
-- (Places policies: exempt from caching limits). Ratings, reviews and coordinates are fetched live and must
-- never get columns here (ToS §3.2.3(a),(b)).
create table google_places (
  bbl text primary key references buildings on delete cascade,
  place_id text,                                  -- null = searched, no listing
  matched_at timestamptz not null default now()   -- our own data: when we last searched
);

-- No policy: only the secret key (pipeline, server routes) can read or write, like source_fetches.
alter table google_places enable row level security;
