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
5. 외부 서버가 세션, 권한, MIME type, 크기, version과 HWPX archive 구조를 검증한다.
6. repository가 업로드 전에 `operationId`를 고정하고 새 object를 만든 뒤 append-only version 이력과 현재 version을 한 트랜잭션으로 갱신한다. commit 응답이 유실되면 같은 operation으로 RPC를 재호출한다.

## 최소 예제

Enkino는 원본 `@rhwp/editor` npm namespace에 SDK를 발행하지 않는다. 외부 프로젝트는 Enkino가 검증한 고정 커밋에서 SDK를 vendor한다.

```bash
mkdir -p vendor/rhwp-editor
curl -fsSL https://raw.githubusercontent.com/enkinoOrg/rhwp/9fc2bcbda1f5787c60b89244d01b4ff80e3adeab/npm/editor/index.js -o vendor/rhwp-editor/index.js
curl -fsSL https://raw.githubusercontent.com/enkinoOrg/rhwp/9fc2bcbda1f5787c60b89244d01b4ff80e3adeab/npm/editor/index.d.ts -o vendor/rhwp-editor/index.d.ts
```

iframe 메시지 origin/source 검증, pending 요청 정리, transferable 바이너리 프로토콜이 반영된 자체 SDK 기준은 커밋 `9fc2bcbda1f5787c60b89244d01b4ff80e3adeab`이다. 원본 npm package의 버전과 독립적으로 이 SHA를 변경하지 않고 사용하며, 기준을 올릴 때는 테스트와 배포 기록을 함께 갱신한다.

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
| PUT | 400 | `If-Match`, MIME type, 빈 본문 또는 HWPX archive 구조가 유효하지 않음 | 사용자 오류를 표시하고 재선택 또는 재조회 |
| PUT | 401 | 세션 없음 또는 만료 | 재로그인 흐름으로 이동 |
| PUT | 403 | 문서 edit 권한 없음 | 접근 거부 안내 |
| PUT | 409 | 기준 version이 현재본과 다름 | 자동 재시도하지 않고 최신본 재조회 또는 사본 저장 선택 |
| PUT | 413 | 50MB 초과 | 더 작은 파일로 다시 시도 |
| PUT | 500 | Storage, DB 등 내부 저장 오류 | 일반화한 오류를 표시하고 동일 version으로 명시적 재시도 |

GET 200 응답은 `Content-Type: application/haansofthwpx`, quoted ETag `ETag: "3"`, `X-Document-Version`, `X-Document-File-Name`을 제공한다. PUT 200 요청은 `Content-Type: application/haansofthwpx`와 quoted ETag `If-Match: "3"`을 사용한다. version은 선행 0이 없는 nonnegative safe integer만 허용한다.

## 한글 파일명과 editor lifecycle

다운로드 응답은 한글 파일명을 `Headers`에 직접 넣지 않는다. `createDocumentDownloadHeaders(input)`은 ASCII fallback과 RFC 5987 `filename*`을 함께 쓰고, `X-Document-File-Name`에는 `encodeURIComponent(fileName)` 값을 넣는다. client는 이를 `decodeURIComponent`로 복원한다. 실제 구현은 [문서 API helper](../../examples/nextjs-integration/lib/api/documents.ts)와 [Route Handler](../../examples/nextjs-integration/app/api/documents/%5BdocumentId%5D/file/route.ts)를 따른다.

`HwpxEditor`는 document ID가 바뀔 때 이전 editor를 destroy하고, unmount에도 `editor.destroy()`를 호출한다. 현재 SDK는 iframe 내부 변경을 알리는 change event API가 없으므로 dirty 상태나 `beforeunload` 보호를 제공하지 않고 수동 저장 모델로 동작한다. `saveMutexRef`는 중복 저장을 막고 generation 검사는 이전 문서의 늦은 저장 결과가 현재 상태를 덮어쓰지 못하게 한다. 실제 lifecycle은 [HwpxEditor.tsx](../../examples/nextjs-integration/components/HwpxEditor.tsx)에 있다.

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

Route는 [validate-hwpx-archive.ts](../../examples/nextjs-integration/server/validate-hwpx-archive.ts)의 `createHwpxArchiveValidator`에 프로젝트의 ZIP inspector와 [fast-xml-parser-adapter.ts](../../examples/nextjs-integration/server/fast-xml-parser-adapter.ts)의 secure parser를 주입한다. ZIP adapter는 proven library로 중앙 directory와 제한된 실제 압축 해제를 검사하고 `readBytes(maxBytes)`를 구현해야 한다. XML adapter는 `fast-xml-parser@^5.10.0`의 `XMLValidator`와 `XMLParser`를 사용한다. ZIP/XML parser를 손으로 작성하거나 검사 없는 stub을 production에 두지 않는다.

## Supabase private Storage

