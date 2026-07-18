# HWPX 템플릿 컴파일러 독립 저장소 이전

## 배경

RHWP에 임시로 구현했던 HWPX 템플릿 분석·패치 기능을 독립 도구로 이전하고, 동등성 검증이 끝난 뒤 RHWP의 변환기 전용 코드를 제거했다.

- 독립 저장소: `/Users/mhj/enkinokorea/2026/md-to-hwpx`
- 검증 커밋: `b12fea0053986649cd8b653a73458957eb35c25b`
- 제거 대상: `src/document_core/template_compiler/`, `tests/template_compiler_phase1.rs`
- 공개·CLI 제거: `src/document_core/mod.rs`의 모듈 공개 선언과 `src/main.rs`의 `template-spike` 전용 코드

## 검증

- 제거 전 독립 게이트: `cargo test --manifest-path /Users/mhj/enkinokorea/2026/md-to-hwpx/Cargo.toml` 통과(단위 11개, 통합 7개, ignored 0)
- 제거 범위 검사: `template_compiler|template-spike|template_spike` 검색 결과 0건
- RHWP Rust: `cargo test` 통과, 기존 ignored 22개 외 신규 ignored 없음
- JavaScript SDK: 8/8 통과, skipped 0
- 외부 연동: 32/32 통과, skipped 0
- production build: `npm run build` 종료 코드 0

JavaScript 최초 실행에서는 Studio 의존성이 설치되지 않아 fixture TypeScript 컴파일 테스트가 1건 실패했다. `rhwp-studio/package-lock.json` 기준으로 `npm ci`를 실행한 뒤 전체 테스트를 다시 수행해 40/40 통과를 확인했다. 추적 파일 변경은 없었다.
