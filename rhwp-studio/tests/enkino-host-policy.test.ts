import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

// Studio 소스 조회 헬퍼
function source(path: string): string {
  return readFileSync(join(rootDir, path), 'utf8');
}

test('Enkino 호스트는 문서 로드 중 로컬 글꼴 권한 안내를 호출하지 않는다', () => {
  const main = source('src/main.ts');

  assert.doesNotMatch(main, /await promptLocalFontsIfNeeded\(docInfo, displayName\)/);
});
