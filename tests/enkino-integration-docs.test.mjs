import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('Enkino integration documentation contract', () => {
  const rootDir = process.cwd();
  const readme = readFileSync(resolve(rootDir, 'README.md'), 'utf8');
  const architecture = readFileSync(resolve(rootDir, 'docs/tech/architecture.md'), 'utf8');
  const deployment = readFileSync(resolve(rootDir, 'docs/tech/deployment.md'), 'utf8');
  const integration = readFileSync(resolve(rootDir, 'docs/tech/integration-guide.md'), 'utf8');
  const upstreamSync = readFileSync(resolve(rootDir, 'docs/tech/upstream-sync.md'), 'utf8');
  const workLog = readFileSync(resolve(rootDir, 'docs/logs/2026-08-06-upstream-동기화-enkino-재적용.md'), 'utf8');

  // Assertions specified by brief
  assert.match(integration, /studioUrl:\s*['"]https:\/\/rhwp\.enkinokorea\.workers\.dev/);
  assert.match(integration, /suppressDialogs:\s*true/);
  assert.match(integration, /boolean `true`/);
  assert.match(integration, /event\.origin/);
  assert.match(integration, /event\.source/);
  assert.doesNotMatch(integration, /SDK.*options.*지원하지 않/);
  assert.match(deployment, /npm run deploy:dry-run/);
  assert.match(upstreamSync, /upstream\/main/);

  // Readme links to integration guide
  assert.match(readme, /docs\/tech\/integration-guide\.md/);
});
