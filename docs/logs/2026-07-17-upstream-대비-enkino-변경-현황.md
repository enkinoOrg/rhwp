# upstream 대비 Enkino 변경 현황

## 배경

Enkino 저장소에 upstream `edwardkim/rhwp` 원본 외에 추가된 파일과 작업 범위를 확인했다. 현재 작업 브랜치는 `enkino/self-host`이며, 이 브랜치가 실제로 포함한 최신 upstream 기준점은 `upstream/main`의 `10f5c51e`다.

`upstream/devel`은 분기 이후 계속 진행되어 현재 브랜치보다 1,024개 커밋 앞서 있다. 따라서 이후 upstream 변경을 Enkino 변경과 혼합하지 않도록 `upstream/main@10f5c51e`와 현재 브랜치의 `HEAD`를 비교 기준으로 사용했다.

## 요약

- Enkino 전용 커밋: 26개
- 변경 파일: 48개
- 새 파일: 38개
- 기존 파일 수정: 9개
- 기존 파일 삭제: 1개
- 변경량: 6,253줄 추가, 188줄 삭제

## 추가한 주요 작업

### Cloudflare Workers 자체 호스팅

- 루트 `package.json`, `package-lock.json`
- `wrangler.jsonc`
- `rhwp-studio/public/_headers`
- `rhwp-studio/tests/enkino-host-policy.test.ts`

RHWP Studio를 `https://rhwp.enkinokorea.workers.dev`에서 빌드하고 배포하기 위한 설정과 호스트 정책 테스트를 추가했다.

### 외부 연동 SDK와 테스트

- `npm/editor/index.test.mjs`
- `tests/enkino-external-integration.test.mjs`
- `rhwp-studio/tests/post-message-security.test.ts`

SDK 수명주기, 메시지 출처 검증, 전달 가능한 바이너리 처리, HWPX ZIP/XML 검증을 다루는 테스트를 추가했다.

### 프레임워크 공통 연동 예제

- `examples/external-integration/README.md`
- `examples/external-integration/rhwp-client.ts`

RHWP Studio를 iframe과 `postMessage`로 연동하는 공통 클라이언트 예제를 추가했다.

### Next.js와 Supabase 연동 예제

`examples/nextjs-integration/` 아래에 다음 항목을 추가했다.

- `HwpxEditor.tsx` 편집기 연동 컴포넌트
- 문서 파일 API route
- 문서 repository와 Supabase Storage 구현
- 문서 버전 SQL
- HWPX ZIP/XML 검증기
- 문서 저장소 GC
- 보안 XML parser와 `fast-xml-parser` adapter

### Enkino 운영 문서

- `AGENTS.md`
- `docs/tech/architecture.md`
- `docs/tech/deployment.md`
- `docs/tech/integration-guide.md`
- `docs/tech/upstream-sync.md`
- `docs/planning/implementation-plan.md`
- `docs/logs/`의 Enkino 작업 기록
- `docs/superpowers/`의 설계와 구현 계획
- `.superpowers/sdd/`의 보안 검토 보고서

## 수정한 upstream 파일

- `.github/workflows/npm-publish.yml`: SDK 테스트 단계 보강
- `.gitignore`: Enkino 로컬 산출물 제외 규칙 추가
- `README.md`: Enkino 연동과 로드맵 안내
- `npm/editor/index.js`: SDK 수명주기, 메시지 보안, 전달 가능한 바이너리 처리
- `npm/editor/package.json`: SDK 패키지 설정 조정
- `npm/editor/README.md`: Enkino SDK 사용 안내
- `rhwp-studio/src/main.ts`: 호스트 메시지 처리와 보안 경계
- `rhwp-studio/tests/local-fonts-modal-copy.test.ts`: 로컬 글꼴 기본 동작 검증 조정
- `rhwp-studio/vite.config.ts`: 자체 호스팅 빌드 설정

## 삭제한 upstream 파일

- `.github/workflows/deploy-pages.yml`

GitHub Pages 배포를 제거하고 Cloudflare Workers만 운영 배포 대상으로 유지했다.

## 현재 로컬 상태

- `.gitignore`에 `.codegraph/` 제외 규칙을 추가한 변경은 아직 커밋하지 않았다.
- `.codegraph/`는 로컬에 존재하지만 Git에서 무시된다.
- CodeGraph 인덱스는 960개 파일, 21,625개 노드, 91,404개 관계이며 DB 크기는 66.02MB다.

## 확인 명령

```bash
rtk proxy git rev-list --left-right --count upstream/main...HEAD
rtk proxy git diff --name-status upstream/main...HEAD
rtk proxy git diff --stat upstream/main...HEAD
rtk proxy git log --format='%h %s' --reverse upstream/main..HEAD
rtk proxy codegraph status .
rtk proxy git check-ignore -v .codegraph
```

조사 시점의 비교 결과는 `upstream/main` 대비 upstream 전용 미포함 커밋 0개, Enkino 전용 커밋 26개였다.
