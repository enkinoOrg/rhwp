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
