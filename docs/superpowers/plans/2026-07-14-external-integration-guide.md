# 외부 웹 프로젝트 RHWP 연동 가이드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 웹 프로젝트가 공용 RHWP Studio로 HWPX를 조회·편집·버전 저장할 수 있도록 프레임워크 공통 예제와 Next.js·Supabase production 예제, 상세 운영 가이드를 제공한다.

**Architecture:** 예제는 실행 앱이 아니라 역할별로 복사 가능한 TypeScript 모듈로 제공한다. 공통 예제는 editor lifecycle과 HTTP 계약만 다루고, Next.js 예제는 Client Component, API client, Route Handler, repository, Supabase Storage adapter를 분리한다. Node source-contract 테스트가 공용 URL, export 흐름, 서버 권한 검사, private Storage, 낙관적 잠금 계약의 누락을 감지한다.

**Tech Stack:** TypeScript, `@rhwp/editor`, Next.js App Router, Supabase JS, Node test runner, PostgreSQL SQL 예제

## Global Constraints

- 운영 Studio URL은 `https://rhwp.enkinokorea.workers.dev/`다.
- RHWP 호스트에는 문서 식별자, 인증 token, signed URL을 전달하지 않는다.
- 문서 조회와 저장 권한은 외부 프로젝트 서버가 매 요청 검증한다.
- Supabase bucket은 private이고 service role key는 서버에서만 사용한다.
- 저장은 기준 version이 일치할 때 append-only version row와 새 Storage object를 만든다.
- version 충돌은 원본을 덮어쓰지 않고 HTTP 409로 응답한다.
- 별도 실행 가능한 Next.js 앱이나 실제 DB migration 적용은 만들지 않는다.
- 사람이 읽는 문서와 코드 설명은 한국어로 작성한다.

---

### Task 1: 프레임워크 공통 연동 예제

**Files:**
- Create: `examples/external-integration/README.md`
- Create: `examples/external-integration/rhwp-client.ts`
- Create: `tests/enkino-external-integration.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createEditor(container, { studioUrl })`, `editor.loadFile(data, fileName)`, `editor.exportHwpx()`, `editor.destroy()`
- Produces: `createRhwpDocumentSession(options): Promise<RhwpDocumentSession>`, `RhwpDocumentSession.save(): Promise<SaveDocumentResult>`, `RhwpDocumentSession.destroy(): void`

