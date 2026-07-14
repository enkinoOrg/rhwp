# Next.js App Router와 Supabase RHWP 연동 예제

## 배경

외부 서비스가 공용 RHWP Studio에서 HWPX를 편집하면서도 문서 ID, 인증 token, Supabase signed URL을 RHWP 호스트에 전달하지 않기 위한 복사형 production 예제입니다. 이 디렉터리는 실행 가능한 앱이나 migration이 아니며, 각 외부 프로젝트의 인증과 데이터 모델에 맞게 검토 후 복사합니다.

RHWP Studio URL은 `https://rhwp.enkinokorea.workers.dev/`입니다. Studio에는 편집 UI만 연결하고, 문서 bytes는 외부 서비스의 동일 출처 API에서만 주고받습니다.

## 필요한 패키지와 환경 변수

```bash
npm install @rhwp/editor@^0.7.19 @supabase/supabase-js
```

iframe 메시지 origin/source 검증과 요청 정리 계약이 반영된 SDK 최소 버전은 `0.7.19`입니다.

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
server/document-storage-gc.ts
server/supabase-document-storage.ts
server/validate-hwpx-archive.ts
sql/document-versions.sql
```

`lib/rhwp-client.ts`에는 [`examples/external-integration/rhwp-client.ts`](../external-integration/rhwp-client.ts)의 `RHWP_STUDIO_URL` export를 복사합니다. 이 저장소의 `HwpxEditor.tsx`는 예제끼리의 상대 경로를 사용하므로, 외부 프로젝트에서는 해당 import를 `../lib/rhwp-client`로 변경합니다.

`route.ts`의 `@/server/auth/document-access` import를 프로젝트의 인증 helper로 바꿉니다. `requireSession()`은 매 요청 세션에서 사용자 ID를 반환해야 하고, `assertCanReadDocument(userId, documentId)`와 `assertCanEditDocument(userId, documentId)`는 대상 문서별 권한을 확인해야 합니다. URL의 `documentId`만 신뢰하면 IDOR가 되므로, 조회와 저장 모두 이 검사를 생략하지 않습니다.

실제 fail-closed 정책은 [`server/validate-hwpx-archive.ts`](server/validate-hwpx-archive.ts)에 있습니다. Route는 프로젝트의 `@/server/security/zip-inspector`가 export한 `zipInspector`를 `createHwpxArchiveValidator(zipInspector)`에 주입합니다. 이 adapter는 유지보수되는 검증된 ZIP 라이브러리로 중앙 directory와 제한된 실제 압축 해제를 처리하고 `ZipInspector` interface로 변환해야 합니다. 예제 안에서 ZIP binary를 직접 parse하거나 no-op inspector를 사용하면 안 됩니다.

## 실행 흐름

1. `HwpxEditor`는 공용 Studio URL로 editor만 만들고 같은 출처 `GET /api/documents/:id/file`로 HWPX를 읽습니다.
2. Route Handler는 세션과 read 권한을 확인한 뒤 서버 전용 service role로 private bucket에서 bytes를 가져옵니다. `Content-Disposition`은 ASCII fallback과 RFC 5987 `filename*`을 함께 보내며, `X-Document-File-Name`은 `encodeURIComponent` 값이므로 client가 `decodeURIComponent`로 복원합니다.
3. 저장 시 component는 `editor.exportHwpx()` 결과와 canonical quoted ETag `If-Match: "3"`을 같은 출처 `PUT`으로 보냅니다. version은 선행 0 없이 표현한 nonnegative safe integer만 허용합니다.
4. Route Handler는 세션, edit 권한, MIME type과 50MB 전송 크기를 확인합니다. `Content-Length`가 있으면 canonical nonnegative safe integer인지 먼저 검사해 초과 요청은 body를 읽지 않고 `413`으로 끝냅니다. header가 없거나 작게 위조된 경우에도 body stream을 chunk 단위로 읽고 50MB를 넘는 즉시 cancel한 뒤 `413`으로 끝냅니다. body가 없거나 비어 있으면 `400`입니다.
5. repository는 필수 `validateHwpxArchive` hook이 HWPX 구조 검증을 완료한 뒤에만 새 고유 Storage object를 만듭니다. SQL RPC는 기준 version 비교, append-only `document_versions` insert, `documents.current_version` 변경을 한 트랜잭션으로 처리합니다.
6. 기준 version이 다르면 API는 `409 Conflict`를 반환하고 기존 원본을 덮어쓰지 않습니다. `saveDocumentFile`이 만든 `DocumentVersionConflictError`는 component 내부에서 소비되지 않고 `onError` callback으로 전달되므로, 부모가 최신 문서 재조회 UI를 보여 줍니다.

## HWPX 구조 검증 계약 예시

4바이트 ZIP signature는 구조 검증이 아닙니다. `validateHwpxArchive` 구현은 Storage 저장 전에 최소한 다음 계약을 모두 검사해야 합니다.

- 필수 entry: `mimetype`, `version.xml`, `Contents/content.hpf`, `Contents/header.xml`, `Contents/section0.xml`, `META-INF/manifest.xml`
- `mimetype` 내용이 허용한 HWPX media type과 정확히 일치하는지 확인
- entry 수 상한 기본 256개
- 절대 경로, `..`, 역슬래시, NUL, 중복 정규화 경로를 거부하고 경로를 archive 밖으로 확장하지 않기
- entry별 uncompressed 크기 상한 기본 20MB, 전체 uncompressed 크기 상한 기본 100MB
- XML 및 HPF entry별 크기 상한 기본 10MB
- 암호화 entry, 지원하지 않는 압축 방식, 중앙 directory와 실제 stream metadata 불일치 거부

수치는 서비스 정책에 맞게 더 낮출 수 있지만 상한을 제거하면 안 됩니다. `ZipInspector` adapter는 metadata를 그대로 전달하지 말고 제한된 stream으로 실제 압축 해제 byte 수를 검증해 `uncompressedSize`를 제공해야 합니다. 위 계약을 지원하는 ZIP 도구가 이미 있다면 그것을 adapter로 감싸고, 이 복사형 예제 때문에 새 무거운 라이브러리를 추가하지 않습니다.

## 편집 변경과 저장 모델

RHWP Studio는 iframe에서 동작하고 현재 SDK에는 부모로 전달되는 change event API가 없습니다. 부모 컨테이너의 `onInput`은 iframe 내부 변경을 감지하지 못하므로 `HwpxEditor`는 dirty 상태와 이탈 경고를 제공하지 않습니다. change event API가 생기기 전까지 저장 버튼을 직접 누르는 수동 저장 모델이며, 저장하지 않은 편집본 보존을 보장하지 않습니다. 저장 중 중복 호출은 `saveMutexRef`가 막고, 문서 전환 중 완료된 이전 저장은 generation 검사가 현재 문서 상태를 갱신하지 못하게 합니다.

## SQL 적용 전 검토

`sql/document-versions.sql`은 예제입니다. 운영 DB에 적용하기 전 기존 `documents` 스키마, 사용자 ID 타입, RLS 정책, service role 권한, private bucket 이름을 검토합니다. `create_document_version` RPC는 document 행을 잠근 뒤 version 행을 추가하고 current version을 갱신합니다. version 행은 trigger로 update와 delete를 차단합니다.

업로드 object는 DB 커밋보다 먼저 새 고유 key에 생성됩니다. 명시적인 conflict는 미참조 object를 정리하지만 `commitNewVersion` throw는 **commit-unknown**입니다. repository는 `resolveVersionCommit({ documentId, version, storagePath })`로 document row lock 이후 commit 상태를 재조회합니다. `committed`면 저장 성공을 복구하고, `not-committed`일 때만 즉시 삭제하며, 조회 실패 또는 `unknown`이면 삭제하지 않고 `document_storage_gc_queue`에 `commit-unknown`으로 기록합니다.

예약 GC는 [`server/document-storage-gc.ts`](server/document-storage-gc.ts)의 `collectDocumentStorageGarbage` 계약을 사용합니다. 이 함수도 삭제 직전에 같은 DB 재조회 API를 호출하고 `not-committed`일 때만 object를 삭제합니다. `committed`면 queue만 완료 처리하고, 조회 실패나 `unknown`이면 object와 queue를 유지합니다. cleanup이나 GC 기록 실패가 conflict 응답 또는 원래 commit 오류를 덮어쓰면 안 됩니다.

`documents`, `document_versions`, `document_storage_gc_queue`는 RLS를 활성화하고 외부 역할의 테이블 권한을 회수합니다. adapter에 필요한 `documents`의 `SELECT`와 GC queue 작업 권한만 `service_role`에 부여하며, version 이력의 insert와 current version update는 테이블 직접 접근이 아니라 아래 RPC만 수행합니다. 따라서 anon/authenticated Data API 요청으로 route의 세션·문서 권한 경계를 우회할 수 없습니다.

RPC는 `security definer`로 동작하지만 owner는 `service_role`이 아닌 통제된 DB owner(`postgres`)로 고정하고, `PUBLIC`, `anon`, `authenticated`의 실행 권한을 제거한 뒤 `service_role`에만 `EXECUTE`를 부여합니다. 이 권한은 Route Handler가 매 요청 세션·문서 권한을 검증한다는 전제에서만 안전합니다.

## 제한과 운영 확인

MIME type과 파일 크기 검사는 HWPX 구조를 보장하지 않습니다. 필수 구조 validator와 GC worker를 운영 배포에 함께 포함해야 합니다. 운영 전에는 다음을 확인합니다.

- 인증 helper가 401과 403을 프로젝트 정책에 맞게 응답하는지
- Storage bucket이 private이고 service role key가 server-only 경계 밖으로 노출되지 않는지
- `409` 수신 시 저장을 자동 재시도하지 않고 최신본 재조회 흐름을 제공하는지
- 구조 validator가 필수 entry와 archive/XML 제한을 저장 전에 강제하는지
- `document_storage_gc_queue`를 재처리하고 실패 횟수를 관측하는 예약 작업이 있는지
- RHWP host 요청에 document ID, token, signed URL이 포함되지 않는지

## 예제 검증 범위

`tests/enkino-external-integration.test.mjs`는 Node 내장 TypeScript strip mode(Node 22.6 이상)를 사용해 추가 런타임 의존성 없이 순수 helper를 실행합니다. 이 테스트는 한글 파일명으로 실제 `Headers`와 `Response`를 만들고, cleanup 실패 후에도 repository가 conflict 결과를 반환하며, chunked body가 제한을 넘을 때 stream을 cancel하는지를 검증합니다.

별도 실행 Next.js 앱을 만들지 않는 예제이므로 Route Handler 전체를 실제 인증·Supabase 환경에서 실행하는 통합 테스트는 포함하지 않습니다. 각 외부 프로젝트는 인증 helper, RLS 적용 결과, private bucket 권한과 production 요청 흐름을 해당 프로젝트 환경에서 추가 검증해야 합니다.
