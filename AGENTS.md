# Enkino RHWP 운영 규칙

## 프로젝트 목적

이 저장소는 upstream `edwardkim/rhwp`를 추적하면서 Enkino 프로젝트가 공용으로 사용하는 RHWP Studio를 빌드하고 Cloudflare Workers에 배포한다.

## 변경 원칙

- upstream 동기화를 어렵게 만드는 대규모 재구성은 피한다.
- Enkino 전용 변경은 최소 패치와 별도 문서로 구분한다.
- 문서 로드 시 로컬 글꼴 권한을 요청하지 않는다. 기본 동작은 대체 글꼴 렌더링이다.
- 사람에게 보이는 문서와 커밋 메시지는 한국어로 작성한다.
- 완료 전 `npm test`, production build, 배포 URL 응답을 검증한다.
- 작업 배경과 검증 결과는 `docs/logs`에 기록한다.

## 원격 저장소

- `origin`: `enkinoOrg/rhwp`
- `upstream`: `edwardkim/rhwp`

## 배포 대상

- Worker 이름: `rhwp`
- 운영 URL: `https://rhwp.enkinokorea.workers.dev`
- 정적 산출물: `rhwp-studio/dist`
