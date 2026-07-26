# 2026-07-26 임베드 검증 대화상자 교착 방지 배포

## 배경

Lawgent v2가 HWPX를 iframe Studio에 전달한 뒤 `loadFile` 응답을 기다리는 동안,
Studio의 비표준 lineseg 검증 모달이 사용자 입력을 대기해 10초 RPC 제한을
초과했다. 부모 화면은 이 경우 읽기 전용 미리보기로 전환됐다.

## 변경

- embed `loadFile`의 `suppressDialogs` 옵션을 `loadBytes`와
  `initializeDocument`까지 전달했다.
- 값이 정확한 boolean `true`일 때만 검증 모달을 생략하고 문서를 `as-is`로
  열도록 했다.
- 일반 파일 열기와 false/누락/비 boolean 요청은 기존 대화형 동작을 유지한다.
- 실제 postMessage 경로와 미응답 검증 모달을 사용하는 회귀 테스트를 추가했다.

## 검증

- `npm test`: 40개 통과
- `npm --prefix rhwp-studio test`: 153개 통과
- `npm run build`: 성공
- `npm run deploy:dry-run`: 정적 asset 84개 확인, 성공

## 배포

- Git commit: `1787f20f7`
- Worker: `rhwp`
- URL: `https://rhwp.enkinokorea.workers.dev`
- Cloudflare version: `26af9b55-6081-4246-a6bd-08ecb25ecc78`
- 배포 시각: 2026-07-26 14:17 KST
- 트래픽: 100%
- 운영 HTML이 새 `assets/index-BDoSJlBz.js`를 참조하고, 번들에
  `suppressDialogs` 분기가 포함된 것을 확인했다.
