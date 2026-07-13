# 외부 연동 예제 최종 보안 수정 보고서

## 배경

최종 리뷰에서 iframe 편집 변경 감지, 저장 경쟁, 업로드 후 정리, HWPX 구조 검증, HTTP metadata 계약이 실제 보장보다 강하게 표현되거나 일부 실패 경로를 빠뜨린 문제가 확인됐다. 외부 프로젝트가 예제를 production 기준으로 복사하므로, 허위 보장을 제거하고 필수 보안 의존성과 운영 책임을 명확히 했다.

## 수정 결과

- SDK change event API가 생기기 전까지 수동 저장 모델만 제공하고 dirty 기반 버튼 제어와 이탈 경고를 제거했다.
- 문서 generation 격리를 유지하고 `saveMutexRef`로 같은 문서의 중복 저장을 막았다.
- 구조 validator가 성공하기 전에는 Storage에 업로드하지 않도록 필수 의존성으로 주입했다.
- commit conflict와 throw 모두 미참조 object 삭제를 시도하며 원 결과/오류를 보존한다.
- 삭제 실패는 `document_storage_gc_queue` durable 기록으로 넘기는 계약과 Supabase adapter를 추가했다.
- 공통/Next.js 클라이언트의 파일명 decode, canonical nonnegative safe integer version, quoted ETag 계약을 통일했다.
- `DocumentVersionConflictError`가 component의 `onError`로 전달되는 실제 동작에 맞게 README를 고쳤다.

## 구조 검증 경계

예제는 무거운 ZIP 라이브러리를 추가하지 않는다. 외부 프로젝트가 구현하는 `validateHwpxArchive`는 필수 entry, 안전한 entry 경로, entry 수, entry별/전체 uncompressed 크기, 압축 비율, XML 크기와 안전한 parser 설정을 저장 전에 강제해야 한다. no-op 구현은 허용하지 않는다.

## TDD와 검증

- RED: 공통 metadata 계약, 수동 저장 UI, commit throw cleanup, durable GC 기록, 저장 전 validator, 저장 응답 version 검증 테스트의 실패를 확인했다.
- GREEN: `rtk npm test` 24개 통과.
- TypeScript: 순수 예제 모듈 `document-repository.ts`, `lib/api/documents.ts`에 `tsc --noEmit` 통과.
- 형식: `rtk git diff --check` 통과.
- production build는 소유 범위 밖인 `rhwp-studio/**` 산출물을 만들 수 있어 실행하지 않았다.

## 변경 범위

요청된 `examples/external-integration/**`, `examples/nextjs-integration/**`, `tests/enkino-external-integration.test.mjs`와 이 보고서 및 필수 작업 로그만 수정했다. `npm/editor/**`, `rhwp-studio/**`는 수정하지 않았다.
