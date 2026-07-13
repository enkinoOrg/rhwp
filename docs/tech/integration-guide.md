# 외부 프로젝트 RHWP 연동 가이드

## 배경과 범위

외부 웹 프로젝트는 공용 RHWP Studio(`https://rhwp.enkinokorea.workers.dev/`)를 편집 UI로만 사용하고, 문서 조회와 저장은 자신의 서버에서 처리한다. 이 가이드는 프레임워크 독립 최소 연동에서 Next.js App Router와 Supabase private Storage 운영 예제까지를 연결한다. 예제는 복사 가능한 모듈이며, 인증 helper와 기존 데이터 모델은 각 프로젝트의 정책에 맞춰 교체해야 한다.

## 책임 경계

RHWP 호스트는 HWPX를 열고 편집하며 `editor.exportHwpx()` 결과를 부모 페이지에 돌려주는 역할만 한다. RHWP 호스트에는 문서 ID, 인증 token, signed URL을 전달하지 않는다.

외부 프로젝트는 문서 bytes를 같은 출처 API로 제공하고 저장한다. 서버는 **매 요청마다 세션과 문서별 권한**을 검증하며, URL의 `documentId`만으로 접근을 허용하지 않는다. 이 검증이 없으면 IDOR 취약점이 된다. Supabase service role key와 Storage object path는 서버에만 남긴다.

## 전체 데이터 흐름

1. 부모 페이지는 `createEditor`에 Studio URL만 전달해 iframe editor를 만든다.
2. 부모 페이지 또는 Client Component가 같은 출처 `GET /api/documents/:documentId/file`로 HWPX bytes, 파일명, version을 가져온다.
3. `editor.loadFile(bytes, fileName)`이 bytes를 RHWP에 전달한다. RHWP 호스트로 문서 ID나 token을 넘기지 않는다.
4. 저장 시 `editor.exportHwpx()`가 `Uint8Array`를 만들고, 외부 API에 canonical quoted ETag인 `If-Match: "3"`과 함께 `PUT`한다.
5. 외부 서버가 세션, 권한, MIME type, 크기, ZIP signature, version을 검증한다.
6. repository가 새 object를 만든 후 append-only version 이력과 현재 version을 한 트랜잭션으로 갱신한다. 충돌하면 orphan object만 정리하고 기존 원본은 보존한다.

## 최소 예제

설치합니다.

```bash
npm install @rhwp/editor
```

**축약 예제**: 실제 구현은 [rhwp-client.ts](../../examples/external-integration/rhwp-client.ts)를 기준으로 한다. 이 파일은 `RHWP_STUDIO_URL`, `createRhwpDocumentSession(options)`, `saveHwpxDocument(url, input)`을 공개한다.

```ts
const session = await createRhwpDocumentSession({
  container: '#rhwp-editor',
  fetchDocument: async () => ({
    bytes: await (await fetch(`/api/documents/${documentId}/file`)).arrayBuffer(),
    fileName: 'document.hwpx',
    version: 3,
  }),
  saveDocument: input => saveHwpxDocument(`/api/documents/${documentId}/file`, input),
})

await session.save()
session.destroy()
```

컨테이너에는 안정적인 높이가 필요하다. 재진입 전과 화면 unmount 시 `session.destroy()`를 호출한다. 실제 `createRhwpDocumentSession`은 조회 또는 `editor.loadFile` 실패 시에도 `editor.destroy()`로 editor lifecycle을 정리하고, 저장 성공 응답의 version을 다음 저장 기준으로 갱신한다. 최소 예제의 조회·저장 callback, 오류 처리, lifecycle 설명은 [프레임워크 공통 README](../../examples/external-integration/README.md)에 있다.

## HTTP 계약

`GET /api/documents/:documentId/file`과 `PUT /api/documents/:documentId/file`은 외부 프로젝트 서버의 계약이다. 응답 본문, 인증 방식, 권한 helper 이름은 서비스에 맞게 바꿀 수 있지만 상태 코드는 아래 의미를 유지한다.

