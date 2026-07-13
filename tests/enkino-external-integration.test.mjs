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
  assert.match(route, /filename\*=UTF-8''\$\{encodeRfc5987Value\(fileName\)\}/)
  assert.match(route, /'X-Document-File-Name': encodeURIComponent\(fileName\)/)
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
