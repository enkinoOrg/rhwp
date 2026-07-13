# Next.js App Router와 Supabase RHWP 연동 예제

## 배경

외부 서비스가 공용 RHWP Studio에서 HWPX를 편집하면서도 문서 ID, 인증 token, Supabase signed URL을 RHWP 호스트에 전달하지 않기 위한 복사형 production 예제입니다. 이 디렉터리는 실행 가능한 앱이나 migration이 아니며, 각 외부 프로젝트의 인증과 데이터 모델에 맞게 검토 후 복사합니다.

RHWP Studio URL은 `https://rhwp.enkinokorea.workers.dev/`입니다. Studio에는 편집 UI만 연결하고, 문서 bytes는 외부 서비스의 동일 출처 API에서만 주고받습니다.

## 필요한 패키지와 환경 변수

```bash
npm install @rhwp/editor @supabase/supabase-js
```

서버 환경 변수만 설정합니다. `SUPABASE_SERVICE_ROLE_KEY`는 브라우저 코드와 `NEXT_PUBLIC_*` 변수에 두지 않습니다.

```bash
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
```

Storage bucket은 기본값 `documents`의 **private bucket**입니다. 공개 bucket 또는 signed URL로 browser가 Storage에 직접 접근하게 만들지 않습니다.

## 복사 위치와 인증 교체 지점

다음 파일을 App Router 프로젝트에 복사합니다.

```text
app/api/documents/[documentId]/file/route.ts
components/HwpxEditor.tsx
lib/api/documents.ts
lib/rhwp-client.ts
server/document-repository.ts
server/supabase-document-storage.ts
sql/document-versions.sql
```

`lib/rhwp-client.ts`에는 [`examples/external-integration/rhwp-client.ts`](../external-integration/rhwp-client.ts)의 `RHWP_STUDIO_URL` export를 복사합니다. 이 저장소의 `HwpxEditor.tsx`는 예제끼리의 상대 경로를 사용하므로, 외부 프로젝트에서는 해당 import를 `../lib/rhwp-client`로 변경합니다.

`route.ts`의 `@/server/auth/document-access` import를 프로젝트의 인증 helper로 바꿉니다. `requireSession()`은 매 요청 세션에서 사용자 ID를 반환해야 하고, `assertCanReadDocument(userId, documentId)`와 `assertCanEditDocument(userId, documentId)`는 대상 문서별 권한을 확인해야 합니다. URL의 `documentId`만 신뢰하면 IDOR가 되므로, 조회와 저장 모두 이 검사를 생략하지 않습니다.

## 실행 흐름

1. `HwpxEditor`는 공용 Studio URL로 editor만 만들고 같은 출처 `GET /api/documents/:id/file`로 HWPX를 읽습니다.
2. Route Handler는 세션과 read 권한을 확인한 뒤 서버 전용 service role로 private bucket에서 bytes를 가져옵니다.
3. 저장 시 component는 `editor.exportHwpx()` 결과와 quoted ETag `If-Match: "3"`을 같은 출처 `PUT`으로 보냅니다.
4. Route Handler는 세션, edit 권한, MIME type, 50MB 크기, ZIP signature를 확인합니다.
5. repository는 새 고유 Storage object를 만들고, SQL RPC가 기준 version 비교, append-only `document_versions` insert, `documents.current_version` 변경을 한 트랜잭션으로 처리합니다.
6. 기준 version이 다르면 API는 `409 Conflict`를 반환하고 기존 원본을 덮어쓰지 않습니다. component는 `DocumentVersionConflictError`를 잡아 최신 문서 재조회 UI를 보여 줍니다.

## SQL 적용 전 검토

`sql/document-versions.sql`은 예제입니다. 운영 DB에 적용하기 전 기존 `documents` 스키마, 사용자 ID 타입, RLS 정책, service role 권한, private bucket 이름을 검토합니다. `create_document_version` RPC는 document 행을 잠근 뒤 version 행을 추가하고 current version을 갱신합니다. version 행은 trigger로 update와 delete를 차단합니다.

업로드 object는 DB 커밋보다 먼저 새 고유 key에 생성됩니다. 동시 저장으로 RPC가 충돌을 반환하면 repository는 그 미참조 object만 삭제합니다. 기존 current object는 어떤 경우에도 삭제하거나 `upsert`하지 않습니다.

## 제한과 운영 확인

ZIP signature 검사는 HWPX 여부를 완전히 보장하지 않습니다. 악성 ZIP, 압축 폭탄, HWPX 내부 구조 검증은 서비스의 파일 검사 정책에서 추가로 처리해야 합니다. 운영 전에는 다음을 확인합니다.

- 인증 helper가 401과 403을 프로젝트 정책에 맞게 응답하는지
- Storage bucket이 private이고 service role key가 server-only 경계 밖으로 노출되지 않는지
- `409` 수신 시 저장을 자동 재시도하지 않고 최신본 재조회 흐름을 제공하는지
- RHWP host 요청에 document ID, token, signed URL이 포함되지 않는지
