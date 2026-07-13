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
  version integer not null check (version > 0),
  storage_path text not null unique,
  byte_size integer not null check (byte_size > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

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

-- version 비교, 이력 추가, 현재 version 변경을 잠금 안에서 처리
create or replace function public.create_document_version(
  p_document_id uuid,
  p_expected_version integer,
  p_next_version integer,
  p_storage_path text,
  p_byte_size integer,
  p_actor_id uuid
)
returns table (kind text, version integer, current_version integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_version integer;
begin
  select current_version
  into locked_version
  from public.documents
  where id = p_document_id
  for update;

  if not found then
    raise exception '문서를 찾을 수 없습니다.' using errcode = 'P0002';
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
    version,
    storage_path,
    byte_size,
    created_by
  ) values (
    p_document_id,
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
revoke all on function public.create_document_version(uuid, integer, integer, text, integer, uuid) from public;
