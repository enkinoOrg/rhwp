# Task 4 보고서

## 상태

DONE

## 구현

- `template-spike` CLI 분석/패치/직렬화/즉시 재로드 경로를 추가했다.
- 실제 fixture 통합 테스트와 운영 로그를 추가했다.
- 안전장치를 우회하거나 fixture 내용을 삭제하지 않았다.

## RED / GREEN

- RED: 실제 fixture의 추천 경계 패치가 `UnsupportedStructure { section: 0, paragraph: 181, kind: "표" }`로 실패함을 확인했다.
- GREEN: 분석 전용 CLI가 스타일 프로파일과 최대 3개 후보 JSON을 출력한다.
- 최초 fixture에서는 `KeyPoint` 역할이 추출되지 않고 추천 경계 뒤 표가 있어 통합 fixture를 후속 전수 검사로 교체했다.

## 검증

- 최초 검증 `cargo test --test template_compiler_phase1`: 0 passed, 1 ignored
- 분석 CLI: 역할 4개, 후보 3개 확인
- 예시 패치 CLI `--boundary 0:0`: 구역 정의 컨트롤로 exit 1 (예상된 안전 거부)
- `cargo test`: 2561 passed, 23 ignored (기존 ignored 22건 + Task 4 신규 1건)
- `cargo build --release`: 성공
- `git diff --check`: 성공
- 최초 fixture의 생성 HWPX 재로드/보존 검증은 불가했으며 후속 fixture로 교체했다.

## 자체 검토

- Task 4 지정 파일 외 제품 코드는 `src/main.rs`만 수정했다.
- 기존 공개 API만 사용했다.
- 옵션 파싱과 오류는 fail-loud이며 분석 모드에서는 출력 파일을 만들지 않는다.
- 최초 ignored 원인과 후속 fixture 교체 근거를 모두 기록했다.

## 후속 통합 검증

- `samples/**/*.hwpx` 125개 전부 파싱, 다섯 역할 추출 fixture 3개 확인.
- 안전 경계 patch/export/reload 성공 fixture 9개 확인.
- 분석기 검증: `samples/hwpx/aift.hwpx`, 다섯 역할 모두 추출.
- 통합 검증: `samples/hwpx/para-unit-01.hwpx`, 경계 `0:2`, 테스트용 프로파일 보충 후 제품 API patch/set/export/reload 성공.
- RED: `para-unit-01.hwpx`의 전체 `hwpx_aux_entries` 비교는 본문 의존 `Contents/content.hpf` 재생성 때문에 실패했다.
- GREEN: serializer의 passthrough 계약 대상 4개 auxiliary 엔트리의 원본 바이트 보존과 경계 앞 IR 보존, 초안 텍스트 재로드를 검증한다.
- `cargo test --test template_compiler_phase1`: 2 passed, 0 ignored.
- 관련 템플릿 컴파일러 테스트: 11 passed, 0 ignored.
- 전체 테스트: 2563 passed, 22 ignored. Task 4 ignored는 0건이다.
- release build: 성공.
- `git diff --check`: 성공.
