# 2026-07-14 전달 가능 바이너리 배포

## 배경

검토 완료된 `enkino/self-host`의 전달 가능 바이너리 업데이트를 Cloudflare Worker `rhwp`에 운영 배포했다. 배포 기준 커밋은 `19e7f074751c4887e36d07b2d477c5e18fa2fc7e`이다.

## 실행 명령

```bash
rtk git status --short --branch
rtk proxy git rev-parse HEAD
rtk proxy git branch --show-current
rtk proxy git rev-parse --verify origin/enkino/self-host
rtk npm test
rtk npm run build
rtk npm run deploy:dry-run
rtk proxy git push -u origin enkino/self-host
rtk npm run deploy
rtk proxy npx wrangler deployments list --name rhwp
rtk proxy curl -sS -D /tmp/rhwp-root.headers -o /tmp/rhwp-index.html -w 'root_http=%{http_code} content_type=%{content_type} url=%{url_effective}\n' https://rhwp.enkinokorea.workers.dev/
rtk proxy curl -sS -o /dev/null -w 'js_http=%{http_code} content_type=%{content_type}\n' https://rhwp.enkinokorea.workers.dev/assets/index-D_xYS4U9.js
rtk proxy curl -sS -o /dev/null -w 'css_http=%{http_code} content_type=%{content_type}\n' https://rhwp.enkinokorea.workers.dev/assets/index-CYBWf-1M.css
rtk proxy curl -sS -o /dev/null -w 'wasm_http=%{http_code} content_type=%{content_type}\n' https://rhwp.enkinokorea.workers.dev/assets/rhwp_bg-KJGDyIZB.wasm
```

## 결과

- 배포 전 worktree는 clean 상태였고 HEAD는 검토 기준 커밋과 정확히 일치했다.
- `origin/enkino/self-host`가 없었으므로 force 없이 새 원격 브랜치로 push했다. push된 커밋은 `19e7f074751c4887e36d07b2d477c5e18fa2fc7e`이다.
- `npm test`는 40개 테스트를 모두 통과했다.
- `npm run build`가 성공해 `rhwp-studio/dist`를 새로 만들었다.
- `npm run deploy:dry-run`은 84개의 정적 asset을 읽고 성공했다.
- `npm run deploy`는 기존 Worker `rhwp`에 4개의 변경 asset을 업로드했다. Pages 리소스는 만들거나 배포하지 않았다.
- Cloudflare 배포 version은 `52b80974-2022-44cc-b2a4-814d44c056c7`이며, 100% traffic으로 연결되어 있다.
- 운영 URL은 <https://rhwp.enkinokorea.workers.dev/>이다.
- 운영 URL GET은 `200 text/html`을 반환했고, 새 build의 `assets/index-D_xYS4U9.js`와 `assets/index-CYBWf-1M.css`를 참조했다.
- 해당 JavaScript, CSS, WASM asset GET은 각각 `200 text/javascript`, `200 text/css`, `200 application/wasm`을 반환했다.
- HTML 응답에는 `Permissions-Policy: local-fonts=()`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`가 포함됐다.

## 경고

- 빌드 중 Vite가 500 kB를 넘는 chunk와 `canvaskit-wasm`의 browser externalization 경고를 냈다. build와 배포는 성공했으며, 이번 검토된 업데이트 범위 밖이므로 수정하지 않았다.
- `npm --prefix rhwp-studio ci`는 1건의 low-severity npm audit 항목을 보고했다. 자동 수정은 lockfile 또는 의존성 변경을 유발할 수 있어 실행하지 않았다.
- 이 로그를 커밋하면 Git HEAD는 배포 기준 커밋보다 앞으로 이동한다. 문서만 추가된 것이므로 static asset을 재배포하지 않는다.
