import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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

  assert.match(source, /'If-Match': formatIfMatch\(input\.version\)/)
  assert.doesNotMatch(source, /'If-Match': String\(input\.version\)/)
  assert.match(readme, /If-Match.*"3"/)
})

test('공통 예제는 파일명과 canonical safe integer version을 Next.js 계약처럼 해석한다', () => {
  const source = readFileSync('examples/external-integration/rhwp-client.ts', 'utf8')

  assert.match(source, /export async function getHwpxDocument/)
  assert.match(source, /decodeURIComponent\(encodedFileName\)/)
  assert.match(source, /\^\(0\|\[1-9\]\\d\*\)\$/)
  assert.match(source, /Number\.isSafeInteger\(version\)/)
})

test('공통 예제는 non-canonical 또는 unsafe version으로 저장 요청을 만들지 않는다', () => {
  const source = readFileSync('examples/external-integration/rhwp-client.ts', 'utf8')

  assert.match(source, /function formatIfMatch/)
  assert.match(source, /!Number\.isSafeInteger\(version\)/)
  assert.match(source, /'If-Match': formatIfMatch\(input\.version\)/)
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

  assert.match(repository, /await this\.cleanupOrphanObject\(/)
  assert.match(repository, /recordOrphanObject/)
  assert.match(repository, /catch \(probeError\)[\s\S]*'commit-unknown'/)
  assert.match(
    repository,
    /private async cleanupOrphanObject[\s\S]*try \{[\s\S]*await this\.storage\.deleteObject\(reference\.storagePath\)[\s\S]*\} catch/,
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
  assert.match(editor, /const saveMutexRef = useRef\(false\)/)
  assert.match(editor, /generationRef\.current !== generation/)
  assert.match(editor, /onErrorRef\.current\?\./)
  assert.match(editor, /\}, \[documentId\]\)/)
  assert.doesNotMatch(editor, /onInput=/)
  assert.doesNotMatch(editor, /beforeunload/)
  assert.doesNotMatch(editor, /isDirty/)
  assert.match(editor, /disabled=\{isSaving\}/)
})

test('예제 문서는 change API 전까지 수동 저장 모델만 보장한다고 명시한다', () => {
  const commonReadme = readFileSync('examples/external-integration/README.md', 'utf8')
  const nextReadme = readFileSync('examples/nextjs-integration/README.md', 'utf8')

  for (const readme of [commonReadme, nextReadme]) {
    assert.match(readme, /iframe/)
    assert.match(readme, /change event API/)
    assert.match(readme, /수동 저장/)
    assert.match(readme, /dirty.*이탈 경고/)
  }
})

