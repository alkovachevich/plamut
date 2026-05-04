-- Fix relation_candidates permissions for authenticated frontend inserts.
-- Run this in Supabase SQL Editor if relation_candidates returns:
-- 403 Forbidden / permission denied for table relation_candidates.

alter table public.relation_candidates
  alter column owner_user_id set default auth.uid();

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

grant select, insert, update, delete on table public.relation_candidates to authenticated;
grant usage, select on sequence public.relation_candidates_id_seq to authenticated;

create unique index if not exists relation_candidates_owner_source_relation_wikidata_unique_idx
  on public.relation_candidates(owner_user_id, source_entity_id, relation_type, wikidata_entity_id);

alter table public.relation_candidates enable row level security;

drop policy if exists "Users can view their relation candidates" on public.relation_candidates;
drop policy if exists "Users can insert their relation candidates" on public.relation_candidates;
drop policy if exists "Users can update their relation candidates" on public.relation_candidates;
drop policy if exists "Users can delete their relation candidates" on public.relation_candidates;

create policy "Users can view their relation candidates"
  on public.relation_candidates
  for select
  to authenticated
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
