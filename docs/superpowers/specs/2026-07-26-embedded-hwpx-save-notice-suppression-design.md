# 임베드 HWPX 저장 안내 억제 설계

## 목적

Lawgent가 RHWP Studio를 iframe으로 임베드해 HWPX 초안을 편집할 때, 단독 RHWP의 HWP 변환 저장 안내를 표시하지 않는다.

## 근거

Lawgent의 저장 버튼은 SDK `exportHwpx()`를 호출해 HWPX로 저장한다. 따라서 임베드 화면에 표시되는 “HWP 형식으로 변환 저장” 토스트와 상태 표시줄 문구는 Lawgent 저장 동작과 맞지 않는다.

## 선택한 동작

- iframe 임베드에서는 HWPX 변환 저장 토스트와 상태 표시줄 변환 안내를 모두 생략한다.
- 단독 RHWP에서 HWPX를 열면 기존 안내를 유지한다.
- HWP 문서에는 기존처럼 안내하지 않는다.
- Lawgent SDK와 `exportHwpx()` 저장 경로는 변경하지 않는다.

## 구현과 검증

기존 `notifyHwpxSaveModeIfNeeded()`가 iframe 여부를 먼저 판별해 즉시 반환하게 한다. 실제 함수 소스를 실행하는 단위 테스트로 임베드·단독·HWP 조건을 검증하고, 전체 테스트와 프로덕션 빌드 후 RHWP를 배포한다. 마지막으로 Lawgent v2 초안에서 안내가 보이지 않고 저장 버튼이 활성화되는지 확인한다.