| 메서드 | 상태 | 의미 | 클라이언트 처리 |
| --- | --- | --- | --- |
| GET | 200 | 권한 있는 사용자의 현재 HWPX | bytes, `X-Document-Version`, `X-Document-File-Name`을 읽어 `loadFile` |
| GET | 401 | 세션 없음 또는 만료 | 재로그인 흐름으로 이동 |
| GET | 403 | 문서 read 권한 없음 | 접근 거부 안내 |
| GET | 404 | 권한 검증 뒤 문서를 찾지 못함 | 문서 없음 안내 |
| PUT | 200 | 새 version 저장 완료 | JSON `{ version }`을 다음 기준 version으로 반영 |
| PUT | 400 | `If-Match`, MIME type, 빈 본문, ZIP signature가 유효하지 않음 | 사용자 오류를 표시하고 재선택 또는 재조회 |
| PUT | 401 | 세션 없음 또는 만료 | 재로그인 흐름으로 이동 |
| PUT | 403 | 문서 edit 권한 없음 | 접근 거부 안내 |
| PUT | 409 | 기준 version이 현재본과 다름 | 자동 재시도하지 않고 최신본 재조회 또는 사본 저장 선택 |
| PUT | 413 | 50MB 초과 | 더 작은 파일로 다시 시도 |
| PUT | 500 | Storage, DB 등 내부 저장 오류 | 일반화한 오류를 표시하고 동일 version으로 명시적 재시도 |

GET 200 응답은 `Content-Type: application/haansofthwpx`, quoted ETag `ETag: "3"`, `X-Document-Version`, `X-Document-File-Name`을 제공한다. PUT 200 요청은 `Content-Type: application/haansofthwpx`와 quoted ETag `If-Match: "3"`을 사용한다. version은 선행 0이 없는 nonnegative safe integer만 허용한다.

## 한글 파일명과 editor lifecycle

다운로드 응답은 한글 파일명을 `Headers`에 직접 넣지 않는다. `createDocumentDownloadHeaders(input)`은 ASCII fallback과 RFC 5987 `filename*`을 함께 쓰고, `X-Document-File-Name`에는 `encodeURIComponent(fileName)` 값을 넣는다. client는 이를 `decodeURIComponent`로 복원한다. 실제 구현은 [문서 API helper](../../examples/nextjs-integration/lib/api/documents.ts)와 [Route Handler](../../examples/nextjs-integration/app/api/documents/%5BdocumentId%5D/file/route.ts)를 따른다.

`HwpxEditor`는 document ID가 바뀔 때 이전 editor를 destroy하고, unmount에도 `editor.destroy()`를 호출한다. 저장되지 않은 변경은 `beforeunload` 경고로 보호하며, editor 생성이나 저장이 늦게 끝나도 generation 검사로 이전 문서 상태를 덮어쓰지 않는다. 실제 lifecycle은 [HwpxEditor.tsx](../../examples/nextjs-integration/components/HwpxEditor.tsx)에 있다.

공용 호스트는 로컬 글꼴 감지 권한을 요청하지 않는다. 문서에 필요한 글꼴이 없으면 RHWP의 대체 글꼴 렌더링을 사용하므로, 결과물의 서체 재현이 중요하면 대상 사용자 환경에서 렌더링을 확인한다.

## Next.js App Router

**축약 예제**: 실제 client 구현은 [documents.ts](../../examples/nextjs-integration/lib/api/documents.ts), UI 구현은 [HwpxEditor.tsx](../../examples/nextjs-integration/components/HwpxEditor.tsx)다. `getDocumentFile(documentId)`는 GET bytes와 version을 읽고, `saveDocumentFile(documentId, input)`는 `If-Match`를 구성해 PUT한다. 409는 `DocumentVersionConflictError`로 정규화한다.

```ts
const document = await getDocumentFile(documentId)
await editor.loadFile(document.bytes, document.fileName)

const result = await saveDocumentFile(documentId, {
  bytes: await editor.exportHwpx(),
  version: document.version,
})
```

Route Handler는 `GET(request, context)`과 `PUT(request, context)`을 export한다. 두 요청 모두 `requireSession()` 후 각각 `assertCanReadDocument(session.userId, documentId)` 또는 `assertCanEditDocument(session.userId, documentId)`를 먼저 호출해야 한다. 실제 구현은 [file/route.ts](../../examples/nextjs-integration/app/api/documents/%5BdocumentId%5D/file/route.ts)다.

