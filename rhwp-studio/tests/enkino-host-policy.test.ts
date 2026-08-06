import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function source(path: string): string {
  return readFileSync(join(rootDir, path), 'utf8');
}

test('Enkino Worker는 Studio dist와 로컬 글꼴 차단 정책을 사용한다', () => {
  const wrangler = JSON.parse(source('../wrangler.jsonc'));
  const headers = source('public/_headers');
  assert.equal(wrangler.name, 'rhwp');
  assert.equal(wrangler.assets.directory, './rhwp-studio/dist');
  assert.match(headers, /Permissions-Policy: local-fonts=\(\)/);
});
