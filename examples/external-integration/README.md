# 프레임워크 공통 RHWP 연동 예제

외부 웹 프로젝트가 공용 RHWP Studio에서 HWPX를 조회, 편집, 저장하는 최소 흐름입니다. RHWP 호스트는 편집 UI만 제공하며, 인증, 권한 확인, 문서 조회와 저장은 외부 프로젝트가 담당합니다.

## 설치

```bash
npm install @rhwp/editor
```

`rhwp-client.ts`를 프로젝트에 복사하거나 해당 파일을 기준으로 연동 코드를 작성합니다.

## 컨테이너

에디터 컨테이너는 고정된 높이가 필요합니다.

```html
<div id="rhwp-editor" style="height: 720px"></div>
```

## 조회와 저장

`fetchDocument`는 인증된 외부 프로젝트 API에서 HWPX bytes, 파일명, 현재 version을 반환합니다. `saveDocument`는 export한 bytes와 기준 version을 받아 외부 프로젝트 API에 저장합니다. 아래의 `saveHwpxDocument`는 JSON 응답으로 `{ version }`을 반환하는 `PUT` API용 기본 구현입니다.

```ts
import {
  createRhwpDocumentSession,
  saveHwpxDocument,
} from './rhwp-client'

const documentId = 'example-document-id'
let session: Awaited<ReturnType<typeof createRhwpDocumentSession>> | undefined

// 편집 세션 시작 함수
async function openDocument() {
  session?.destroy()
  session = undefined

  session = await createRhwpDocumentSession({
    container: '#rhwp-editor',
    async fetchDocument() {
      const response = await fetch(`/api/documents/${documentId}/file`)

      if (!response.ok) {
        throw new Error(`문서를 불러오지 못했습니다. (${response.status})`)
      }

      return {
        bytes: await response.arrayBuffer(),
        fileName: response.headers.get('X-Document-File-Name') ?? 'document.hwpx',
        version: response.headers.get('X-Document-Version') ?? '0',
      }
    },
    saveDocument(input) {
      return saveHwpxDocument(`/api/documents/${documentId}/file`, input)
    },
  })
}

// 편집 결과 저장 함수
async function saveDocument() {
  if (!session) return

  await session.save()
}
```

조회 API도 매 요청마다 사용자의 세션과 문서별 read 권한을 서버에서 검증해야 합니다. 세션이 없으면 `401 Unauthorized`, 문서 접근 권한이 없으면 `403 Forbidden`을 반환합니다. URL의 문서 ID만 바꿔 다른 문서를 읽을 수 있으면 IDOR(Insecure Direct Object Reference) 취약점이 되므로, 클라이언트가 보낸 ID만 신뢰하지 말고 세션의 사용자와 대상 문서의 권한을 함께 확인해야 합니다.

저장 API는 요청마다 사용자의 세션과 문서 수정 권한을 검증해야 합니다. `If-Match`의 기준 version이 현재 version과 다르면 `409 Conflict`를 반환하고 기존 HWPX를 덮어쓰지 않아야 합니다. session은 저장 성공 응답의 version을 다음 저장 기준으로 사용합니다.

## 생명주기 정리

SPA 컴포넌트의 unmount나 페이지 종료 전에 `destroy()`를 호출합니다. 새 세션을 열기 전에도 기존 세션을 먼저 정리합니다.

```ts
// 편집 세션 정리 함수
function closeDocument() {
  session?.destroy()
  session = undefined
}
```

## 오류 처리

`createRhwpDocumentSession`과 `save()`는 에디터 초기화, 문서 조회, HWPX 로드, export, 저장 실패를 그대로 throw합니다. 호출부에서 각 작업의 실패를 사용자에게 표시하고, 저장 실패 후에는 세션을 유지해 재시도할 수 있게 처리합니다. 인증 만료와 `409 Conflict`는 자동 재시도하지 말고 재로그인 또는 최신 문서 재조회 흐름으로 분기합니다.
