# Enkino RHWP 공용 호스트 구현 계획

## 배경

경기예술지원 시스템의 RHWP 편집 화면은 외부 RHWP Studio를 iframe으로 사용한다. 문서에 기본 지원 외 글꼴이 있으면 로컬 글꼴 감지 권한 안내가 반복되어 운영 흐름을 방해하고, 외부 호스트에 의존하므로 변경 시점과 가용성을 직접 통제할 수 없다. 여러 Enkino 프로젝트가 동일한 편집기를 안정적으로 사용할 수 있도록 RHWP Studio를 조직 저장소와 Cloudflare Workers에 자체 배포한다.

## 목표

- `enkinoOrg/rhwp`에서 upstream RHWP를 추적한다.
- 문서 로드 시 로컬 글꼴 감지 권한 안내를 표시하지 않고 대체 글꼴로 렌더링한다.
- RHWP Studio 정적 산출물을 `https://rhwp.enkinokorea.workers.dev`에서 제공한다.
- 다른 프로젝트는 `studioUrl`만 변경해 같은 호스트를 재사용한다.
- upstream 동기화, 빌드, 배포, 롤백 절차를 문서화한다.

## 성공 기준

1. 정책 회귀 테스트와 RHWP Studio 테스트가 통과한다.
2. WASM과 RHWP Studio production build가 재현된다.
3. 배포 URL에서 HTML, JavaScript, CSS, WASM이 정상 응답한다.
4. iframe 로드와 HWP/HWPX 열기, 편집 export 흐름이 동작한다.
5. 로컬 글꼴 감지 안내가 문서 로드 시 표시되지 않는다.
6. GitHub 저장소와 Cloudflare 배포 상태가 문서에 기록된다.

## 작업 순서

1. upstream 기준과 로컬 환경을 검증한다.
2. 로컬 글꼴 안내 비활성 정책을 테스트로 고정하고 최소 패치를 적용한다.
3. root 배포 스크립트와 Workers Static Assets 설정을 추가한다.
4. WASM과 Studio를 빌드하고 로컬에서 검증한다.
5. 조직 GitHub 저장소를 생성해 push한다.
6. Worker를 배포하고 공개 URL을 검증한다.
7. 경기예술지원 시스템의 `studioUrl`을 공용 호스트로 전환한다.
8. 통합 검증 결과와 운영 절차를 문서화한다.

## 제외 범위

- RHWP 렌더링 엔진과 편집 기능 자체의 변경
- 사용자 문서의 서버 저장 기능
- Cloudflare custom domain 연결
- 사용자별 접근 제어 또는 테넌트 분리
