-- ============================================================================
--  Workbench — Supabase schema
--  Paste this whole file into Supabase → SQL Editor → Run. Safe to re-run.
-- ============================================================================

-- Every workspace record (project, task, note, entry…) is one row, keyed by its
-- globally unique id. Last-writer-wins on the client's updated_at; deletions are
-- tombstones (deleted = true, data = null).
create table if not exists public.wb_records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  collection text        not null,
  id         text        not null,
  data       jsonb,                         -- null for tombstones
  updated_at timestamptz not null,          -- client edit time (conflict resolution)
  deleted    boolean     not null default false,
  seq        bigint      not null default 0, -- server change counter (pull cursor)
  primary key (user_id, id)
);

create sequence if not exists public.wb_records_seq;

create index if not exists wb_records_user_seq on public.wb_records (user_id, seq);

-- Signed-in users only (RLS below narrows this to their own rows).
revoke all on public.wb_records from anon;
grant select, insert, update, delete on public.wb_records to authenticated;
grant usage, select on sequence public.wb_records_seq to authenticated;

-- Stamp every insert/update with a fresh sequence number so devices can ask
-- "what changed after N?" without trusting anyone's clock.
create or replace function public.wb_records_stamp() returns trigger
language plpgsql as $$
begin
  new.seq := nextval('public.wb_records_seq');
  return new;
end;
$$;

drop trigger if exists wb_records_stamp on public.wb_records;
create trigger wb_records_stamp
  before insert or update on public.wb_records
  for each row execute function public.wb_records_stamp();

-- ---------------------------------------------------------------------------
--  Row level security: every row belongs to exactly one signed-in user.
-- ---------------------------------------------------------------------------
alter table public.wb_records enable row level security;

drop policy if exists "own rows: select" on public.wb_records;
drop policy if exists "own rows: insert" on public.wb_records;
drop policy if exists "own rows: update" on public.wb_records;
drop policy if exists "own rows: delete" on public.wb_records;

create policy "own rows: select" on public.wb_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: insert" on public.wb_records
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows: update" on public.wb_records
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows: delete" on public.wb_records
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
--  Batched push with last-writer-wins. Runs as the caller, so RLS applies.
--  Input: [{ "id": "...", "collection": "...", "data": {...}|null,
--            "updated_at": "ISO time", "deleted": false }, ...]
--  (collection may be omitted for tombstones)
--  Returns how many rows actually changed.
-- ---------------------------------------------------------------------------
create or replace function public.wb_push(records jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  changed integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  with incoming as (
    select distinct on (r->>'id')
      coalesce(r->>'collection', '_deleted')    as collection,
      r->>'id'                                  as id,
      case when coalesce((r->>'deleted')::boolean, false) then null else r->'data' end as data,
      (r->>'updated_at')::timestamptz           as updated_at,
      coalesce((r->>'deleted')::boolean, false) as deleted
    from jsonb_array_elements(records) as r
    where r->>'id' is not null and r->>'updated_at' is not null
    order by r->>'id', (r->>'updated_at')::timestamptz desc
  ), upserted as (
    insert into public.wb_records as t (user_id, collection, id, data, updated_at, deleted)
    select auth.uid(), collection, id, data, updated_at, deleted from incoming
    on conflict (user_id, id) do update
      set data       = excluded.data,
          updated_at = excluded.updated_at,
          deleted    = excluded.deleted,
          -- a tombstone keeps the collection of the row it deletes
          collection = case when excluded.deleted then t.collection else excluded.collection end
      where t.updated_at < excluded.updated_at
    returning 1
  )
  select count(*) into changed from upserted;
  return changed;
end;
$$;

grant execute on function public.wb_push(jsonb) to authenticated;
revoke execute on function public.wb_push(jsonb) from anon, public;

-- ---------------------------------------------------------------------------
--  Realtime: stream row changes to the owner's other devices.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wb_records'
     ) then
    alter publication supabase_realtime add table public.wb_records;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
--  File storage: a private bucket; each user can only touch <their-id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('workbench-files', 'workbench-files', false)
on conflict (id) do nothing;

drop policy if exists "workbench files: read own"   on storage.objects;
drop policy if exists "workbench files: add own"    on storage.objects;
drop policy if exists "workbench files: change own" on storage.objects;
drop policy if exists "workbench files: remove own" on storage.objects;

create policy "workbench files: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'workbench-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "workbench files: add own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'workbench-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "workbench files: change own" on storage.objects
  for update to authenticated
  using (bucket_id = 'workbench-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "workbench files: remove own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'workbench-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
