import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

// 내장 TypeScript strip mode로 순수 Task 2 module 실행
function runTypeScriptModule(script) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    { encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr)

  return result.stdout.trim()
}

// 테스트할 TypeScript module의 file URL 생성
function moduleUrl(path) {
  return pathToFileURL(resolve(path)).href
}

test('공통 예제는 공용 Studio에서 HWPX를 열고 export 결과를 저장한다', () => {
  const source = readFileSync('examples/external-integration/rhwp-client.ts', 'utf8')

  assert.match(source, /https:\/\/rhwp\.enkinokorea\.workers\.dev\//)
  assert.match(source, /editor\.loadFile/)
  assert.match(source, /editor\.exportHwpx\(\)/)
  assert.match(source, /method: 'PUT'/)
  assert.match(source, /editor\.destroy\(\)/)
})

test('공통 예제는 문서 조회 또는 로드 실패 시 editor를 정리한다', () => {
  const source = readFileSync('examples/external-integration/rhwp-client.ts', 'utf8')

  assert.match(source, /try\s*{[\s\S]*await options\.fetchDocument\(\)[\s\S]*await editor\.loadFile/)
  assert.match(source, /catch\s*\(error\)\s*{\s*editor\.destroy\(\)\s*throw error/)
})

test('공통 예제는 저장 성공 후 다음 저장에 새 version을 사용한다', () => {
  const source = readFileSync('examples/external-integration/rhwp-client.ts', 'utf8')

  assert.match(source, /let currentVersion = response\.version/)
  assert.match(source, /version: currentVersion/)
  assert.match(source, /currentVersion = result\.version/)
})

test('공통 예제는 version을 quoted ETag If-Match 헤더로 직렬화한다', () => {
  const source = readFileSync('examples/external-integration/rhwp-client.ts', 'utf8')
  const readme = readFileSync('examples/external-integration/README.md', 'utf8')

  assert.match(source, /'If-Match': `"\$\{String\(input\.version\)\}"`/)
  assert.doesNotMatch(source, /'If-Match': String\(input\.version\)/)
  assert.match(readme, /If-Match.*"3"/)
})

test('공통 예제 README는 조회 API의 권한 검증과 IDOR 방어를 설명한다', () => {
  const readme = readFileSync('examples/external-integration/README.md', 'utf8')

  assert.match(readme, /조회 API.*매 요청.*세션/)
  assert.match(readme, /문서별 read 권한/)
  assert.match(readme, /401/)
  assert.match(readme, /403/)
  assert.match(readme, /IDOR/)
})

// Next.js 서버 경계와 낙관적 잠금 계약 확인
test('Next.js 예제는 서버 권한, 포맷, version 충돌을 검증한다', () => {
  const route = readFileSync(
    'examples/nextjs-integration/app/api/documents/[documentId]/file/route.ts',
    'utf8',
  )

  assert.match(route, /requireSession/)
  assert.match(route, /assertCanEditDocument/)
  assert.match(route, /MAX_HWPX_BYTES/)
  assert.match(route, /409/)
  assert.match(route, /from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/server\/document-repository'/)
})

// Supabase private Storage와 append-only 이력 계약 확인
test('Supabase 예제는 private Storage와 append-only version을 사용한다', () => {
  const storage = readFileSync(
    'examples/nextjs-integration/server/supabase-document-storage.ts',
    'utf8',
  )
  const sql = readFileSync(
    'examples/nextjs-integration/sql/document-versions.sql',
    'utf8',
  )

  assert.match(storage, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(storage, /NEXT_PUBLIC_SUPABASE/)
  assert.match(sql, /document_versions/)
  assert.match(sql, /unique \(document_id, version\)/i)
})

// GET 응답의 한글 파일명과 read 권한 계약 확인
test('Next.js GET 예제는 read 권한과 ASCII-safe 파일명 헤더 계약을 유지한다', () => {
  const route = readFileSync(
    'examples/nextjs-integration/app/api/documents/[documentId]/file/route.ts',
    'utf8',
  )
  const client = readFileSync('examples/nextjs-integration/lib/api/documents.ts', 'utf8')

  assert.match(route, /assertCanReadDocument\(session\.userId, documentId\)/)
  assert.match(route, /createDocumentDownloadHeaders\(/)
  assert.match(client, /filename\*=UTF-8''\$\{encodeRfc5987Value\(fileName\)\}/)
  assert.match(client, /'X-Document-File-Name': encodeURIComponent\(fileName\)/)
  assert.match(client, /decodeURIComponent\(encodedFileName\)/)
})

// version 입력과 HTTP 오류 경계 계약 확인
test('Next.js 예제는 canonical version만 받고 내부 저장 오류를 500으로 숨긴다', () => {
  const route = readFileSync(
    'examples/nextjs-integration/app/api/documents/[documentId]/file/route.ts',
    'utf8',
  )
  const client = readFileSync('examples/nextjs-integration/lib/api/documents.ts', 'utf8')

  assert.match(route, /\^"\(0\|\[1-9\]\\d\*\)"\$/)
  assert.match(route, /Number\.isSafeInteger\(version\)/)
  assert.match(client, /\^\(0\|\[1-9\]\\d\*\)\$/)
  assert.match(client, /Number\.isSafeInteger\(version\)/)
  assert.match(route, /error instanceof RequestValidationError/)
  assert.match(route, /console\.error\('HWPX 저장 중 서버 오류'/)
  assert.match(route, /status: 500/)
})

// 경쟁 저장의 409 보존과 Supabase RPC 권한 계약 확인
test('경쟁 저장 정리 실패는 409을 보존하고 RPC는 service_role에만 권한을 부여한다', () => {
  const repository = readFileSync(
    'examples/nextjs-integration/server/document-repository.ts',
    'utf8',
  )
  const sql = readFileSync(
    'examples/nextjs-integration/sql/document-versions.sql',
    'utf8',
  )

  assert.match(repository, /await this\.cleanupOrphanObject\(storagePath\)/)
  assert.match(repository, /console\.error\('고아 HWPX object 정리 실패: GC 대상으로 남김'/)
  assert.match(
    repository,
    /private async cleanupOrphanObject[\s\S]*try \{[\s\S]*await this\.storage\.deleteObject\(storagePath\)[\s\S]*\} catch/,
  )
  assert.match(sql, /alter function public\.create_document_version[\s\S]*owner to postgres/i)
  assert.match(sql, /grant execute on function[\s\S]*to service_role/i)
  assert.match(sql, /revoke all on function[\s\S]*from public/i)
})

// editor 전환 중 이전 비동기 저장 결과 격리 계약 확인
test('HwpxEditor 예제는 generation과 callback ref로 이전 비동기 작업을 격리한다', () => {
  const editor = readFileSync('examples/nextjs-integration/components/HwpxEditor.tsx', 'utf8')

  assert.match(editor, /const generationRef = useRef\(0\)/)
  assert.match(editor, /const onErrorRef = useRef\(onError\)/)
  assert.match(editor, /generationRef\.current !== generation/)
  assert.match(editor, /onErrorRef\.current\?\./)
  assert.match(editor, /\}, \[documentId\]\)/)
})

// 테이블 Data API 우회 차단과 streaming body 제한 계약 확인
test('Supabase 예제는 테이블 직접 접근을 차단하고 PUT은 body stream을 제한한다', () => {
  const route = readFileSync(
    'examples/nextjs-integration/app/api/documents/[documentId]/file/route.ts',
    'utf8',
  )
  const documents = readFileSync('examples/nextjs-integration/lib/api/documents.ts', 'utf8')
  const sql = readFileSync(
    'examples/nextjs-integration/sql/document-versions.sql',
    'utf8',
  )

  assert.match(sql, /alter table public\.documents enable row level security/i)
  assert.match(sql, /alter table public\.document_versions enable row level security/i)
  assert.match(sql, /revoke all on table public\.documents, public\.document_versions from public/i)
  assert.match(sql, /revoke all on table public\.documents, public\.document_versions from anon, authenticated/i)
  assert.match(sql, /revoke all on table public\.documents, public\.document_versions from service_role/i)
  assert.match(sql, /grant select on table public\.documents to service_role/i)
  assert.match(route, /assertContentLengthWithinLimit\(request\.headers\.get\('content-length'\), MAX_HWPX_BYTES\)/)
  assert.match(route, /readBodyWithinLimit\(request\.body, MAX_HWPX_BYTES\)/)
  assert.doesNotMatch(route, /request\.arrayBuffer\(\)/)
  assert.match(documents, /await reader\.cancel\(/)
  assert.match(documents, /if \(!body\)/)
})

// 실제 Headers와 Response가 한글 파일명으로 생성되는지 확인
test('한글 파일명의 download header는 실제 Headers와 Response에서 ByteString 오류를 내지 않는다', () => {
  const url = moduleUrl('examples/nextjs-integration/lib/api/documents.ts')
  const output = runTypeScriptModule(`
    const { createDocumentDownloadHeaders } = await import(${JSON.stringify(url)})
    const headers = createDocumentDownloadHeaders({
      fileName: '경기 예술 계획.hwpx',
      version: 3,
      byteLength: 4,
      contentType: 'application/haansofthwpx',
    })
    const response = new Response(new Uint8Array([1, 2, 3, 4]), { headers })
    console.log(JSON.stringify({
      disposition: response.headers.get('content-disposition'),
      fileName: response.headers.get('x-document-file-name'),
    }))
  `)
  const result = JSON.parse(output)

  assert.match(result.disposition, /filename\*=UTF-8''%EA%B2%BD%EA%B8%B0/)
  assert.equal(result.fileName, '%EA%B2%BD%EA%B8%B0%20%EC%98%88%EC%88%A0%20%EA%B3%84%ED%9A%8D.hwpx')
})

// cleanup 실패가 conflict 반환을 throw로 바꾸지 않는지 확인
test('고아 object cleanup 실패에도 repository는 conflict 결과를 반환한다', () => {
  const url = moduleUrl('examples/nextjs-integration/server/document-repository.ts')
  const output = runTypeScriptModule(`
    const { DocumentRepository } = await import(${JSON.stringify(url)})
    const storage = {
      async getDocument() {
        return { id: 'document-1', fileName: 'document.hwpx', version: 0, storagePath: 'current.hwpx' }
      },
      async getObject() {
        throw new Error('not used')
      },
      async putObject() {},
      async deleteObject() {
        throw new Error('cleanup failed')
      },
      async commitNewVersion() {
        return { kind: 'conflict', currentVersion: 1 }
      },
    }
    const repository = new DocumentRepository(storage)
    const originalError = console.error
    console.error = () => {}
    const result = await repository.createVersion({
      documentId: 'document-1',
      expectedVersion: 0,
      bytes: new Uint8Array([80, 75, 3, 4]),
      actorId: 'actor-1',
    })
    console.error = originalError
    console.log(JSON.stringify(result))
  `)

  assert.deepEqual(JSON.parse(output), { kind: 'conflict', currentVersion: 1 })
})

// chunked body가 제한을 넘으면 즉시 취소하고 413으로 분류하는지 확인
test('streaming HWPX body는 Content-Length 우회에도 제한 초과 시 취소한다', () => {
  const url = moduleUrl('examples/nextjs-integration/lib/api/documents.ts')
  const output = runTypeScriptModule(`
    const { readBodyWithinLimit } = await import(${JSON.stringify(url)})
    let cancelled = false
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([80, 75, 3, 4]))
      },
      cancel() {
        cancelled = true
      },
    })
    try {
      await readBodyWithinLimit(body, 3)
    } catch (error) {
      console.log(JSON.stringify({ cancelled, status: error.status }))
    }
  `)

  assert.deepEqual(JSON.parse(output), { cancelled: true, status: 413 })
})
