# 공용 RHWP self-host 구축

## 배경

경기예술지원 시스템의 RHWP 편집 화면에서 문서에 비기본 글꼴이 포함되면 로컬 글꼴 감지 권한 안내가 반복됐다. 외부 GitHub Pages Studio에 의존하지 않고 여러 Enkino 프로젝트가 같은 정책과 버전을 공유할 수 있도록 조직 저장소와 공용 Cloudflare Worker를 구축했다.

## 작업 내용

- upstream `edwardkim/rhwp` 전체 이력을 기준으로 `enkinoOrg/rhwp` 공개 저장소를 생성했다.
- 문서 초기화 시 `promptLocalFontsIfNeeded`를 호출하지 않도록 Enkino 정책을 적용했다.
- 정책 재도입을 감지하는 회귀 테스트를 추가했다.
- Vite PWA 기준 경로를 workers.dev 루트 주소에 맞췄다.
- root npm build/deploy 명령과 `wrangler.jsonc`를 추가했다.
- Workers Static Assets 응답에 보안 및 캐시 헤더를 설정했다.
- 아키텍처, 배포, 롤백, upstream 동기화 절차를 문서화했다.
- 경기예술지원 시스템의 `studioUrl`을 공용 Worker 주소로 전환했다.

## 배포 정보

- GitHub: `https://github.com/enkinoOrg/rhwp`
- Worker: `rhwp`
- 운영 URL: `https://rhwp.enkinokorea.workers.dev`
- 최초 검증 deployment: `1b7104bd-493c-4640-8803-0b8a6663540d`
- 최종 deployment: `5f7b87d5-1b4d-4bdd-910e-333051f05273`

## 검증 결과

- Rust 전체 테스트: 2,550개 통과, 22개 명시적 ignore
- RHWP Studio 단위 테스트: 148개 통과
- WASM production build: 통과
- Vite production build: 통과
- Wrangler dry-run: 84개 asset 인식, 통과
- 운영 GET 응답: HTML과 WASM HTTP 200
- 운영 브라우저: WASM 0.7.17 초기화 확인
- 비기본 글꼴 HWP 샘플: 1페이지 로드, 로컬 글꼴 안내 미표시
- 편집 입력 후 iframe `exportHwp`: 8,192바이트 반환
- 경기예술지원 RHWP 관련 테스트: 8개 통과

## 알려진 사항

- upstream Studio install 결과 transitive dependency에 low severity audit 1건이 보고됐다.
- upstream CanvasKit bundle은 browser externalization 및 500KB 초과 chunk 경고를 출력하지만 production build는 성공한다.
- upstream HEAD의 `pdf-large/hwpx/2026_oss_rst.pdf`는 현재 LFS 속성과 달리 일반 Git blob으로 기록되어 `git lfs fsck` 경고가 발생한다. Enkino 변경과 무관해 기존 이력은 수정하지 않았다.
