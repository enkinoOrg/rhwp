# 외부 웹 프로젝트 RHWP 연동 가이드 설계

## 배경

공용 RHWP Studio는 `https://rhwp.enkinokorea.workers.dev`에 배포되어 여러 프로젝트에서 iframe으로 사용할 수 있다. 현재 아키텍처 문서에는 호스트와 연동 프로젝트의 책임 경계만 간략히 기록되어 있어, 외부 프로젝트 개발자가 HWPX 파일 조회부터 편집 결과 저장까지 구현하려면 소스와 기존 프로젝트를 추가로 분석해야 한다. 설치, API, 저장, 인증, 충돌 처리와 운영 검증을 한 흐름으로 설명하는 상세 가이드가 필요하다.

## 목표

- 프레임워크에 독립적인 최소 연동 흐름을 제공한다.
- Next.js App Router 기반의 production 수준 전체 예제를 제공한다.
- 저장소 독립형 인터페이스와 Supabase private Storage 구현을 함께 설명한다.
- RHWP 호스트가 문서를 저장하거나 사용자 권한을 관리하지 않는다는 경계를 명확히 한다.
- 예제 코드는 문서 설명과 분리해 타입 검사와 테스트가 가능한 형태로 둔다.

## 산출물

### 상세 가이드

`docs/tech/integration-guide.md`에 다음 내용을 작성한다.

1. 전체 아키텍처와 데이터 흐름
2. RHWP 호스트와 외부 프로젝트의 책임 경계
3. `@rhwp/editor` 설치와 `studioUrl` 설정
4. HWPX 조회, iframe 로드, 편집, export, 저장 흐름
5. 파일명, 확장자, MIME type 처리
6. 저장 상태와 사용자 이탈 방지
7. Next.js Client Component와 Route Handler 구현
8. 저장소 독립형 repository 계약
9. Supabase private Storage와 문서 버전 테이블 구현
10. 인증, 권한 검증, 세션 만료 처리
11. 낙관적 잠금과 버전 충돌 처리
12. 원본 보존, 새 버전 저장, 자동 저장 정책
13. 오류 처리와 재시도 기준
14. 대용량 파일과 브라우저 메모리 고려사항
15. CORS, CSP, iframe, `postMessage` 보안 주의사항
16. HWP와 HWPX export 차이
17. 테스트 전략과 운영 체크리스트
18. 문제 해결 표

README와 `docs/tech/architecture.md`에는 상세 가이드 링크를 추가한다.

### 프레임워크 공통 예제

`examples/external-integration/`에 브라우저에서 이해할 수 있는 최소 예제를 둔다.

- editor 생성
- ArrayBuffer 기반 HWPX 로드
- 수정 결과 `exportHwpx()` 호출
- 외부 저장 API에 bytes 전송
- editor 정리
- loading, dirty, saving, error 상태 처리

이 예제는 특정 인증·저장소에 종속되지 않으며 API 계약을 설명하는 기준 구현으로 사용한다.

### Next.js 전체 예제

`examples/nextjs-integration/`에 다음 경계를 분리한다.

- Client Component: editor lifecycle과 사용자 작업
- `lib/api`: 파일 조회와 저장 HTTP 호출
- Route Handler: 세션·권한·입력 검증과 HTTP 응답
- repository: 문서 메타데이터 및 version 비교
- storage adapter: Supabase private Storage 입출력
- SQL 예시: 문서와 append-only 버전 메타데이터

예제는 별도 완성형 앱을 만들지 않고 복사 가능한 모듈 단위로 제공한다. 필요한 환경 변수와 패키지는 예제 README에 명시한다.

## 핵심 계약

### 조회

- 외부 프로젝트 API가 인증과 문서 조회 권한을 검증한다.
- 서버가 private Storage에서 HWPX bytes를 읽어 `application/haansofthwpx`로 반환한다.
- Client Component가 응답을 `ArrayBuffer`로 변환해 `editor.loadFile(bytes, fileName)`에 전달한다.

### 저장

- Client Component가 `editor.exportHwpx()`를 호출한다.
- 반환된 `Uint8Array`를 외부 프로젝트 API에 PUT한다.
- 요청은 기준 `version`을 포함한다.
- 서버가 세션, 수정 권한, 확장자, MIME, 크기, 기준 version을 검증한다.
- version이 일치할 때만 새 Storage object와 append-only version row를 만든다.
- metadata의 현재 version 포인터는 같은 트랜잭션 경계에서 갱신한다.
- 충돌 시 `409 Conflict`를 반환하고 기존 버전을 덮어쓰지 않는다.

## 보안 원칙

- RHWP 호스트에는 사용자 token, signed URL, 문서 식별자를 전달하지 않는다.
- 문서 bytes는 부모 페이지가 iframe에 직접 전달한다.
- 인증과 권한은 외부 프로젝트 서버에서 매 요청마다 검증한다.
- Supabase service role key는 서버 전용으로 유지한다.
- Storage bucket은 private으로 운영한다.
- 파일명과 object path는 서버가 생성하고 클라이언트 입력을 그대로 사용하지 않는다.
- export 결과는 신뢰하지 않고 서버에서 크기, 파일 시그니처, 허용 포맷을 다시 검증한다.
- 부모 프로젝트는 `frame-src https://rhwp.enkinokorea.workers.dev`를 CSP에 허용해야 한다.

## 오류 처리

- editor 초기화 실패, 파일 조회 실패, load 실패, export 실패, 저장 실패를 별도 상태로 구분한다.
- 인증 만료는 재로그인을 유도하고 자동 재시도로 숨기지 않는다.
- 네트워크 오류는 같은 version을 유지한 상태에서 명시적 재시도를 허용한다.
- `409 Conflict`는 최신 문서 재조회 또는 별도 사본 저장을 선택하게 한다.
- 저장 성공 전 dirty 상태를 해제하지 않는다.
- editor를 파괴하거나 페이지를 이동하기 전에 미저장 변경을 경고한다.

## 테스트 설계

- 공통 예제: lifecycle, load, export, 저장 payload, cleanup 검증
- Client Component: 초기화, 조회, 저장, 오류, version 충돌 상태 검증
- Route Handler: 미인증, 권한 없음, 잘못된 포맷, 크기 초과, version 충돌, 저장 성공 검증
- repository: 낙관적 잠금과 append-only version 생성 검증
- 통합 확인: 실제 공용 Studio에서 HWPX 로드, 편집, export, 재로드

## 완료 기준

- 외부 프로젝트 개발자가 가이드만 보고 최소 연동과 Next.js production 연동을 구현할 수 있다.
- 모든 코드 블록은 실제 예제 파일과 대응하거나 명확히 의사 코드로 표시된다.
- HWPX 조회부터 새 버전 저장까지 요청·응답과 오류 상태가 빠짐없이 정의된다.
- Supabase 예제는 private Storage, server-only service role, append-only version 정책을 지킨다.
- README와 아키텍처 문서에서 상세 가이드로 이동할 수 있다.
- 예제의 정적 검사 또는 집중 테스트가 통과한다.

## 제외 범위

- 독립 실행 가능한 별도 Next.js 데모 애플리케이션
- RHWP Worker에 파일 저장 API 추가
- 사용자 인증 시스템 구현
- 실시간 공동 편집
- HWPX 내용의 서버 측 의미 분석 또는 병합
- 특정 외부 프로젝트의 DB migration 직접 적용
