-- Applied to Supabase Phoenix ONE on 2026-11-23 as migration
-- phoenix_one_large_media_jobs_private_v2.
-- Repeat only in a fresh environment.
create table if not exists phoenix_one.large_media_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 storage_path text not null,
 original_name text not null,
 bytes bigint not null check (bytes between 1000 and 500000000),
 language text not null default 'auto' check (language in ('auto','pt')),
 consent_at timestamptz not null,
 status text not null default 'uploaded' check (status in ('uploaded','extracting','chunking','transcribing','assembling','review_ready','failed','cancel_requested','cancelled','expired')),
 stage_completed integer not null default 0 check (stage_completed>=0),
 stage_total integer not null default 0 check (stage_total>=0 and stage_total<=160),
 attempts integer not null default 0 check (attempts between 0 and 10),
 lease_token uuid, lease_until timestamptz,
 error_code text, transcript text,
 duration_seconds numeric, segment_count integer,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '48 hours'),
 unique(owner_id,storage_path),
 constraint large_media_owner_path check (split_part(storage_path,'/',1)=owner_id::text),
 constraint large_media_transcript_size check (transcript is null or length(transcript)<=150000)
);
create index if not exists large_media_queue_claim_idx on phoenix_one.large_media_jobs (created_at,id) where status='uploaded';
create index if not exists large_media_owner_recent_idx on phoenix_one.large_media_jobs (owner_id,created_at desc);
create index if not exists large_media_lease_idx on phoenix_one.large_media_jobs (lease_until) where lease_token is not null;
alter table phoenix_one.large_media_jobs enable row level security;
revoke all on phoenix_one.large_media_jobs from public,anon,authenticated;
comment on table phoenix_one.large_media_jobs is 'Phoenix ONE only. Private media processing queue. No direct Data API permissions. Worker and Edge service only.';