Storage bucket은 private으로 운영하며 browser가 Supabase Storage에 직접 접근하지 않는다. `SupabaseDocumentStorage`는 `SUPABASE_URL`과 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`만 읽는다. `NEXT_PUBLIC_SUPABASE_*`에 service role key를 넣지 않는다. 실제 adapter는 [supabase-document-storage.ts](../../examples/nextjs-integration/server/supabase-document-storage.ts)에 있다.

`DocumentRepository`는 `getCurrentFile(documentId)`과 `createVersion(input)`을 제공한다. 저장은 기존 key를 upsert하지 않고 고유한 새 object를 먼저 업로드한다. 이어서 RPC가 기준 version 비교, append-only `document_versions` insert, `documents.current_version` 갱신을 한 트랜잭션으로 수행한다. 실제 저장소 계약은 [document-repository.ts](../../examples/nextjs-integration/server/document-repository.ts), SQL과 RLS/RPC 권한은 [document-versions.sql](../../examples/nextjs-integration/sql/document-versions.sql)에 있다.

`document_versions.operation_id`는 unique다. 같은 document/operation/payload의 `create_document_version` 재호출은 이미 커밋된 동일 version을 반환하고, 같은 operation의 다른 payload는 실패한다. 업로드 뒤 DB가 참조하지 않는 object는 orphan 후보로 관리한다. [document-repository.ts](../../examples/nextjs-integration/server/document-repository.ts)는 업로드 전에 operation ID를 고정한다. `commitNewVersion` throw는 **commit-unknown**이므로 같은 operation으로 RPC를 한 번 재시도하며, `saved` 또는 `conflict` 응답만 확정 결과로 처리한다. 재시도도 불명확하면 지연 원 RPC를 고려해 즉시 삭제하지 않고 durable queue에 `operation_id`, `not_before`, `commit-unknown`을 기록한다.

Supabase RPC `resolve_document_version_commit`은 선행 commit RPC와 같은 document row를 잠가 선행 트랜잭션 종료를 기다린다. [document-storage-gc.ts](../../examples/nextjs-integration/server/document-storage-gc.ts)는 `not_before` grace period가 지난 뒤 삭제 직전에 `(documentId, operationId, version, storagePath)` 참조를 다시 조회한다. `not-committed`만 삭제하고, `committed`는 queue를 완료 처리하며, 조회 실패/`unknown`/잘못된 grace 값은 보존한다. 이것이 지연 원 RPC가 뒤늦게 도착해도 object를 삭제하지 않는 executable safety contract다.

## 버전 충돌과 저장 정책

저장은 현재 version을 기반으로 한 낙관적 잠금이다. 클라이언트는 마지막 GET 또는 성공한 PUT의 version만 `If-Match`에 사용한다. 두 사용자가 같은 version을 저장하면 먼저 커밋한 요청만 PUT 200을 받고, 나머지는 현재 version을 포함한 PUT 409를 받는다.

409를 받은 클라이언트는 export 결과를 같은 version으로 재전송하지 않는다. 최신 문서를 다시 연 뒤 편집 내용을 비교하거나, 서비스가 제공하는 사본 저장 흐름으로 분기한다. SDK change event API가 제공되기 전에는 자동 저장이나 dirty 보존을 보장하지 않으며, 사용자가 명시적으로 저장한다.

## 보안과 파일 검증

부모 페이지 CSP에는 `frame-src https://rhwp.enkinokorea.workers.dev`를 허용한다. `postMessage`를 직접 확장하는 경우에는 target origin을 고정하고 message origin과 schema를 검증한다. CORS는 같은 출처 API를 기본으로 하며, 불필요하게 credential API를 다른 origin에 공개하지 않는다.

PUT은 `Content-Length`가 있으면 50MB를 본문 읽기 전에 선검사한다. 헤더가 없거나 작게 위조되어도 `readBodyWithinLimit(body, MAX_HWPX_BYTES)`가 stream chunk를 누적하고 한도를 넘으면 cancel한 뒤 413으로 끝낸다. 실제 구현은 [documents.ts](../../examples/nextjs-integration/lib/api/documents.ts)와 [Route Handler](../../examples/nextjs-integration/app/api/documents/%5BdocumentId%5D/file/route.ts)를 따른다.

[validate-hwpx-archive.ts](../../examples/nextjs-integration/server/validate-hwpx-archive.ts)는 Storage 저장 전에 entry count, 안전한 경로, 중복 entry, 필수 HWPX entry, `application/hwp+zip` mimetype, entry별/전체 uncompressed 크기와 XML 크기를 fail-closed로 제한한다. inspector는 metadata만 신뢰하지 않고 실제 압축 해제를 제한하며 `readBytes(maxBytes)`를 제공한다. 필수 목록에 한정하지 않고 archive의 모든 XML 계열 entry(`.xml`, `.hpf`, `.rdf`, `.rels`, `.opf`)를 [fast-xml-parser-adapter.ts](../../examples/nextjs-integration/server/fast-xml-parser-adapter.ts)로 끝까지 validation/parse한다. 각 entry에 XML byte 한도를 적용하고 `DOCTYPE`, `ENTITY`, malformed XML을 거부하며, `mimetype`은 XML parser 대상이 아니다.

