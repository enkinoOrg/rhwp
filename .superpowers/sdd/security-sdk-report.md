# 공용 RHWP postMessage 보안 수정 보고서

## 배경

공용 `@rhwp/editor` SDK와 RHWP Studio의 iframe 통신이 `postMessage`의 대상 origin을 `*`로 지정하고, 응답 또는 요청을 보낸 창과 origin을 검증하지 않았다. 이 상태에서는 같은 페이지의 sibling frame이나 다른 창이 요청 ID를 이용해 응답을 위조하거나 Studio API를 호출할 수 있어, 공용 Studio를 여러 프로젝트에서 사용하는 신뢰 경계를 명확히 할 필요가 있었다.

## 근본 원인

- SDK가 `studioUrl`을 iframe 주소로만 사용하고 통신용 origin을 보존하지 않았다.
- SDK 응답 리스너가 `event.data`와 요청 ID만 확인하고 `event.origin`, `event.source`를 확인하지 않았다.
- Studio 요청 리스너가 실제 부모 창인지 확인하지 않고 모든 `rhwp-request`를 처리했다.
- Studio가 요청 origin과 무관하게 응답 `targetOrigin`을 `*`로 지정했다.

## TDD 검증

### RED

- SDK 요청의 `targetOrigin`이 기대한 `https://studio.example.test`가 아니라 `*`여서 실패했다.
- 공격자 origin의 위조 응답 `41`이 정상 iframe 응답 `7`보다 먼저 수락되어 실패했다.
- Studio가 sibling 창의 요청에 응답하여 실패했다.
- 서로 다른 두 프로젝트 origin에 대한 Studio 응답 대상이 모두 `*`여서 실패했다.

### GREEN

- SDK가 `new URL(studioUrl, window.location.href).origin`으로 계산한 정확한 origin을 모든 요청에 사용한다.
- SDK가 `event.origin === studioOrigin`과 `event.source === iframe.contentWindow`를 모두 만족하는 응답만 처리한다.
- Studio가 실제 `window.parent`에서 온 요청만 처리한다.
- Studio가 배포 시 부모 origin을 고정하지 않고, 검증된 부모 창과 각 요청의 `event.origin` 조합을 신뢰 경계로 사용한다.
- 기존 `createEditor`, 문서 API 메서드, 메시지 타입과 응답 형식은 변경하지 않았다.
- 기존 `hwpctl-load` 호환 경로도 같은 부모 source 검증과 요청 origin 응답 규칙을 적용했다.

## 실행 테스트

- `node --test npm/editor/index.test.mjs`: 2개 통과
- `npm --prefix rhwp-studio test`: 150개 통과
- `npm test`: 20개 통과
- `npm --prefix rhwp-studio run build`: 성공
- `https://rhwp.enkinokorea.workers.dev/`: HTTP 200 확인
- `git diff --check`: 통과

프로덕션 빌드에는 기존 CanvasKit의 `fs`, `path` 브라우저 외부화 경고와 500 kB 초과 청크 경고가 있었으며, 오류나 빌드 실패는 없었다.

## 변경 범위

- `npm/editor/index.js`
- `npm/editor/index.test.mjs`
- `rhwp-studio/src/main.ts`
- `rhwp-studio/tests/post-message-security.test.ts`
- `.superpowers/sdd/security-sdk-report.md`

작업 트리에 있던 `examples/**` 및 `tests/enkino-external-integration.test.mjs` 변경은 수정하거나 커밋 대상에 포함하지 않았다.
