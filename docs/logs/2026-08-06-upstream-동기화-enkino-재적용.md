# 2026-08-06 Upstream 동기화 Enkino 재적용 작업 일지

이 문서는 2026-08-06에 진행된 오픈소스 rhwp 업스트림 동기화 및 Enkino 커스텀 기능 재적용 작업(Task 1 ~ Task 5)의 세부 커밋 내역, TDD 증거, 테스트 수치, 빌드 결과, npm audit 분석 및 배포/푸시 정책 준수 여부를 기록합니다.

## 1. 작업 개요 및 커밋 히스토리

본 작업은 `upstream/main` 기반 브랜치에서 Enkino 전용 호스팅 경계, SDK 계약, Studio 로드 대화상자 정책, HWPX 자동보정 잔여 경고 재검증 및 운영 문서를 체계적으로 재적용했습니다.

| Task | 커밋 SHA | 한국어 커밋 메시지 | 주요 내용 |
|------|-----------|-------------------|----------|
| Task 1 | `156618d46` | Enkino Cloudflare 호스팅 경계 복원 | Cloudflare Workers Static Asset 호스팅 설정(`wrangler.jsonc`, `public/_headers`), GitHub Pages workflow 제거 |
| Task 2 | `307592ed8` | 임베드 대화상자 억제를 명시 옵션으로 제한 | `@rhwp/editor` SDK `suppressDialogs: true` strict boolean opt-in 적용, upstream 기본 URL 및 transport 보존 |
| Task 3 | `cbb53c2` | Studio 로드 대화상자 정책 복원 | pure policy 모듈(`load-dialog-policy.ts`, `initial-autosave-policy.ts`) 분리, HWPX 검증 팝업 복원, 로컬 폰트 자동 팝업 제거, iframe 내 복구 팝업 건너뛰기 |
| Task 4 | `183f3e4c4` | HWPX 자동보정 후 잔여 경고 재검증 | DocumentCore 로딩 시 HWPX 자동보정(lineseg reflow) 후 `validate_linesegs` 재호출로 잔여 경고만 리포트에 유지 |
| Task 5 | (본 작업) | Enkino RHWP 운영 및 연동 문서 재구성 | `README.md`, `docs/tech/*` 문서 재구성 및 `tests/enkino-integration-docs.test.mjs` TDD 문서 계약 검증 |

## 2. TDD 사이클 및 RED/GREEN 증거

### Task 1: 호스팅 경계
- **RED**: `rhwp-studio/tests/enkino-host-policy.test.ts` 실행 시 `wrangler.jsonc` 및 `public/_headers` 부재로 `ENOENT` 실패.
- **GREEN**: 호스팅 정적 자산 설정 파일 추가 후 1 pass.

### Task 2: SDK `suppressDialogs`
- **RED**: `npm/editor/tests/load-file-options.contract.test.mjs` 실행 시 생략/문자열 `'true'` 전달 검증 실패.
- **GREEN**: `index.js` strict `options.suppressDialogs === true` 반영 후 24/24 pass.

### Task 3: Studio 대화상자 및 복구 정책
- **RED**: `rhwp-studio/tests/enkino-load-policy.test.ts` 및 `autosave-recovery-policy.test.ts` 실행 시 모듈 부재 실패.
- **GREEN**: pure policy 작성 및 `main.ts` 배선 후 표적 테스트 25/25 pass, Studio 전체 테스트 646/646 pass.

### Task 4: HWPX 자동보정 잔여 경고
- **RED**: HWPX 로딩 후 reflow 이전 검증 경고가 잔존하는 문제 확인.
- **GREEN**: `src/document_core/commands/document.rs` 재검증 반영 후 통합 테스트 2/2 pass, Rust `cargo test --lib` 2933/2933 pass.

### Task 5: 문서 계약
- **RED**: `tests/enkino-integration-docs.test.mjs` 실행 시 `docs/tech/architecture.md` 부재로 `ENOENT` 실패.
- **GREEN**: canonical 기술 문서 작성 완료 후 1/1 pass.

## 3. 테스트 카운트 및 빌드 검증

- **Node.js Integration Docs Test**: 1 pass (`rtk proxy node --test tests/enkino-integration-docs.test.mjs`)
- **SDK Contract Tests**: 24 pass (`rtk proxy node --test npm/editor/tests/*.test.mjs`)
- **Studio TypeScript Tests**: 646 pass (`rtk proxy npm --prefix rhwp-studio test`)
- **Rust Library Unit Tests**: 2933 pass (`rtk cargo test --lib`)
- **Dry-Run Build Check**: `wrangler.jsonc` 설정 및 Static Assets 바인딩 확인 (`npm run deploy:dry-run`)

## 4. 미해결 npm audit 분석

`npm audit` 실행 결과:
- **vulnerabilities**: 4 high severity (`sharp <0.35.0`, `miniflare`, `undici`, `wrangler 4.110.0`)
- **원인 분석**: 개발 의존성(`devDependencies`)인 Wrangler 로컬 개발 도구 모듈의 간접 의존성에서 발생한 감사 항목임.
- **영향 범위**: 프로덕션 배포 자산(`rhwp-studio/dist` 및 `@rhwp/editor` npm 패키지)에는 포함되지 않음.
- **조치 방안**: 업스트림 고정 잠금 파일(`package-lock.json`) 및 Wrangler 버전(`4.110.0`)의 호환성을 보존하기 위해 임의의 `npm audit fix --force`를 수행하지 않고 기존 상태 유지.

## 5. 배포 및 푸시 정책 이행 명세

- **원격 푸시(git push) 수행 금지**: 본 작업 과정에서 `git push` 또는 원격 브랜치 변경 명령을 일절 수행하지 않음.
- **배포(wrangler deploy) 수행 금지**: 실제 Cloudflare Workers 서비스 배포를 실행하지 않고 `deploy:dry-run` 및 로컬 계약 검증만 진행함.