## 환경 변수와 배포

필요한 서버 환경 변수는 다음과 같다.

```bash
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
```

**축약 예제**: 패키지 설치, 복사 위치, bucket 이름 변경 지점, SQL 적용 전 검토는 [Next.js 예제 README](../../examples/nextjs-integration/README.md)를 따른다. `@rhwp/editor@^0.7.19`, `@supabase/supabase-js`, `fast-xml-parser@^5.10.0`을 설치하고, `route.ts`의 인증 helper 및 ZIP inspector import를 프로젝트 adapter로 연결한다. SQL은 예제이므로 기존 테이블, 사용자 ID 타입, RLS와 service_role 권한을 검토한 뒤 적용한다.

배포 후에는 parent service가 운영 Studio URL을 사용하고 CSP가 iframe을 허용하는지 확인한다. Supabase private bucket, server-only 환경 변수, DB RPC owner와 execute 권한은 운영 환경에서 다시 점검한다.

## 테스트

이 저장소에서는 다음 명령으로 예제와 문서의 source contract를 확인한다.

```bash
npm run test:integration-guide
npm --prefix rhwp-studio test
```

**축약 예제**: 실제 contract 검사는 [enkino-external-integration.test.mjs](../../tests/enkino-external-integration.test.mjs)에 있다. 이 검사는 validator 제한, commit-unknown 복구, GC 삭제 전 참조 재조회, lifecycle, quoted ETag, 한글 파일명 header, streaming 50MB 제한을 실행한다. fixture/stub으로 실제 Route Handler와 `HwpxEditor.tsx`까지 TypeScript compile한다. 외부 프로젝트는 proven ZIP adapter, 인증 helper, private bucket 권한과 production GET/PUT을 별도 통합 검증한다.

## 운영 체크리스트

- RHWP 호스트 요청과 로그에 문서 ID, 인증 token, signed URL이 없는지 확인한다.
- GET과 PUT이 매 요청 세션 및 문서별 read/edit 권한을 검증하는지 확인한다.
- bucket이 private이고 `SUPABASE_SERVICE_ROLE_KEY`가 서버 밖으로 노출되지 않는지 확인한다.
- `If-Match`와 ETag가 quoted canonical version을 사용하며, 409가 기존 파일을 덮어쓰지 않는지 확인한다.
- `document_versions`가 append-only이고 version insert/current pointer 갱신이 RPC 트랜잭션으로 실행되는지 확인한다.
- 50MB streaming 제한과 fail-closed HWPX archive validator가 활성화됐는지 확인한다.
- 한글 파일명이 `filename*`와 URL-encoded `X-Document-File-Name`으로 응답되는지 확인한다.
- 로컬 글꼴이 없어도 필요한 문서가 대체 글꼴로 읽히는지 대상 환경에서 확인한다.
- `commit-unknown` queue의 `operation_id`와 `not_before`를 모니터링하고 GC가 grace period 뒤 삭제 직전 DB 참조를 재조회하는지 확인한다.

## 문제 해결

| 증상 | 확인할 사항 | 조치 |
| --- | --- | --- |
| editor가 열리지 않음 | Studio URL, CSP `frame-src`, container 높이 | `RHWP_STUDIO_URL`과 iframe 허용 정책을 확인 |
| GET 401 또는 403 | 세션, `assertCanReadDocument` | 재로그인 또는 문서 권한 부여 |
| PUT 400 | quoted ETag, MIME type, archive validator | `If-Match: "3"`, `application/haansofthwpx`, 유효 HWPX 구조를 확인 |
| PUT 409 | 다른 저장 성공 여부 | 최신본을 재조회하고 비교 또는 사본 저장 |
| PUT 413 | `Content-Length`와 stream 크기 | 50MB 이하 파일로 줄이고 업로드 정책을 확인 |
| 한글 파일명이 깨짐 | `filename*`, `X-Document-File-Name` 인코딩 | `createDocumentDownloadHeaders`와 `decodeURIComponent`를 사용 |
| 저장 후 이전 문서 상태가 보임 | document ID 전환 중 비동기 작업 | `HwpxEditor`의 generation/lifecycle 패턴을 적용 |
| 글꼴이 다르게 보임 | 사용자 환경의 설치 글꼴 | 로컬 글꼴 감지 없이 대체 글꼴을 쓰는 정책을 안내하고 결과 검증 |
