# HWPX 템플릿 컴파일러 1단계 검증

## 대상과 구현

- 최초 분석 fixture: `samples/hwpx_sample2.hwpx`
- CLI: `rhwp template-spike <template.hwpx> [--boundary S:P -o output.hwpx]`
- 경계를 생략하면 스타일 프로파일과 최대 3개의 경계 후보 JSON만 출력하며 파일을 쓰지 않는다.
- 경계를 지정하면 고정된 다섯 초안 블록을 패치하고 HWPX 직렬화 직후 `DocumentCore::from_bytes`로 재로드한다.
- 미지원 컨트롤 또는 누락 역할은 패처 오류를 그대로 표시하고 non-zero로 종료한다.

## 최초 fixture 분석 결과

- 추출 역할: `Body`, `Detail`, `SectionHeading`, `SubsectionHeading`
- 누락 역할: `KeyPoint` (`○` 마커 스타일이 fixture에서 추출되지 않음)
- 추천 경계: `0:168`, `0:217`, `0:44` (점수 순)
- 추천 1순위 `0:168` 뒤의 `0:181`에 표 컨트롤이 있어 안전한 꼬리 삭제가 불가능하다.
- 계획의 예시 경계 `0:0`에는 구역 정의 컨트롤이 있어 즉시 거부된다.

따라서 최초 fixture에서는 다섯 역할 패치를 안전하게 완료할 수 없었다. 표·구역 정의를 임의 삭제하거나 `KeyPoint` 스타일을 다른 역할로 대체하지 않았고, 후속 전수 검사로 통합 fixture를 교체했다.

## 검증

- `cargo test --test template_compiler_phase1`: 성공, 0 passed, 1 ignored
- 분석 CLI: JSON에 4개 역할과 3개 경계 후보 출력 확인
- `--boundary 0:0`: 예상대로 구역 정의 컨트롤을 보고하고 exit 1
- `cargo test`: 2561 passed, 23 ignored (Task 4 신규 ignored 1건 포함)
- `cargo build --release`: 성공, release profile 완료
- `git diff --check`: 성공

배포는 사용자 요청이 없어 실행하지 않았다.

## 알려진 한계

- Phase 1 패처는 선택 경계 이후 컨트롤이 하나라도 있으면 전체 패치를 거부한다.
- 다섯 고정 블록을 쓰려면 다섯 역할이 모두 추출되어야 한다.
- 최초 fixture는 두 조건을 모두 충족하지 않으며, 후속 통합 테스트는 별도의 안전 fixture를 사용한다.

## 후속 fixture 전수 검사와 통합 검증

- `samples/**/*.hwpx` 125개를 경로순으로 전수 검사했으며 모두 `DocumentCore::from_bytes`로 파싱됐다.
- 분석기가 다섯 역할을 모두 추출한 fixture는 3개였다: `hwp3-sample16-hwp5.hwpx`, `hwpx/aift.hwpx`, `rowbreak-problem-pages.hwpx`.
- 분석기 검증은 `samples/hwpx/aift.hwpx`로 분리해 다섯 역할을 모두 확인한다.
- 안전한 추천 경계에서 패치·직렬화·재로드가 성공한 fixture는 9개였고, 통합 검증에는 작은 `samples/hwpx/para-unit-01.hwpx`와 경계 `0:2`를 사용했다.
- 통합 fixture는 `Body`만 추출하므로, 분석된 유효 `Body` 스타일을 누락 역할에 보충한 테스트 프로파일을 사용한다. 패치·직렬화·재로드는 제품 공개 API를 그대로 호출한다.
- `version.xml`, `settings.xml`, `Preview/PrvText.txt`, `Preview/PrvImage.png`는 재로드 후 원본 바이트와 동일하다. `Contents/content.hpf`는 본문 의존 manifest라 serializer가 재생성하도록 설계되어 동일성 비교에서 제외했다.
- 통합 테스트 결과: 2 passed, 0 ignored.
- 관련 템플릿 컴파일러 테스트: 11 passed, 0 ignored.
- 최종 전체 테스트: 2563 passed, 22 ignored. Task 4 ignored는 0건이며 22건은 기존 테스트다.
- 최종 release build와 `git diff --check`: 성공.