```ts
const session = await requireSession()
await assertCanEditDocument(session.userId, documentId)
const expectedVersion = parseExpectedVersion(request.headers)
```

`requireSession`, `assertCanReadDocument`, `assertCanEditDocument`은 예제의 `@/server/auth/document-access` import를 각 프로젝트의 인증 계층으로 교체한다. 인증 만료를 자동 재시도로 숨기지 않으며, 실제 요청 환경에서 401/403 구분을 검증한다.

## Supabase private Storage

Storage bucket은 private으로 운영하며 browser가 Supabase Storage에 직접 접근하지 않는다. `SupabaseDocumentStorage`는 `SUPABASE_URL`과 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`만 읽는다. `NEXT_PUBLIC_SUPABASE_*`에 service role key를 넣지 않는다. 실제 adapter는 [supabase-document-storage.ts](../../examples/nextjs-integration/server/supabase-document-storage.ts)에 있다.

`DocumentRepository`는 `getCurrentFile(documentId)`과 `createVersion(input)`을 제공한다. 저장은 기존 key를 upsert하지 않고 고유한 새 object를 먼저 업로드한다. 이어서 RPC가 기준 version 비교, append-only `document_versions` insert, `documents.current_version` 갱신을 한 트랜잭션으로 수행한다. 실제 저장소 계약은 [document-repository.ts](../../examples/nextjs-integration/server/document-repository.ts), SQL과 RLS/RPC 권한은 [document-versions.sql](../../examples/nextjs-integration/sql/document-versions.sql)에 있다.

경쟁 저장으로 RPC가 conflict를 돌려주면 repository는 방금 만든 미참조 orphan object만 삭제한다. 정리 실패는 기록하고 GC 대상으로 남기되 409 응답을 500으로 바꾸지 않는다. current object를 삭제하거나 덮어쓰지 않는다.

## 버전 충돌과 저장 정책

저장은 현재 version을 기반으로 한 낙관적 잠금이다. 클라이언트는 마지막 GET 또는 성공한 PUT의 version만 `If-Match`에 사용한다. 두 사용자가 같은 version을 저장하면 먼저 커밋한 요청만 PUT 200을 받고, 나머지는 현재 version을 포함한 PUT 409를 받는다.

409를 받은 클라이언트는 export 결과를 같은 version으로 재전송하지 않는다. 최신 문서를 다시 연 뒤 편집 내용을 비교하거나, 서비스가 제공하는 사본 저장 흐름으로 분기한다. 자동 저장을 추가하더라도 저장 성공 전에는 dirty 상태를 해제하지 않고, 충돌 후에는 자동 재시도를 중지한다.

## 보안과 파일 검증

부모 페이지 CSP에는 `frame-src https://rhwp.enkinokorea.workers.dev`를 허용한다. `postMessage`를 직접 확장하는 경우에는 target origin을 고정하고 message origin과 schema를 검증한다. CORS는 같은 출처 API를 기본으로 하며, 불필요하게 credential API를 다른 origin에 공개하지 않는다.

PUT은 `Content-Length`가 있으면 50MB를 본문 읽기 전에 선검사한다. 헤더가 없거나 작게 위조되어도 `readBodyWithinLimit(body, MAX_HWPX_BYTES)`가 stream chunk를 누적하고 한도를 넘으면 cancel한 뒤 413으로 끝낸다. 실제 구현은 [documents.ts](../../examples/nextjs-integration/lib/api/documents.ts)와 [Route Handler](../../examples/nextjs-integration/app/api/documents/%5BdocumentId%5D/file/route.ts)를 따른다.

HWPX ZIP signature 검사는 처음 4 byte가 `50 4B 03 04`인지 확인할 뿐, 파일이 안전하거나 완전한 HWPX임을 보장하지 않는다. 악성 ZIP, 압축 폭탄, 내부 XML 구조, 업무 규칙은 외부 서버의 업로드 검사 정책에서 추가 검증해야 한다. export 결과도 신뢰하지 않고 서버에서 MIME type, 크기, ZIP signature를 다시 확인한다.

