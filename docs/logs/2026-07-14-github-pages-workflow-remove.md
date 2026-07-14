# GitHub Pages 배포 워크플로 제거

## 배경

RHWP Studio 운영 배포는 Cloudflare Workers의 `https://rhwp.enkinokorea.workers.dev`만 사용한다. 그러나 upstream에서 유지되던 `.github/workflows/deploy-pages.yml`이 main push마다 `Deploy to GitHub Pages` workflow를 실행해 불필요한 실패 알림을 만들었다.

## 변경

- `.github/workflows/deploy-pages.yml`을 삭제했다.
- GitHub Pages artifact upload, `github-pages` environment, Pages write 권한과 `actions/deploy-pages` 실행을 제거했다.
- Cloudflare Workers용 `wrangler.jsonc`, `npm run deploy`, `npm run deploy:dry-run`은 변경하지 않았다.

## 검증

- `.github/workflows`에서 `pages: write`, `actions/deploy-pages`, `github-pages` 참조가 0건임을 확인했다.
- `package.json`의 `deploy: wrangler deploy`와 `deploy:dry-run: wrangler deploy --dry-run`이 유지되는 것을 확인했다.
- 제거 커밋 `883de2e6`을 `origin/main`에 push했다.

이후 main push는 GitHub Pages 배포를 시작하지 않는다. 운영 배포는 기존 Cloudflare Workers 절차만 사용한다.