- [ ] **Step 1: 공용 URL과 HWPX 저장 계약이 없는 상태를 검출하는 테스트 작성**

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('공통 예제는 공용 Studio에서 HWPX를 열고 export 결과를 저장한다', () => {
  const source = readFileSync('examples/external-integration/rhwp-client.ts', 'utf8')
  assert.match(source, /https:\/\/rhwp\.enkinokorea\.workers\.dev\//)
  assert.match(source, /editor\.loadFile/)
  assert.match(source, /editor\.exportHwpx\(\)/)
  assert.match(source, /method: 'PUT'/)
  assert.match(source, /editor\.destroy\(\)/)
})
```

- [ ] **Step 2: 테스트가 예제 파일 부재로 실패하는지 확인**

Run: `rtk test npm test -- --test-name-pattern='공통 예제'`
Expected: FAIL with `ENOENT: no such file or directory, open 'examples/external-integration/rhwp-client.ts'`

- [ ] **Step 3: 최소 공통 session 구현 작성**

```ts
export async function createRhwpDocumentSession(options: CreateSessionOptions): Promise<RhwpDocumentSession> {
  const editor = await createEditor(options.container, {
    studioUrl: RHWP_STUDIO_URL,
    width: '100%',
    height: '100%'
  })
  const response = await options.fetchDocument()
  await editor.loadFile(response.bytes, response.fileName)

  return {
    async save() {
      const bytes = await editor.exportHwpx()
      return options.saveDocument({ bytes, version: response.version })
    },
    destroy() {
      editor.destroy()
    }
  }
}
```

`README.md`에는 설치, HTML container, 조회·저장 callback, lifecycle cleanup, 오류 처리를 포함한다.

- [ ] **Step 4: root test script 추가 및 공통 예제 테스트 통과 확인**

```json
{
  "scripts": {
    "test:integration-guide": "node --test tests/enkino-external-integration.test.mjs"
  }
}
```

Run: `rtk test npm run test:integration-guide`
Expected: 1 test passed, 0 failed

- [ ] **Step 5: 커밋**

```bash
rtk git add package.json examples/external-integration tests/enkino-external-integration.test.mjs
rtk git commit -m "프레임워크 공통 RHWP 연동 예제 추가"
```

### Task 2: Next.js와 Supabase production 예제

**Files:**
- Create: `examples/nextjs-integration/README.md`
- Create: `examples/nextjs-integration/components/HwpxEditor.tsx`
- Create: `examples/nextjs-integration/lib/api/documents.ts`
- Create: `examples/nextjs-integration/app/api/documents/[documentId]/file/route.ts`
- Create: `examples/nextjs-integration/server/document-repository.ts`
- Create: `examples/nextjs-integration/server/supabase-document-storage.ts`
- Create: `examples/nextjs-integration/sql/document-versions.sql`
- Modify: `tests/enkino-external-integration.test.mjs`

**Interfaces:**
- Consumes: 공통 예제의 `RHWP_STUDIO_URL`, `@rhwp/editor`의 `RhwpEditor`
- Produces: `getDocumentFile(documentId)`, `saveDocumentFile(documentId, input)`, `GET(request, context)`, `PUT(request, context)`, `DocumentRepository`, `SupabaseDocumentStorage`

- [ ] **Step 1: 서버 보안과 버전 저장 계약 테스트 작성**

```js
test('Next.js 예제는 서버 권한, 포맷, version 충돌을 검증한다', () => {
  const route = source('examples/nextjs-integration/app/api/documents/[documentId]/file/route.ts')
  assert.match(route, /requireSession/)
  assert.match(route, /assertCanEditDocument/)
  assert.match(route, /MAX_HWPX_BYTES/)
  assert.match(route, /409/)
})

test('Supabase 예제는 private Storage와 append-only version을 사용한다', () => {
  const storage = source('examples/nextjs-integration/server/supabase-document-storage.ts')
  const sql = source('examples/nextjs-integration/sql/document-versions.sql')
  assert.match(storage, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(storage, /NEXT_PUBLIC_SUPABASE/)
  assert.match(sql, /document_versions/)
  assert.match(sql, /unique \(document_id, version\)/i)
})
```

- [ ] **Step 2: 테스트가 Next.js 예제 파일 부재로 실패하는지 확인**

Run: `rtk test npm run test:integration-guide`
Expected: FAIL with missing `route.ts`

- [ ] **Step 3: Client Component와 API client 작성**

`HwpxEditor.tsx`는 `useEffect`에서 editor를 만들고 cleanup에서 `destroy()`한다. 조회 완료 후 `loadFile`, 저장 시 `exportHwpx`, 저장 성공 후 server가 반환한 새 `version` 반영, dirty 상태에서 `beforeunload` 경고를 구현한다. `lib/api/documents.ts`는 endpoint, response parsing, `409`를 `DocumentVersionConflictError`로 정규화한다.

- [ ] **Step 4: Route Handler와 저장 경계 작성**

```ts
export async function PUT(request: NextRequest, context: RouteContext): Promise<Response> {
  const session = await requireSession()
  const documentId = (await context.params).documentId
  await assertCanEditDocument(session.userId, documentId)
  const expectedVersion = parseExpectedVersion(request.headers)
  const bytes = new Uint8Array(await request.arrayBuffer())
  validateHwpx(bytes)

  const result = await repository.createVersion({ documentId, expectedVersion, bytes, actorId: session.userId })
  if (result.kind === 'conflict') return Response.json(result, { status: 409 })
  return Response.json(result, { status: 200 })
}
```

GET은 세션과 read 권한을 검증한 뒤 private Storage bytes와 `ETag`, `X-Document-Version`, 안전한 `Content-Disposition`을 반환한다.

- [ ] **Step 5: repository, Supabase adapter, SQL 작성**

repository 계약은 metadata version 비교, 새 object 저장, append-only row insert, 현재 version 갱신 순서를 명시한다. SQL은 `documents`, `document_versions`, `(document_id, version)` unique constraint, version row update/delete 차단 trigger 예제를 포함한다. Storage adapter는 server-only env만 읽고 bucket 이름을 고정 설정으로 받는다.

- [ ] **Step 6: Next.js 예제 README 작성 및 계약 테스트 통과 확인**

README에는 필요한 패키지, 환경 변수, 복사 위치, 인증 helper 교체 지점, private bucket, SQL 적용 전 검토, 실행 흐름을 기록한다.

Run: `rtk test npm run test:integration-guide`
Expected: all integration guide contract tests pass

- [ ] **Step 7: 커밋**

```bash
rtk git add examples/nextjs-integration tests/enkino-external-integration.test.mjs
rtk git commit -m "Next.js Supabase RHWP 연동 예제 추가"
```

### Task 3: 상세 가이드와 진입 문서 연결

**Files:**
- Create: `docs/tech/integration-guide.md`
- Create: `docs/logs/2026-07-14-외부-rhwp-연동-가이드.md`
- Modify: `README.md`
- Modify: `docs/tech/architecture.md`
- Modify: `tests/enkino-external-integration.test.mjs`

**Interfaces:**
- Consumes: Task 1과 Task 2의 실제 예제 경로와 공개 함수명
- Produces: 외부 개발자의 단일 진입 문서와 README/아키텍처 링크

- [ ] **Step 1: 문서 필수 섹션과 링크 계약 테스트 작성**

```js
test('상세 가이드는 구현과 운영에 필요한 필수 섹션을 제공한다', () => {
  const guide = source('docs/tech/integration-guide.md')
  for (const heading of ['책임 경계', '전체 데이터 흐름', 'Next.js App Router', 'Supabase private Storage', '버전 충돌', '보안', '테스트', '운영 체크리스트', '문제 해결']) {
    assert.match(guide, new RegExp(heading))
  }
  assert.match(source('README.md'), /docs\/tech\/integration-guide\.md/)
  assert.match(source('docs/tech/architecture.md'), /integration-guide\.md/)
})
```

- [ ] **Step 2: 테스트가 상세 가이드 부재로 실패하는지 확인**

Run: `rtk test npm run test:integration-guide`
Expected: FAIL with missing `docs/tech/integration-guide.md`

- [ ] **Step 3: 상세 연동 가이드 작성**

가이드는 최소 예제에서 production 예제로 깊어지는 순서로 작성한다. 각 코드 블록은 Task 1·2의 실제 파일 링크를 함께 제공하고, 축약된 코드는 `축약 예제`라고 표시한다. HTTP 계약은 GET 200/401/403/404, PUT 200/400/401/403/409/413/500을 표로 정의한다. HWPX ZIP signature 검증의 한계와 서버 측 재검증 책임을 명시한다.

- [ ] **Step 4: README와 아키텍처에 상세 가이드 링크 추가**

README의 Enkino 공용 호스트 안내에 `외부 프로젝트 연동 가이드` 링크를 추가한다. 아키텍처의 신뢰 경계 아래에 실제 구현은 `integration-guide.md`를 따르도록 연결한다.

- [ ] **Step 5: 배경과 검증 결과를 작업 로그에 기록**

작업 로그에는 요청 배경, 산출물, 저장·보안 결정, 실행한 테스트와 알려진 한계를 기록한다.

- [ ] **Step 6: 전체 검증**

Run: `rtk test npm run test:integration-guide`
Expected: all tests pass

Run: `rtk test npm --prefix rhwp-studio test`
Expected: 148 tests pass, 0 fail

Run: `rtk git diff --check`
Expected: no output, exit 0

- [ ] **Step 7: 커밋**

```bash
rtk git add README.md docs/tech/architecture.md docs/tech/integration-guide.md docs/logs/2026-07-14-외부-rhwp-연동-가이드.md tests/enkino-external-integration.test.mjs
rtk git commit -m "외부 RHWP 연동 상세 가이드 완성"
```