test('Next.js 가이드는 필수 HWPX 구조 validator와 제한 계약을 설명한다', () => {
  const route = readFileSync(
    'examples/nextjs-integration/app/api/documents/[documentId]/file/route.ts',
    'utf8',
  )
  const readme = readFileSync('examples/nextjs-integration/README.md', 'utf8')

  assert.match(route, /validateHwpxArchive/)
  assert.doesNotMatch(route, /bytes\[0\].*0x50/)

  for (const contract of [
    'mimetype',
    'version.xml',
    'Contents/content.hpf',
    'Contents/section0.xml',
    'META-INF/manifest.xml',
    'entry 수',
    '경로',
    'uncompressed',
    'XML',
  ]) {
    assert.match(readme, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('Next.js 가이드는 conflict를 onError로 전달하고 durable GC queue를 운영한다고 설명한다', () => {
  const readme = readFileSync('examples/nextjs-integration/README.md', 'utf8')
  const storage = readFileSync(
    'examples/nextjs-integration/server/supabase-document-storage.ts',
    'utf8',
  )
  const sql = readFileSync(
    'examples/nextjs-integration/sql/document-versions.sql',
    'utf8',
  )

  assert.match(readme, /DocumentVersionConflictError.*onError/)
  assert.match(readme, /document_storage_gc_queue/)
  assert.match(storage, /recordOrphanObject/)
  assert.match(storage, /resolved_at: null/)
  assert.match(sql, /document_storage_gc_queue/)
  assert.match(sql, /add column if not exists version integer/i)
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

test('Next.js 저장 응답도 canonical safe integer version만 허용한다', () => {
  const url = moduleUrl('examples/nextjs-integration/lib/api/documents.ts')
  const output = runTypeScriptModule(`
    globalThis.fetch = async () => Response.json({ version: Number.MAX_SAFE_INTEGER + 1 })
    const { saveDocumentFile } = await import(${JSON.stringify(url)})
    try {
      await saveDocumentFile('document-1', { bytes: new Uint8Array([1]), version: 0 })
    } catch (error) {
      console.log(error.message)
    }
  `)

  assert.equal(output, '서버가 유효하지 않은 문서 version을 반환했습니다.')
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
      async recordOrphanObject() {},
      async commitNewVersion() {
        return { kind: 'conflict', currentVersion: 1 }
      },
    }
    const repository = new DocumentRepository(storage, async () => {})
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

test('commit 응답이 유실돼도 재조회에서 committed면 저장 성공을 복구한다', () => {
  const url = moduleUrl('examples/nextjs-integration/server/document-repository.ts')
  const output = runTypeScriptModule(`
    const { DocumentRepository } = await import(${JSON.stringify(url)})
    let deleted = false
    const storage = {
      async getDocument() {
        return { id: 'document-1', fileName: 'document.hwpx', version: 0, storagePath: 'current.hwpx' }
      },
      async getObject() { throw new Error('not used') },
      async putObject() {},
      async deleteObject() { deleted = true },
      async recordOrphanObject() {},
      async resolveVersionCommit() { return { kind: 'committed', version: 1 } },
      async commitNewVersion() { throw new Error('response lost') },
    }
    const repository = new DocumentRepository(storage, async () => {})
    const result = await repository.createVersion({
      documentId: 'document-1',
      expectedVersion: 0,
      bytes: new Uint8Array([1]),
      actorId: 'actor-1',
    })
    console.log(JSON.stringify({ deleted, result }))
  `)

  assert.deepEqual(JSON.parse(output), {
    deleted: false,
    result: { kind: 'saved', version: 1 },
  })
})

test('commit 재조회 version이 요청과 다르면 unknown으로 보존한다', () => {
  const url = moduleUrl('examples/nextjs-integration/server/document-repository.ts')
  const output = runTypeScriptModule(`
    const { DocumentRepository } = await import(${JSON.stringify(url)})
    let gcRecord
    const storage = {
      async getDocument() {
        return { id: 'document-1', fileName: 'document.hwpx', version: 0, storagePath: 'current.hwpx' }
      },
      async getObject() { throw new Error('not used') },
      async putObject() {}, async deleteObject() {},
      async recordOrphanObject(input) { gcRecord = input },
      async resolveVersionCommit() { return { kind: 'committed', version: 2 } },
      async commitNewVersion() { throw new Error('response lost') },
    }
    const repository = new DocumentRepository(storage, async () => {})
    let failed = false
    try {
      await repository.createVersion({
        documentId: 'document-1', expectedVersion: 0,
        bytes: new Uint8Array([1]), actorId: 'actor-1',
      })
    } catch { failed = true }
    console.log(JSON.stringify({ failed, reason: gcRecord?.reason }))
  `)

  assert.deepEqual(JSON.parse(output), { failed: true, reason: 'commit-unknown' })
})

test('commit 재조회가 definitely not committed일 때만 cleanup하고 원 오류를 보존한다', () => {
  const url = moduleUrl('examples/nextjs-integration/server/document-repository.ts')
  const output = runTypeScriptModule(`
    const { DocumentRepository } = await import(${JSON.stringify(url)})
    const commitError = new Error('response lost')
    const calls = []
    const storage = {
      async getDocument() {
        return { id: 'document-1', fileName: 'document.hwpx', version: 0, storagePath: 'current.hwpx' }
      },
      async getObject() { throw new Error('not used') },
      async putObject() {},
      async deleteObject() { calls.push('delete') },
      async recordOrphanObject() {},
      async resolveVersionCommit() { calls.push('resolve'); return { kind: 'not-committed' } },
      async commitNewVersion() { throw commitError },
    }
    const repository = new DocumentRepository(storage, async () => {})
    let sameError = false
    try {
      await repository.createVersion({
        documentId: 'document-1', expectedVersion: 0,
        bytes: new Uint8Array([1]), actorId: 'actor-1',
      })
    } catch (error) { sameError = error === commitError }
    console.log(JSON.stringify({ calls, sameError }))
  `)

  assert.deepEqual(JSON.parse(output), {
    calls: ['resolve', 'delete'],
    sameError: true,
  })
})

test('commit 재조회 unknown은 삭제하지 않고 durable GC에 기록한다', () => {
  const url = moduleUrl('examples/nextjs-integration/server/document-repository.ts')
  const output = runTypeScriptModule(`
    const { DocumentRepository } = await import(${JSON.stringify(url)})
    let deleted = false
    let gcRecord
    const storage = {
      async getDocument() {
        return { id: 'document-1', fileName: 'document.hwpx', version: 0, storagePath: 'current.hwpx' }
      },
      async getObject() { throw new Error('not used') },
      async putObject() {},
      async deleteObject() { deleted = true },
      async recordOrphanObject(input) { gcRecord = input },
    async resolveVersionCommit() { return { kind: 'unknown' } },
      async commitNewVersion() { throw new Error('response lost') },
    }
    const repository = new DocumentRepository(storage, async () => {})
    try {
      await repository.createVersion({
        documentId: 'document-1', expectedVersion: 0,
        bytes: new Uint8Array([1]), actorId: 'actor-1',
      })
    } catch {}
    console.log(JSON.stringify({ deleted, reason: gcRecord?.reason, version: gcRecord?.version }))
  `)

  assert.deepEqual(JSON.parse(output), {
    deleted: false,
    reason: 'commit-unknown',
    version: 1,
  })
})

test('GC는 DB 참조 여부를 재조회한 뒤에만 unreferenced object를 삭제한다', () => {
  const url = moduleUrl('examples/nextjs-integration/server/document-storage-gc.ts')
  const output = runTypeScriptModule(`
    const { collectDocumentStorageGarbage } = await import(${JSON.stringify(url)})
    const calls = []
    const storage = {
      async resolveVersionCommit() { calls.push('resolve'); return { kind: 'not-committed' } },
      async deleteObject() { calls.push('delete') },
      async markOrphanObjectResolved() { calls.push('mark-resolved') },
    }
    const result = await collectDocumentStorageGarbage(storage, {
      documentId: 'document-1', version: 1, storagePath: 'candidate.hwpx',
    })
    const referencedCalls = []
    const referencedResult = await collectDocumentStorageGarbage({
      async resolveVersionCommit() { referencedCalls.push('resolve'); return { kind: 'committed', version: 1 } },
      async deleteObject() { referencedCalls.push('delete') },
      async markOrphanObjectResolved() { referencedCalls.push('mark-resolved') },
    }, {
      documentId: 'document-1', version: 1, storagePath: 'referenced.hwpx',
    })
    console.log(JSON.stringify({ calls, result, referencedCalls, referencedResult }))
  `)

  assert.deepEqual(JSON.parse(output), {
    calls: ['resolve', 'delete', 'mark-resolved'],
    result: 'deleted',
    referencedCalls: ['resolve', 'mark-resolved'],
    referencedResult: 'referenced',
  })
})

test('fail-closed HWPX validator는 archive 구조와 크기 제한을 모두 강제한다', () => {
  const url = moduleUrl('examples/nextjs-integration/server/validate-hwpx-archive.ts')
  const output = runTypeScriptModule(`
    const { createHwpxArchiveValidator } = await import(${JSON.stringify(url)})
    const required = [
      'mimetype', 'version.xml', 'Contents/content.hpf', 'Contents/header.xml',
      'Contents/section0.xml', 'META-INF/manifest.xml',
    ]
    const entry = (path, size = 4, text = '<x/>') => ({
      path, uncompressedSize: size, async readText() {
        return path === 'mimetype' ? text : '<x/>'
      },
    })
    const valid = required.map(path => entry(
      path, 4, path === 'mimetype' ? 'application/hwp+zip' : '<x/>',
    ))
    async function rejects(entries, limits = {}) {
      const validate = createHwpxArchiveValidator({ async inspect() { return entries } }, {
        maxEntries: 10, maxEntryBytes: 20, maxTotalUncompressedBytes: 60,
        maxXmlBytes: 10, ...limits,
      })
      try { await validate(new Uint8Array([1])); return false } catch { return true }
    }
    const results = {
      valid: await rejects(valid),
      traversal: await rejects([...valid, entry('../escape.xml')]),
      duplicate: await rejects([...valid, entry('version.xml')]),
      missing: await rejects(valid.filter(item => item.path !== 'version.xml')),
      mimetype: await rejects(valid.map(item => item.path === 'mimetype' ? entry('mimetype', 4, 'bad') : item)),
      entryLimit: await rejects(valid, { maxEntryBytes: 3 }),
      totalLimit: await rejects(valid, { maxTotalUncompressedBytes: 20 }),
      xmlLimit: await rejects(valid, { maxXmlBytes: 3 }),
      countLimit: await rejects(valid, { maxEntries: 5 }),
    }
    console.log(JSON.stringify(results))
  `)

  assert.deepEqual(JSON.parse(output), {
    valid: false,
    traversal: true,
    duplicate: true,
    missing: true,
    mimetype: true,
    entryLimit: true,
    totalLimit: true,
    xmlLimit: true,
    countLimit: true,
  })
})

test('HWPX 구조 validator가 성공하기 전에는 object를 업로드하지 않는다', () => {
  const url = moduleUrl('examples/nextjs-integration/server/document-repository.ts')
  const output = runTypeScriptModule(`
    const { DocumentRepository } = await import(${JSON.stringify(url)})
    let putCalled = false
    const storage = {
      async getDocument() {
        return { id: 'document-1', fileName: 'document.hwpx', version: 0, storagePath: 'current.hwpx' }
      },
      async getObject() { throw new Error('not used') },
      async putObject() { putCalled = true },
      async deleteObject() {},
      async recordOrphanObject() {},
      async commitNewVersion() { return { kind: 'saved', version: 1 } },
    }
    const repository = new DocumentRepository(storage, async () => {
      throw new Error('invalid archive')
    })
    let message
    try {
      await repository.createVersion({
        documentId: 'document-1',
        expectedVersion: 0,
        bytes: new Uint8Array([80, 75, 3, 4]),
        actorId: 'actor-1',
      })
    } catch (error) {
      message = error.message
    }
    console.log(JSON.stringify({ message, putCalled }))
  `)

  assert.deepEqual(JSON.parse(output), {
    message: 'invalid archive',
    putCalled: false,
  })
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

test('Next.js route와 component 예제는 fixture 의존성으로 TypeScript compile된다', () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'rhwp-next-example-'))
  const stubsPath = join(fixtureDirectory, 'stubs.d.ts')

  try {
    writeFileSync(
      stubsPath,
      `
declare const process: { env: Record<string, string | undefined> }
declare namespace JSX { interface IntrinsicElements { [name: string]: unknown } }
declare module 'server-only' {}
declare module 'react' {
  export function useRef<T>(value: T): { current: T }
  export function useRef<T>(value: T | null): { current: T | null }
  export function useState<T>(value: T): [T, (value: T) => void]
  export function useEffect(effect: () => void | (() => void), deps: readonly unknown[]): void
  export function useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]): T
}
declare module 'react/jsx-runtime' { export const jsx: unknown; export const jsxs: unknown }
declare module '@rhwp/editor' {
  export interface RhwpEditor {
    loadFile(bytes: ArrayBuffer | Uint8Array, fileName: string): Promise<void>
    exportHwpx(): Promise<Uint8Array>
    destroy(): void
  }
  export function createEditor(container: HTMLElement | string, options: unknown): Promise<RhwpEditor>
}
declare module 'next/server' { export class NextRequest extends Request {} }
declare module '@supabase/supabase-js' {
  export type SupabaseClient = any
  export function createClient(...args: unknown[]): SupabaseClient
}
declare module '@/server/auth/document-access' {
  export function requireSession(): Promise<{ userId: string }>
  export function assertCanReadDocument(userId: string, documentId: string): Promise<void>
  export function assertCanEditDocument(userId: string, documentId: string): Promise<void>
}
declare module '@/server/security/zip-inspector' {
  export const zipInspector: {
    inspect(bytes: Uint8Array): Promise<readonly {
      path: string
      uncompressedSize: number
      readText(maxBytes: number): Promise<string>
    }[]>
  }
}
`,
    )

    const result = spawnSync(
      resolve('rhwp-studio/node_modules/.bin/tsc'),
      [
        '--noEmit',
        '--strict',
        '--skipLibCheck',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--jsx',
        'react-jsx',
        '--lib',
        'ES2022,DOM',
        stubsPath,
        resolve('examples/external-integration/rhwp-client.ts'),
        resolve('examples/nextjs-integration/components/HwpxEditor.tsx'),
        resolve('examples/nextjs-integration/app/api/documents/[documentId]/file/route.ts'),
        resolve('examples/nextjs-integration/server/document-storage-gc.ts'),
      ],
      { encoding: 'utf8' },
    )

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true })
  }
})

// 상세 가이드의 실제 예제 연결과 운영 계약 확인
test('상세 가이드는 구현과 운영에 필요한 필수 섹션을 제공한다', () => {
  const guide = readFileSync('docs/tech/integration-guide.md', 'utf8')
  const readme = readFileSync('README.md', 'utf8')
  const architecture = readFileSync('docs/tech/architecture.md', 'utf8')

  for (const heading of [
    '책임 경계',
    '전체 데이터 흐름',
    '최소 예제',
    'Next.js App Router',
    'Supabase private Storage',
    '버전 충돌',
    '보안',
    '테스트',
    '운영 체크리스트',
    '문제 해결',
  ]) {
    assert.match(guide, new RegExp(heading))
  }

  for (const contract of [
    'createRhwpDocumentSession',
    'saveHwpxDocument',
    'getDocumentFile',
    'saveDocumentFile',
    'createDocumentDownloadHeaders',
    'DocumentRepository',
    'SupabaseDocumentStorage',
    'validate-hwpx-archive.ts',
    'document-storage-gc.ts',
    'GET 200',
    'PUT 200',
    '413',
    'quoted ETag',
    'append-only',
    'orphan',
    '50MB',
    'commit-unknown',
    '0.7.19',
    'filename\\*',
    'editor.destroy',
    '로컬 글꼴',
  ]) {
    assert.match(guide, new RegExp(contract.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')))
  }

  assert.match(guide, /축약 예제/)
  assert.match(guide, /인증 token/)
  assert.match(guide, /signed URL/)
  assert.match(guide, /매 요청.*세션.*권한/)
  assert.match(readme, /docs\/tech\/integration-guide\.md/)
  assert.match(architecture, /integration-guide\.md/)
})

test('연동 문서는 SDK 최소 버전과 commit-unknown 및 validator 실제 경로를 공유한다', () => {
  const documents = [
    readFileSync('README.md', 'utf8').split('<p align="center">')[0],
    readFileSync('examples/external-integration/README.md', 'utf8'),
    readFileSync('examples/nextjs-integration/README.md', 'utf8'),
    readFileSync('docs/tech/integration-guide.md', 'utf8'),
    readFileSync('docs/logs/2026-07-14-외부-rhwp-연동-가이드.md', 'utf8'),
  ]

  for (const document of documents) {
    assert.match(document, /0\.7\.19/)
  }

  for (const document of documents.slice(2)) {
    assert.match(document, /validate-hwpx-archive\.ts/)
    assert.match(document, /commit-unknown/)
    assert.match(document, /document-storage-gc\.ts/)
  }
})
