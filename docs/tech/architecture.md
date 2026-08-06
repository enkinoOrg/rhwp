# Enkino RHWP 아키텍처

이 문서는 Enkino 시스템에 통합된 rhwp 문서 엔진의 전체 아키텍처, 구성 요소 간 호스팅 경계 및 보안 통신 구조를 설명합니다.

## 1. 개요 및 계층 구조

rhwp 시스템은 Rust 기반의 핵심 포맷 파서 및 렌더링 엔진, WebAssembly 브리지, 웹 편집기 UI, 임베드 SDK, 그리고 Cloudflare Workers 호스팅 레이어로 구성됩니다.

```
+-------------------------------------------------------------------------+
|                         Enkino Consumer Web App                         |
|   (SDK @rhwp/editor / iframe: https://rhwp.enkinokorea.workers.dev)     |
+-------------------------------------------------------------------------+
                                     |
              MessageChannel v1 / postMessage Protocol
        (Strict origin validation: event.origin & event.source)
                                     |
                                     v
+-------------------------------------------------------------------------+
|                  rhwp-studio (Cloudflare Workers Static)                |
|  +-------------------------------------------------------------------+  |
|  |                     WASM Engine (@rhwp/core)                      |  |
|  |  +---------------------+  +------------------------------------+  |  |
|  |  |  DocumentCore CQRS  |  |  Multi-backend Renderer            |  |  |
|  |  |  (Commands/Queries) |  |  (Canvas2D / CanvasKit)            |  |  |
|  |  +---------------------+  +------------------------------------+  |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

## 2. 주요 구성 요소

1. **WASM Core (`@rhwp/core` / `src/`)**:
   - HWP 5.0, HWPX, HML 포맷 파싱 및 직렬화.
   - CQRS 기반 문서 상태 관리 (`DocumentCore`).
   - Canvas2D 및 CanvasKit 백엔드를 활용한 웹 기반 벡터 렌더링.

2. **Web Editor (`rhwp-studio`)**:
   - Vite 기반의 웹 애플리케이션 UI.
   - 메뉴바, 툴바, 서식 설정, 표 편집, 대화상자 관리.
   - HWPX 비표준 검증, 로컬 글꼴 준비, 자동저장 복구 정책 모듈 내장.

3. **Cloudflare Workers 호스팅 레이어 (`wrangler.jsonc`, `public/_headers`)**:
   - Static Asset 모드로 `rhwp-studio` 정적 자산 배포 (`https://rhwp.enkinokorea.workers.dev`).
   - SPA 라우팅 및 보안 헤더(`nosniff`, `no-referrer`, `local-fonts=()`) 적용.

4. **SDK (`@rhwp/editor`)**:
   - 외부 웹 애플리케이션에서 `iframe`으로 에디터를 임베드할 수 있도록 제공하는 라이브러리.
   - `MessageChannel` v1 및 `postMessage` 전송계층 래핑.

## 3. 크로스 오리진 보안 통신

- **오리진/소스 검증**: 외부 호스트 웹 앱과 `rhwp-studio` iframe 간 통신 시 `event.origin` 및 `event.source`를 엄격히 검증하여 신뢰할 수 없는 원격 메시지를 차단합니다.
- **opaque origin 거부**: `file:`, `data:`, 브라우저 확장과 같이 `event.origin`이 `null`이거나 불투명한 환경에서의 연결 요청은 SDK와 Studio 양쪽에서 모두 거부됩니다.
