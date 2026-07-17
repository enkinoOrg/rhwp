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
- 안전한 명시 경계까지 확장한 최종 통합 fixture는 다섯 역할을 실제 추출하는 `samples/rowbreak-problem-pages.hwpx`, 경계 `1:36`이다. 인위적인 프로파일 보충은 제거했다.
- CLI 프로세스가 이 fixture를 패치해 출력 파일을 만들고 즉시 재로드하는 동작을 검증한다.
- 원본에 존재하는 `version.xml`, `settings.xml`, `Preview/PrvText.txt`, `Preview/PrvImage.png` passthrough 엔트리는 출력 ZIP에서 바이트 동일성을 검증한다.
- `Contents/content.hpf`는 metadata, manifest의 리소스 ID/href/MIME/embedded 의미, spine 참조 순서를 비교한다. `image/jpg`와 `image/jpeg`는 의미 동등으로 정규화한다.
- 경계 이전 모든 문단의 텍스트·스타일 참조·controls 심층 표현과 패치 전후 `doc_info`/BinData 심층 표현을 비교한다.
- 통합 테스트 결과: 6 passed, 0 ignored.
- 관련 템플릿 컴파일러 테스트: 11 passed, 0 ignored.
- 최종 전체 테스트: 2563 passed, 22 ignored. Task 4 ignored는 0건이며 22건은 기존 테스트다.
- 최종 release build와 `git diff --check`: 성공.

## CLI 입력과 경계 선택 검토

- `.hwpx` 확장자만 허용하고 ZIP `mimetype`이 `application/hwp+zip`인지 확인한다.
- `.hwp` 입력과 HWP 바이트를 `.hwpx`로 바꾼 입력을 모두 fail-loud로 거부한다.
- 사용자 경계가 추천 후보 좌표와 같으면 추천 후보의 score, preview, reasons를 `selectedBoundary`로 재사용한다.
- 추천 후보와 다르면 `user-selected boundary` 근거를 가진 별도 `selectedBoundary`를 JSON으로 출력한다.
- 최종 검증: Task 4 통합 6 passed/0 ignored, 관련 템플릿 컴파일러 11 passed, 전체 2567 passed/22 ignored, release build와 diff check 성공. ignored 22건은 기존 테스트다.
