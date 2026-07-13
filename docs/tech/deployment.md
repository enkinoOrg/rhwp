# 빌드 및 배포

## 배경

공용 RHWP 호스트는 여러 서비스의 편집 화면에 직접 영향을 준다. 담당자가 바뀌어도 동일한 산출물을 만들고 이전 버전으로 되돌릴 수 있도록 명령과 확인 기준을 고정한다.

## 사전 조건

- Node.js와 npm
- Rust toolchain 및 `wasm32-unknown-unknown` target
- `wasm-pack`
- Cloudflare Wrangler 로그인 권한

## 최초 설치

```bash
npm install
npm --prefix rhwp-studio ci
```

`wasm-pack`이 없으면 `cargo install wasm-pack --locked`로 설치한다.

## 빌드

```bash
npm run build
```

WASM 산출물은 `pkg`, 웹 산출물은 `rhwp-studio/dist`에 생성된다.

## 검증

```bash
npm --prefix rhwp-studio test
npm run deploy:dry-run
npm run dev
```

로컬 주소에서 Studio 초기화, HWP/HWPX 로드, 텍스트 편집, export를 확인한다. 로컬 글꼴 권한 안내는 표시되지 않아야 한다.

## 운영 배포

```bash
npm run deploy
```

배포 후 GET 요청으로 HTML, JavaScript, CSS, WASM의 HTTP 200 응답과 보안 헤더, 연동 프로젝트의 iframe API를 확인한다. Workers Static Assets의 HEAD 응답은 GET과 다를 수 있으므로 가용성 판정에 사용하지 않는다.

## 롤백

```bash
npx wrangler deployments list --name rhwp
npx wrangler rollback --name rhwp <VERSION_ID>
```

롤백 후에도 공개 URL과 연동 프로젝트를 다시 확인한다.
