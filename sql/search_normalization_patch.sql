-- Plamut search normalization patch
-- Scope: search, metadata quality, title index, lightweight related suggestions.
-- Explicitly does NOT touch universe tables, universe pages, or seed/manual reference entities.

create extension if not exists pg_trgm;

create table if not exists public.entity_title_index (
  id bigserial primary key,
  entity_id bigint not null references public.media_entities(id) on delete cascade,
  value text not null,
  normalized_value text not null,
  language text not null default 'unknown',
  source text not null default 'system',
  weight integer not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_id, normalized_value, source)
);

create index if not exists entity_title_index_entity_id_idx
  on public.entity_title_index(entity_id);

create index if not exists entity_title_index_normalized_trgm_idx
  on public.entity_title_index using gin (normalized_value gin_trgm_ops);

create index if not exists entity_title_index_language_weight_idx
  on public.entity_title_index(language, weight desc);

create table if not exists public.metadata_enrichment_jobs (
  id bigserial primary key,
  entity_id bigint not null references public.media_entities(id) on delete cascade,
  status text not null default 'queued',
  priority integer not null default 50,
  reason text not null default '',
  attempts integer not null default 0,
  last_error text not null default '',
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_id)
);

create index if not exists metadata_enrichment_jobs_status_priority_idx
  on public.metadata_enrichment_jobs(status, priority desc, created_at asc);

create table if not exists public.relation_candidates (
  id bigserial primary key,
  owner_user_id uuid default auth.uid(),
  source_entity_id bigint references public.media_entities(id) on delete cascade,
  target_entity_id bigint references public.media_entities(id) on delete cascade,
  relation_type text not null default 'related_work',
  source text not null default 'wikidata',
  status text not null default 'suggested',
  confidence numeric not null default 0.5,
  wikidata_entity_id text,
  candidate_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If the table already existed before this patch, make the default explicit.
alter table public.relation_candidates
  alter column owner_user_id set default auth.uid();

-- Trigger makes the owner stable even when the frontend omits owner_user_id.
create or replace function public.set_relation_candidate_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_user_id is null then
    new.owner_user_id := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists set_relation_candidate_owner_before_insert on public.relation_candidates;
create trigger set_relation_candidate_owner_before_insert
before insert on public.relation_candidates
for each row
execute function public.set_relation_candidate_owner();

create index if not exists relation_candidates_source_entity_idx
  on public.relation_candidates(source_entity_id, status, confidence desc);

create index if not exists relation_candidates_owner_idx
  on public.relation_candidates(owner_user_id, status, created_at desc);

-- Required for Supabase upsert(... onConflict: 'owner_user_id,source_entity_id,relation_type,wikidata_entity_id').
create unique index if not exists relation_candidates_owner_source_relation_wikidata_unique_idx
  on public.relation_candidates(owner_user_id, source_entity_id, relation_type, wikidata_entity_id);

-- Legacy unique index, safe to keep if already created by an earlier patch.
create unique index if not exists relation_candidates_source_relation_wikidata_unique_idx
  on public.relation_candidates(source_entity_id, relation_type, wikidata_entity_id);

alter table public.relation_candidates enable row level security;

-- Replace old policies because earlier versions were too strict for insert when owner_user_id was filled by default/trigger.
drop policy if exists "Users can view their relation candidates" on public.relation_candidates;
drop policy if exists "Users can insert their relation candidates" on public.relation_candidates;
drop policy if exists "Users can update their relation candidates" on public.relation_candidates;
drop policy if exists "Users can delete their relation candidates" on public.relation_candidates;

create policy "Users can view their relation candidates"
  on public.relation_candidates
  for select
  using (auth.uid() = owner_user_id);

create policy "Users can insert their relation candidates"
  on public.relation_candidates
  for insert
  to authenticated
  with check (owner_user_id is null or auth.uid() = owner_user_id);

create policy "Users can update their relation candidates"
  on public.relation_candidates
  for update
  to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "Users can delete their relation candidates"
  on public.relation_candidates
  for delete
  to authenticated
  using (auth.uid() = owner_user_id);

create index if not exists media_entities_canonical_key_idx
  on public.media_entities(canonical_key);

create index if not exists media_entities_category_title_primary_trgm_idx
  on public.media_entities using gin (title_primary gin_trgm_ops);

create index if not exists media_entities_category_title_ru_trgm_idx
  on public.media_entities using gin (title_ru gin_trgm_ops);

create index if not exists media_entities_category_title_en_trgm_idx
  on public.media_entities using gin (title_en gin_trgm_ops);

create index if not exists media_entities_external_ids_gin_idx
  on public.media_entities using gin (external_ids);

create index if not exists media_entities_metadata_status_idx
  on public.media_entities((meta->>'metadata_status'));

create or replace function public.plamut_normalize_title_index_value(input text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(lower(coalesce(input, '')), '[^a-z0-9а-яё]+', ' ', 'g'));
$$;

create or replace function public.plamut_refresh_entity_title_index(p_entity_id bigint)
returns void
language plpgsql
security definer
as $$
declare
  v_entity public.media_entities%rowtype;
  v_value text;
  v_normalized text;
begin
  select * into v_entity
  from public.media_entities
  where id = p_entity_id;

  if not found then
    return;
  end if;

  foreach v_value in array array[
    v_entity.title_primary,
    v_entity.title_ru,
    v_entity.title_en,
    v_entity.original_title
  ] loop
    v_normalized := public.plamut_normalize_title_index_value(v_value);

    if v_normalized <> '' then
      insert into public.entity_title_index(entity_id, value, normalized_value, language, source, weight)
      values (
        v_entity.id,
        v_value,
        v_normalized,
        case
          when v_value = v_entity.title_ru then 'ru'
          when v_value = v_entity.title_en then 'en'
          else 'unknown'
        end,
        'media_entities',
        case
          when v_value = v_entity.title_primary then 100
          when v_value = v_entity.title_ru then 95
          when v_value = v_entity.title_en then 90
          when v_value = v_entity.original_title then 85
          else 50
        end
      )
      on conflict(entity_id, normalized_value, source)
      do update set
        value = excluded.value,
        language = excluded.language,
        weight = greatest(public.entity_title_index.weight, excluded.weight),
        updated_at = now();
    end if;
  end loop;
end;
$$;

-- Optional one-time backfill for current non-universe search index.
-- Safe because it only inserts title variants into entity_title_index and never updates media_entities.
do $$
declare
  r record;
begin
  for r in
    select id
    from public.media_entities
    where coalesce(universe_key, '') = ''
      and coalesce(manual_locked, false) = false
      and coalesce(meta->>'seed_locked', 'false') <> 'true'
      and coalesce(meta->>'seed_final', 'false') <> 'true'
      and coalesce(meta->>'manual_reference', 'false') <> 'true'
  loop
    perform public.plamut_refresh_entity_title_index(r.id);
  end loop;
end $$;