## 환경 변수와 배포

필요한 서버 환경 변수는 다음과 같다.

```bash
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
```

**축약 예제**: 패키지 설치, 복사 위치, bucket 이름 변경 지점, SQL 적용 전 검토는 [Next.js 예제 README](../../examples/nextjs-integration/README.md)를 따른다. `@rhwp/editor`와 `@supabase/supabase-js`를 설치하고, `route.ts`의 인증 helper import를 교체한다. SQL은 예제이므로 기존 테이블, 사용자 ID 타입, RLS와 service_role 권한을 검토한 뒤 적용한다.

배포 후에는 parent service가 운영 Studio URL을 사용하고 CSP가 iframe을 허용하는지 확인한다. Supabase private bucket, server-only 환경 변수, DB RPC owner와 execute 권한은 운영 환경에서 다시 점검한다.

## 테스트

이 저장소에서는 다음 명령으로 예제와 문서의 source contract를 확인한다.

```bash
npm run test:integration-guide
npm --prefix rhwp-studio test
```

**축약 예제**: 실제 contract 검사는 [enkino-external-integration.test.mjs](../../tests/enkino-external-integration.test.mjs)에 있다. 이 검사는 lifecycle, quoted ETag, 한글 파일명 header, 권한 경계, streaming 50MB 제한, append-only 저장과 orphan 정리 규칙을 확인한다. 외부 프로젝트는 실제 인증 helper, private bucket 접근 권한, RLS, production GET/PUT도 별도 통합 테스트로 검증한다.

## 운영 체크리스트

- RHWP 호스트 요청과 로그에 문서 ID, 인증 token, signed URL이 없는지 확인한다.
- GET과 PUT이 매 요청 세션 및 문서별 read/edit 권한을 검증하는지 확인한다.
- bucket이 private이고 `SUPABASE_SERVICE_ROLE_KEY`가 서버 밖으로 노출되지 않는지 확인한다.
- `If-Match`와 ETag가 quoted canonical version을 사용하며, 409가 기존 파일을 덮어쓰지 않는지 확인한다.
- `document_versions`가 append-only이고 version insert/current pointer 갱신이 RPC 트랜잭션으로 실행되는지 확인한다.
- 50MB 선검사와 streaming 제한, HWPX ZIP signature 재검증이 활성화됐는지 확인한다.
- 한글 파일명이 `filename*`와 URL-encoded `X-Document-File-Name`으로 응답되는지 확인한다.
- 로컬 글꼴이 없어도 필요한 문서가 대체 글꼴로 읽히는지 대상 환경에서 확인한다.
- 409 conflict와 orphan cleanup 실패를 모니터링하고 GC 절차를 운영한다.

## 문제 해결

| 증상 | 확인할 사항 | 조치 |
| --- | --- | --- |
| editor가 열리지 않음 | Studio URL, CSP `frame-src`, container 높이 | `RHWP_STUDIO_URL`과 iframe 허용 정책을 확인 |
| GET 401 또는 403 | 세션, `assertCanReadDocument` | 재로그인 또는 문서 권한 부여 |
| PUT 400 | quoted ETag, MIME type, ZIP signature | `If-Match: "3"`, `application/haansofthwpx`, 유효 HWPX를 확인 |
| PUT 409 | 다른 저장 성공 여부 | 최신본을 재조회하고 비교 또는 사본 저장 |
| PUT 413 | `Content-Length`와 stream 크기 | 50MB 이하 파일로 줄이고 업로드 정책을 확인 |
| 한글 파일명이 깨짐 | `filename*`, `X-Document-File-Name` 인코딩 | `createDocumentDownloadHeaders`와 `decodeURIComponent`를 사용 |
| 저장 후 이전 문서 상태가 보임 | document ID 전환 중 비동기 작업 | `HwpxEditor`의 generation/lifecycle 패턴을 적용 |
| 글꼴이 다르게 보임 | 사용자 환경의 설치 글꼴 | 로컬 글꼴 감지 없이 대체 글꼴을 쓰는 정책을 안내하고 결과 검증 |
