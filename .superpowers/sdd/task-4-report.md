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
- 최종 통합 검증: `samples/rowbreak-problem-pages.hwpx`, 명시 경계 `1:36`, 실제 추출된 다섯 역할만 사용해 CLI와 제품 API patch/set/export/reload 성공.
- RED: HWP 입력이 성공 종료하고, 비추천 사용자 경계가 JSON에 기록되지 않으며, 전체 aux 바이트 비교가 재생성 `content.hpf` 때문에 실패했다.
- GREEN: 확장자+ZIP mimetype 검증, `selectedBoundary` 근거 출력, passthrough aux 바이트 보존, `content.hpf` metadata/manifest/spine 의미 보존, 경계 앞 controls와 전역 리소스 불변을 검증한다.
- `cargo test --test template_compiler_phase1`: 6 passed, 0 ignored.
- 관련 템플릿 컴파일러 테스트: 11 passed, 0 ignored.
- fixture 교체 직후 중간 전체 테스트: 2563 passed, 22 ignored. Task 4 ignored는 0건이다.
- release build: 성공.
- `git diff --check`: 성공.

## 전체 리뷰 반영 검증

- HWPX 확장자와 ZIP mimetype을 모두 검사하고 HWP 및 확장자 위장 HWP를 거부한다.
- 실제 다섯 역할 profile과 안전한 명시 경계를 가진 `rowbreak-problem-pages.hwpx`로 CLI 프로세스 성공, 파일 생성, 재로드를 검증한다.
- 추천 후보 선택은 기존 score/preview/reasons를 재사용하고 비추천 경계는 `user-selected boundary` 이유를 출력한다.
- 경계 이전 controls 심층 표현, `doc_info`, BinData 의미 불변을 검증한다.
- passthrough aux는 원본에 존재하는 엔트리의 ZIP 바이트 동일성을 검증한다.
- `content.hpf`는 metadata와 manifest 리소스 참조 및 spine 순서의 의미 동일성을 검증한다.
- Task 4 통합: 6 passed, 0 ignored.
- 관련 템플릿 컴파일러: 11 passed.
- 전체: 2567 passed, 22 ignored. ignored 22건은 기존 테스트다.
- release build와 `git diff --check`: 성공.

## 재로드 의미 projection 후속

- RED: 원본 IR과 재로드 IR의 controls 전체 Debug 비교가 serializer의 raw 예약 필드와 내부 상태 정규화 때문에 실패했다.
- GREEN: 원본을 동일 serializer로 export/reload한 canonical 기준선과 패치 출력 재로드를 비교한다.
- 비교 대상은 경계 전 모든 문단의 텍스트·문단 모양·글자 모양 구간·controls 전체 심층 표현, `doc_info`, BinData다.
- 제외 대상은 동일 serializer 통과 전후에만 달라지는 raw 예약 필드, dirty/cache 상태와 파서 재구성 내부값이다. 의미 필드 자체를 삭제하는 projection은 사용하지 않는다.
- 최종 Task 4: 6 passed, 0 ignored.
- 관련 템플릿 컴파일러: 11 passed.
- 전체: 2567 passed, 22 ignored. 기존 기준선 ignored 22건만 존재하고 Task 4 신규 ignored는 0건이다.
- release build와 `git diff --check`: 성공.
