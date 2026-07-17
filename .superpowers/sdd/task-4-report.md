# Task 4 보고서

## 상태

DONE_WITH_CONCERNS

## 구현

- `template-spike` CLI 분석/패치/직렬화/즉시 재로드 경로를 추가했다.
- 실제 fixture 통합 테스트와 운영 로그를 추가했다.
- 안전장치를 우회하거나 fixture 내용을 삭제하지 않았다.

## RED / GREEN

- RED: 실제 fixture의 추천 경계 패치가 `UnsupportedStructure { section: 0, paragraph: 181, kind: "표" }`로 실패함을 확인했다.
- GREEN: 분석 전용 CLI가 스타일 프로파일과 최대 3개 후보 JSON을 출력한다.
- 제한: fixture에서 `KeyPoint` 역할이 추출되지 않으며 추천 경계 뒤 표가 있어 실제 패치/재로드 테스트는 ignored로 유지했다.

## 검증

- `cargo test --test template_compiler_phase1`: 0 passed, 1 ignored
- 분석 CLI: 역할 4개, 후보 3개 확인
- 예시 패치 CLI `--boundary 0:0`: 구역 정의 컨트롤로 exit 1 (예상된 안전 거부)
- `cargo test`: 2561 passed, 23 ignored (기존 ignored 22건 + Task 4 신규 1건)
- `cargo build --release`: 성공
- `git diff --check`: 성공
- 생성 HWPX 재로드/보존 검증: fixture 제약으로 실행 불가, ignored 테스트에 보존

## 자체 검토

- Task 4 지정 파일 외 제품 코드는 `src/main.rs`만 수정했다.
- 기존 공개 API만 사용했다.
- 옵션 파싱과 오류는 fail-loud이며 분석 모드에서는 출력 파일을 만들지 않는다.
- 실제 패치 성공을 주장하지 않으며 ignored 테스트를 숨기지 않는다.
