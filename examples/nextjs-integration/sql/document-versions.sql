-- 배경: HWPX 원본을 덮어쓰지 않고 저장 이력과 충돌 원인을 보존한다.
-- 적용 전 기존 documents 테이블, RLS 정책, 인증 사용자 ID 타입을 반드시 검토한다.

create table if not exists public.documents (
  id uuid primary key,
  file_name text not null,
  current_version integer not null default 0 check (current_version >= 0),
  current_storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_versions (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id),
  operation_id text not null unique,
  version integer not null check (version > 0),
  storage_path text not null unique,
  byte_size integer not null check (byte_size > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

-- 즉시 삭제하지 못한 미참조 Storage object를 후속 GC가 재처리한다.
create table if not exists public.document_storage_gc_queue (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id),
  operation_id text not null,
  version integer not null check (version > 0),
  storage_path text not null unique,
  reason text not null,
  last_error text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  not_before timestamptz not null,
  resolved_at timestamptz
);

-- 이전 예제 스키마의 version 행에도 고유 operation ID를 부여한 뒤 필수화한다.
alter table public.document_versions
add column if not exists operation_id text;

do $migration$
declare
  mutation_trigger_exists boolean;
begin
  select exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.document_versions'::regclass
      and tgname = 'document_versions_no_update'
  ) into mutation_trigger_exists;

  if mutation_trigger_exists then
    alter table public.document_versions disable trigger document_versions_no_update;
  end if;

  update public.document_versions
  set operation_id = 'legacy-document-version-' || id::text
  where operation_id is null;

  if mutation_trigger_exists then
    alter table public.document_versions enable trigger document_versions_no_update;
  end if;
end;
$migration$;

alter table public.document_versions
alter column operation_id set not null;

create unique index if not exists document_versions_operation_id_key
on public.document_versions (operation_id);

-- 이전 예제 queue에도 operation과 grace period 필드를 추가한다.
alter table public.document_storage_gc_queue
add column if not exists version integer;

alter table public.document_storage_gc_queue
add column if not exists operation_id text;

alter table public.document_storage_gc_queue
add column if not exists not_before timestamptz;

update public.document_storage_gc_queue
set operation_id = coalesce(operation_id, 'legacy-gc-' || id::text),
    not_before = coalesce(not_before, created_at)
where operation_id is null or not_before is null;

alter table public.document_storage_gc_queue
alter column operation_id set not null;

alter table public.document_storage_gc_queue
alter column not_before set not null;

alter table public.document_storage_gc_queue
drop constraint if exists document_storage_gc_queue_reason_check;

alter table public.document_storage_gc_queue
add constraint document_storage_gc_queue_reason_check
check (reason in ('version-conflict', 'commit-not-committed', 'commit-unknown'));

-- Data API가 route 권한 경계를 우회하지 못하도록 업무 테이블을 서버 전용으로 잠근다.
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_storage_gc_queue enable row level security;

revoke all on table public.documents, public.document_versions from public;
revoke all on table public.documents, public.document_versions from anon, authenticated;
revoke all on table public.documents, public.document_versions from service_role;
revoke all on table public.document_storage_gc_queue from public, anon, authenticated;
revoke all on table public.document_storage_gc_queue from service_role;
-- adapter는 현재 metadata 조회만 직접 수행하고, version 쓰기는 아래 security definer RPC가 담당한다.
grant select on table public.documents to service_role;
grant select, insert, update, delete on table public.document_storage_gc_queue to service_role;
grant usage, select on sequence public.document_storage_gc_queue_id_seq to service_role;

-- append-only version 행 수정과 삭제 차단
create or replace function public.reject_document_version_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'document_versions는 append-only 테이블입니다.';
end;
$$;

drop trigger if exists document_versions_no_update on public.document_versions;
create trigger document_versions_no_update
before update on public.document_versions
for each row execute function public.reject_document_version_mutation();

drop trigger if exists document_versions_no_delete on public.document_versions;
create trigger document_versions_no_delete
before delete on public.document_versions
for each row execute function public.reject_document_version_mutation();

