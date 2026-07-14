# RHWP transferable 바이너리 프로토콜 적용

## 배경

`@rhwp/editor`와 RHWP Studio의 `postMessage` 연동이 HWP/HWPX 전체 바이트를 `Array.from`으로 `number[]`로 바꿨다. 대용량 문서에서 이 변환은 메모리와 직렬화 비용을 크게 늘리므로 transferable 바이너리 계약이 필요했다.

## 변경 내용

- SDK `loadFile`은 `ArrayBuffer` 또는 `Uint8Array`의 선택 범위를 standalone `ArrayBuffer`로 한 번 복사하고 transfer한다.
- 입력은 복사본만 transfer하므로 호출자가 넘긴 원본 버퍼는 detach되지 않고 계속 사용할 수 있다.
- Studio는 transferred `ArrayBuffer`, `Uint8Array`, 기존 `number[]` 입력을 모두 받는다.
- Studio의 `exportHwp`와 `exportHwpx`는 WASM 결과를 standalone 버퍼로 복사하고 응답 transfer list에 넣는다.
- SDK는 새 binary 응답과 기존 `number[]` 응답을 모두 `Uint8Array`로 반환한다.
- 이 양방향 호환성으로 SDK와 Studio를 어느 순서로 배포해도 기존 연동 형식을 수용한다.

## TDD 기록

- RED `rtk npm run test:sdk`: 8개 중 1개 실패. `loadFile` 요청 데이터가 `ArrayBuffer`가 아니었다.
- RED `rtk proxy node --test tests/post-message-security.test.ts`: 4개 중 1개 실패. Studio export 결과가 `ArrayBuffer`가 아니었다.
- GREEN `rtk npm run test:sdk`: 8개 통과.
- GREEN `rtk proxy node --test tests/post-message-security.test.ts`: 4개 통과.

## 수동 acceptance 상태

이 작업에서는 배포하지 않았다. 인증된 브라우저/CORS 통합과 Hancom Office 열기 검증도 실행하지 않았으며 통과로 표시하지 않는다.
