# Task 1 구현 보고서

## 구현

- `TemplateRole`, `RoleStyle`, `StyleProfile` 도메인 타입과 직렬화 형태를 추가했다.
- 문단의 `para_shape_id`와 첫 `CharShapeRef.char_shape_id` 조합을 결정적으로 집계해 본문 스타일을 선택한다.
- `○`, `-` 시작 문단을 각각 핵심 사항과 세부 사항으로 분류한다.
- 번호 패턴, 본문 대비 글자 크기, 굵기, 문단 앞뒤 간격을 점수화해 최대 두 제목 단계를 선택하고 적용 규칙을 근거로 기록한다.
- 빈 문단과 글자 모양 참조가 없는 문단은 분석 대상에서 제외하며, 동률은 작은 스타일 ID 우선으로 해소한다.

## TDD 및 검증

- RED: `rtk cargo test template_compiler::profile::tests::extracts_four_phase1_roles_from_repeated_paragraphs`에서 분석 함수와 도메인 타입 부재로 실패하는 것을 확인했다.
- GREEN: 최소 구현 후 같은 테스트가 통과했다.
- `rtk cargo fmt --check`: 통과
- `rtk cargo test template_compiler::profile`: 통과
- `rtk cargo test --lib`: 통과, skipped 0
- `rtk git diff --check`: 통과

## 자체검토

- 요구된 세 소스 파일과 이 보고서 외 파일은 변경하지 않았다.
- 빈도 집계와 동률 해소에 `BTreeMap` 및 명시적 정렬을 사용해 결과가 반복 실행에서 동일하다.
- 구현 범위는 Phase 1 역할 추출에 한정했으며 별도 추상화나 후속 단계 기능을 추가하지 않았다.
- 알려진 우려사항은 없다.
