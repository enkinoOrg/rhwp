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
