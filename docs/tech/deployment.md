# Enkino RHWP 배포 가이드

이 문서는 Enkino 전용 rhwp-studio의 Cloudflare Workers 배포 가이드 및 자산 관리 절차를 설명합니다.

## 1. Cloudflare Workers 배포 구조

rhwp-studio는 Cloudflare Workers의 Static Asset Hosting 모드를 사용하여 배포됩니다.

- **운영 Studio URL**: `https://rhwp.enkinokorea.workers.dev`
- **설정 파일**: `wrangler.jsonc` (루트)
- **보안 헤더 파일**: `rhwp-studio/public/_headers`

### `wrangler.jsonc` 주요 설정

```jsonc
{
  "name": "rhwp",
  "compatibility_date": "2026-08-06",
  "assets": {
    "directory": "./rhwp-studio/dist",
    "binding": "ASSETS",
    "html_handling": "single-page",
    "not_found_handling": "single-page"
  }
}
```

## 2. 배포 및 검증 절차

### 2.1 정적 자산 빌드

```bash
npm run build:studio
```
위 명령은 WASM 모듈(`pkg/`) 생성 확인 후 `rhwp-studio`의 Vite 프로덕션 빌드를 수행하여 `./rhwp-studio/dist` 디렉토리에 정적 파일들을 생성합니다.

### 2.2 드라이 런 검증 (Dry-Run Check)

실제 배포 전, 래클러(Wrangler) 빌드 및 자산 바인딩 상태를 검증하기 위해 dry-run을 실행합니다.

```bash
npm run deploy:dry-run
```

이 명령은 `npx wrangler deploy --dry-run`을 호출하여 배포 패키지 구성 및 자산 업로드 대상 목록을 검증하며, 실제 원격 배포는 수행하지 않습니다.

### 2.3 보안 헤더 검증

`rhwp-studio/public/_headers` 파일에 다음과 같은 보안 및 캐싱 규칙이 올바르게 적용되어 있는지 확인합니다:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: local-fonts=()`
- `/assets/*` 경로: `Cache-Control: public, max-age=31536000, immutable`

## 3. 배포 주의사항 및 정책

- **배포/푸시 제한**: 작업 지침에 따라 검증 단계 및 일반 작업 세션 동안 승인되지 않은 원격 푸시(`git push`) 및 배포(`wrangler deploy`)는 금지됩니다.
- **검증 우선**: 반드시 `npm run deploy:dry-run` 테스트 및 CI 계약 검증이 성공한 후 배포 절차를 진행해야 합니다.
