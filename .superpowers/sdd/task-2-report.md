# Task 2 구현 보고서

## 구현

- `BoundaryCandidate` 직렬화 타입과 `rank_body_boundaries` 공개 함수를 추가했다.
- Task 1의 `StyleProfile` 및 `TemplateRole` 공개 인터페이스를 그대로 사용했다.
- 제목 역할 일치(+40), 쪽 나눔 직후(+25), 앞 빈 문단(+10), 문서 앞 5%(-20), 표 컨트롤(-30)을 반영했다.
- 점수 내림차순 및 구역·문단 좌표 오름차순으로 정렬하고 `limit.min(3)`개로 제한했다.
- 후보 앞뒤 같은 구역의 문단을 각각 최대 2개씩 미리보기에 담았다.

## RED / GREEN

- RED: `rtk cargo test template_compiler::boundary::tests::ranks_first_major_heading_after_front_matter_first`
  - exit 101
  - `rank_body_boundaries`를 찾을 수 없는 E0425로 실패함을 확인했다.
- GREEN: `rtk cargo test template_compiler::boundary`
  - `1 passed, 2573 filtered out`

## 검증

- `rtk cargo test template_compiler::boundary`: 통과(1 passed)
- `rtk cargo fmt --check`: 통과(exit 0)
- `rtk git diff --check`: 통과(exit 0)

## 자체검토

- 지정된 `boundary.rs`, `mod.rs`와 이 보고서만 변경했다.
- 빈 텍스트 문단은 본문 시작 제목 후보가 될 수 없으므로 후보에서 제외했다.
- 모델의 쪽 나눔은 새 문단의 `ColumnBreakType::Page`로 표현되므로 해당 문단에 가점을 부여했다.
- 프로젝트 전체 `npm test`, production build, 배포 URL 검증은 Phase 1 통합 완료 시 수행할 검증으로 남겼다.

## 리뷰 수정

- 본문 시작의 양의 근거인 제목 역할, 쪽 나눔, 앞 빈 문단 중 하나도 없는 문단은 후보에서 제외하도록 정책을 명확히 했다.
- RED: `rtk cargo test template_compiler::boundary`에서 근거 없는 일반 문단 제외 및 모든 후보의 비어 있지 않은 근거 검증이 실패함을 확인했다(2 passed, 2 failed).
- GREEN: 제목(+40), 쪽 나눔(+25), 앞 빈 문단(+10), 앞 5%(-20), 표(-30)의 합산을 구체적으로 검증했다.
- 동점 좌표 정렬, `limit.min(3)`, 앞뒤 preview 최대 2개, 반환된 모든 후보의 비어 있지 않은 `reasons`를 회귀 테스트로 검증했다.
- `rtk cargo test template_compiler::boundary`: 통과(4 passed, 2573 filtered out)
- `rtk cargo fmt --check`: 통과(exit 0)
- `rtk git diff --check`: 통과(exit 0)
