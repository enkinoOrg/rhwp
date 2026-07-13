# 공용 RHWP 호스트 아키텍처

## 배경

여러 Enkino 서비스가 RHWP 편집기를 각자 복제해 운영하면 버전과 패치가 쉽게 어긋난다. 특히 경기예술지원 시스템에서 로컬 글꼴 감지 안내가 반복되는 문제가 확인되어, 한 곳에서 정책과 배포 버전을 관리할 공용 호스트가 필요해졌다.

## 구성

```text
Enkino 서비스
  └─ @rhwp/editor createEditor(studioUrl)
       └─ iframe: rhwp.enkinokorea.workers.dev
            ├─ RHWP Studio UI
            ├─ RHWP WASM 엔진
            └─ postMessage 편집 API
```

Cloudflare Workers Static Assets가 `rhwp-studio/dist`를 전 세계 엣지에서 제공한다. 별도 Worker 런타임 코드나 서버 저장소는 없다. 문서 바이트는 부모 서비스와 iframe 사이에서 브라우저 `postMessage`로 전달되며, 이 호스트가 문서를 서버에 저장하지 않는다.

## Enkino 전용 정책

- 문서 초기화 과정에서 로컬 글꼴 감지 권한 안내를 호출하지 않는다.
- 문서에 포함된 글꼴이 없으면 RHWP의 기존 대체 글꼴 규칙을 사용한다.
- `Permissions-Policy: local-fonts=()` 헤더로 배포 호스트의 로컬 글꼴 접근도 차단한다.
- 여러 프로젝트에서 iframe으로 사용할 수 있도록 프레임 차단 헤더를 설정하지 않는다.
- 해시가 포함된 asset과 WASM은 장기 캐시하고 HTML은 Cloudflare 기본 재검증 정책을 사용한다.

## 신뢰 경계

호스트는 공개 URL이며 iframe 제어 API도 공개되어 있다. 각 부모 페이지는 자신이 만든 iframe에 문서 데이터를 전달하고 같은 창으로 응답을 받는다. 민감 문서를 URL, query string, 로그에 넣지 않는다. 접근 제어와 문서 저장 권한은 호스트가 아니라 각 연동 프로젝트가 책임진다.

외부 프로젝트의 실제 조회·저장 API, Next.js App Router, Supabase private Storage, version 충돌 처리와 운영 검증은 [외부 프로젝트 RHWP 연동 가이드](integration-guide.md)를 따른다. RHWP 호스트에는 문서 ID, 인증 token, signed URL을 전달하지 않으며, 외부 서버가 매 요청 세션과 문서별 권한을 검증한다.

## 버전 전략

현재 운영 주소는 단일 `latest` 역할을 한다. 배포는 Git commit과 Cloudflare deployment version으로 추적하며 문제가 생기면 Wrangler rollback으로 이전 deployment를 복원한다. 호환되지 않는 API 변경이 필요해질 때만 별도 Worker 이름 또는 versioned path를 도입한다.