drop function if exists public.create_document_version(uuid, integer, integer, text, integer, uuid);

-- operation 멱등 확인, version 비교와 이력/current 변경을 같은 잠금에서 처리
create or replace function public.create_document_version(
  p_document_id uuid,
  p_operation_id text,
  p_expected_version integer,
  p_next_version integer,
  p_storage_path text,
  p_byte_size integer,
  p_actor_id uuid
)
returns table (kind text, version integer, current_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_version integer;
  existing_version public.document_versions%rowtype;
begin
  select current_version
  into locked_version
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception '문서를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if p_operation_id is null or btrim(p_operation_id) = '' then
    raise exception 'operation_id가 유효하지 않습니다.';
  end if;

  select dv.*
  into existing_version
  from public.document_versions as dv
  where dv.operation_id = p_operation_id;

  if found then
    if existing_version.document_id <> p_document_id
      or existing_version.version <> p_next_version
      or p_expected_version <> existing_version.version - 1
      or existing_version.storage_path <> p_storage_path
      or existing_version.byte_size <> p_byte_size
      or existing_version.created_by <> p_actor_id then
      raise exception '같은 operation_id에 다른 저장 payload를 사용할 수 없습니다.';
    end if;

    return query select 'saved', existing_version.version, null::integer;
    return;
  end if;

  if locked_version <> p_expected_version then
    return query select 'conflict', null::integer, locked_version;
    return;
  end if;

  if p_next_version <> locked_version + 1 then
    raise exception '다음 version이 유효하지 않습니다.';
  end if;

  insert into public.document_versions (
    document_id,
    operation_id,
    version,
    storage_path,
    byte_size,
    created_by
  ) values (
    p_document_id,
    p_operation_id,
    p_next_version,
    p_storage_path,
    p_byte_size,
    p_actor_id
  );

  update public.documents
  set current_version = p_next_version,
      current_storage_path = p_storage_path,
      updated_at = now()
  where id = p_document_id;

  return query select 'saved', p_next_version, null::integer;
end;
$$;

-- service role만 이 RPC를 호출하도록 실제 운영 역할에 맞게 권한을 제한한다.
-- owner는 service_role이 아닌 통제된 DB 소유자여야 하며, Supabase 기본 owner는 postgres다.
alter function public.create_document_version(uuid, text, integer, integer, text, integer, uuid)
owner to postgres;

revoke all on function public.create_document_version(uuid, text, integer, integer, text, integer, uuid) from public;
revoke all on function public.create_document_version(uuid, text, integer, integer, text, integer, uuid) from anon, authenticated;
grant execute on function public.create_document_version(uuid, text, integer, integer, text, integer, uuid) to service_role;

drop function if exists public.resolve_document_version_commit(uuid, integer, text);

-- grace period 뒤에도 commit이 불명확할 때 operation과 object 참조를 함께 판정한다.
create or replace function public.resolve_document_version_commit(
  p_document_id uuid,
  p_operation_id text,
  p_version integer,
  p_storage_path text
)
returns table (kind text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_version integer;
  locked_storage_path text;
begin
  select current_version, current_storage_path
  into locked_version, locked_storage_path
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    return query select 'unknown', null::integer;
    return;
  end if;

  if exists (
    select 1
    from public.document_versions as dv
    where dv.document_id = p_document_id
      and dv.version = p_version
      and dv.storage_path = p_storage_path
      and dv.operation_id = p_operation_id
  ) then
    return query select 'committed', p_version;
    return;
  end if;

  if locked_storage_path = p_storage_path or exists (
    select 1
    from public.document_versions as dv
    where dv.storage_path = p_storage_path
  ) then
    return query select 'unknown', null::integer;
    return;
  end if;

  return query select 'not-committed', null::integer;
end;
$$;

alter function public.resolve_document_version_commit(uuid, text, integer, text)
owner to postgres;

revoke all on function public.resolve_document_version_commit(uuid, text, integer, text) from public;
revoke all on function public.resolve_document_version_commit(uuid, text, integer, text) from anon, authenticated;
grant execute on function public.resolve_document_version_commit(uuid, text, integer, text) to service_role;
