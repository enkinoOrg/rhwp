# 최종 리뷰 수정 보고

## 수정

- 기존 4개 경로 하드코딩 비교를 제거했다.
- 원본 ZIP의 모든 엔트리를 순회하고 `mimetype`, `Contents/content.hpf`, `Contents/header.xml`, 숫자형 section/masterpage XML, `META-INF` 고정 파일을 정상 재생성 대상으로 명시적으로 제외한다.
- 나머지 원본 passthrough 엔트리 전체의 정렬된 경로 집합과 각 바이트를 출력 ZIP과 비교한다. 현재 fixture에서는 BinData 14개와 `settings.xml`, `version.xml`이 대상이다.
- 마지막 구역을 패치하는 실제 fixture에서 export/reload 뒤 구역 수 불변과 빈 구역 없음 계약을 검증한다.
- 후속 구역의 노드는 유지하고 문단만 비우는 Phase 1 정책과, `BoundaryCandidate`의 보존 마지막/교체 첫 앵커 필드는 Phase 2 API TODO라는 점을 설계·작업 로그에 기록했다. Phase 1 공개 타입은 변경하지 않았다.

## TDD

- RED: 기존 헬퍼가 `BinData/image1.bmp`를 누락하여 통합 회귀 테스트가 `0 passed, 1 failed`로 실패함을 확인했다.
- GREEN: 전체 ZIP 역할 분류와 경로·바이트 비교로 변경한 뒤 해당 테스트 `1 passed, 0 failed, 0 ignored`를 확인했다.

## 검증

- `rtk test cargo test --test template_compiler_phase1`: 6 passed, 0 failed, 0 ignored.
- `rtk test cargo test document_core::template_compiler`: 관련 테스트 11 passed, 0 failed.
- `rtk test cargo test`: 성공. 기존 ignored 22건, 신규 ignored 0건.
- `rtk cargo build --release`: 성공.
- `rtk git diff --check`: 성공.

## 우려

- Phase 1의 후속 빈 구역 정책은 구역 설정 보존을 우선한다. 마지막 구역이 아닌 경계를 사용하는 문서의 렌더링 페이지 의미는 Phase 2에서 앵커 API와 함께 명시적으로 다뤄야 한다.

## 최종 문서 정확성 수정

- 작업 로그의 4개 고정 passthrough 엔트리 표현을 실제 구현 계약인 정상 재생성 대상 제외 후 모든 원본 passthrough 경로 집합·바이트 동일성 검증으로 수정하고 BinData 포함을 명시했다.
- 페이지 수 직접 검증은 추가하지 않았으며, Phase 2 TODO로 기록한 기존 정책을 유지했다.
