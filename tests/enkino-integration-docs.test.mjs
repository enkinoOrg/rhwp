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

  // Package.json script contract validation for deployment docs
  const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'));
  const npmRunMatches = [...deployment.matchAll(/npm run ([a-zA-Z0-9:-]+)/g)];
  assert.ok(npmRunMatches.length > 0, 'deployment.md should contain npm run commands');
  for (const match of npmRunMatches) {
    const scriptName = match[1];
    assert.ok(
      Object.prototype.hasOwnProperty.call(packageJson.scripts, scriptName),
      `deployment.md references non-existent script "npm run ${scriptName}"`
    );
  }
  assert.doesNotMatch(deployment, /npm run build:studio/);

  // Wrangler config contract validation for deployment docs
  const wranglerContent = readFileSync(resolve(rootDir, 'wrangler.jsonc'), 'utf8');
  const wranglerConfig = JSON.parse(
    wranglerContent.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1')
  );

  assert.match(
    deployment,
    new RegExp(`"compatibility_date":\\s*"${wranglerConfig.compatibility_date}"`)
  );
  assert.match(
    deployment,
    new RegExp(`"not_found_handling":\\s*"${wranglerConfig.assets.not_found_handling}"`)
  );
  assert.match(
    deployment,
    new RegExp(`"html_handling":\\s*"${wranglerConfig.assets.html_handling}"`)
  );
  assert.match(
    deployment,
    new RegExp(`"directory":\\s*"${wranglerConfig.assets.directory.replace('./', '\\./')}"`)
  );

  if (!wranglerConfig.assets.binding) {
    assert.doesNotMatch(deployment, /"binding":\s*"ASSETS"/);
  }
});
