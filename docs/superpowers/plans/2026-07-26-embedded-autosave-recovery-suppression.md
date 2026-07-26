# Embedded Autosave Recovery Suppression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent RHWP Studio's initial autosave recovery dialog when the Studio is embedded in an iframe, while preserving standalone recovery.

**Architecture:** Extend the existing initial-recovery policy function with a same-object comparison between `window.parent` and `window`. Test the actual function declaration in a VM so the regression test covers production policy without exporting a test-only API.

**Tech Stack:** TypeScript, Node.js test runner, TypeScript compiler API, Vite

## Global Constraints

- Lawgent SDK를 포함한 iframe 임베드에서는 초기 자동복구 창을 표시하지 않는다.
- RHWP Studio 단독 실행에서는 기존 자동복구 기능을 유지한다.
- `?url=...` 직접 문서 로드에서는 기존처럼 초기 자동복구 창을 표시하지 않는다.
- Lawgent SDK, 자동저장 데이터 구조, 복구 UI와 `suppressDialogs`의 의미는 변경하지 않는다.

---

### Task 1: Initial recovery policy regression

**Files:**
- Create: `rhwp-studio/tests/autosave-recovery-policy.test.ts`
- Modify: `rhwp-studio/src/main.ts:744-747`

**Interfaces:**
- Consumes: browser globals `window.parent` and `window.location.search`
- Produces: `shouldSkipInitialAutosaveRecovery(): boolean`

- [ ] **Step 1: Write the failing regression test**

Create `rhwp-studio/tests/autosave-recovery-policy.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';

const studioDir = dirname(dirname(fileURLToPath(import.meta.url)));

function loadPolicy(search: string, embedded: boolean): () => boolean {
  const sourceText = readFileSync(join(studioDir, 'src/main.ts'), 'utf8');
  const sourceFile = ts.createSourceFile(
    'main.ts',
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  const declaration = sourceFile.statements.find(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'shouldSkipInitialAutosaveRecovery',
  );
  assert.ok(declaration, '초기 자동복구 정책 함수를 찾을 수 있어야 한다');

  const transpiled = ts.transpileModule(
    `${declaration.getText(sourceFile)}
globalThis.__policy = shouldSkipInitialAutosaveRecovery;`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const topWindow: { location: { search: string }; parent?: unknown } = {
    location: { search },
  };
  const currentWindow: { location: { search: string }; parent?: unknown } = embedded
    ? { location: { search }, parent: topWindow }
    : topWindow;
  currentWindow.parent ??= currentWindow;
  const context = { URLSearchParams, window: currentWindow } as Record<string, unknown>;
  runInNewContext(transpiled, context);
  return context.__policy as () => boolean;
}

test('단독 Studio는 초기 자동복구를 유지한다', () => {
  assert.equal(loadPolicy('', false)(), false);
});

test('URL 문서 로드는 초기 자동복구를 건너뛴다', () => {
  assert.equal(loadPolicy('?url=%2Fsamples%2Fsample.hwp', false)(), true);
});

test('iframe 임베드 Studio는 초기 자동복구를 건너뛴다', () => {
  assert.equal(loadPolicy('', true)(), true);
});
```

- [ ] **Step 2: Run the regression test and verify RED**

Run:

```bash
rtk test npm test -- --test-name-pattern='초기 자동복구|iframe 임베드|URL 문서 로드|단독 Studio'
```

Expected: two existing-policy cases pass and `iframe 임베드 Studio는 초기 자동복구를 건너뛴다` fails because the function returns `false`.

- [ ] **Step 3: Implement the minimal policy change**

Change `shouldSkipInitialAutosaveRecovery` in `rhwp-studio/src/main.ts` to:

```ts
function shouldSkipInitialAutosaveRecovery(): boolean {
  const params = new URLSearchParams(window.location.search);
  return window.parent !== window || params.has('url');
}
```

- [ ] **Step 4: Verify GREEN and build**

Run:

```bash
rtk test npm test
rtk npm run build
```

Expected: all unit tests pass and the production build exits with code 0.

- [ ] **Step 5: Commit the implementation**

```bash
rtk git add rhwp-studio/tests/autosave-recovery-policy.test.ts rhwp-studio/src/main.ts
rtk git commit -m "RHWP 임베드 초기 자동복구 창 억제"
```

### Task 2: Deployment and browser verification

**Files:**
- Modify only deployment records if the repository's existing deployment workflow creates them.

**Interfaces:**
- Consumes: the committed RHWP Studio build
- Produces: a deployed RHWP Studio version used by Lawgent

- [ ] **Step 1: Push the RHWP commits**

```bash
rtk git push origin main
```

Expected: the remote `main` contains the design, plan, and implementation commits.

- [ ] **Step 2: Deploy with the repository's existing RHWP deployment command**

Run from the repository root:

```bash
rtk npm run deploy
```

Expected: Wrangler uploads the current `rhwp-studio/dist` assets and creates a new `rhwp` Worker deployment without changing environment variables or routing.

- [ ] **Step 3: Verify the deployed asset**

Open `https://rhwp.enkinokorea.workers.dev/`. If an older asset is active, run the following in that page and reload once:

```js
await (await navigator.serviceWorker.getRegistration())?.update();
location.reload();
```

Confirm the current deployment with:

```bash
rtk proxy npx wrangler deployments list --name rhwp
rtk proxy curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://rhwp.enkinokorea.workers.dev/
```

Expected: the newest deployment is active and the root responds `200 text/html`.

- [ ] **Step 4: Verify the Lawgent project**

Open:

```text
https://lawgent.kr/projects/v2/174bfb00-cebf-44b3-be7e-d1495ee6c292?popup=true
```

With the existing unrelated autosave draft still present in browser storage, open the draft and verify:

- no `문서 복구` dialog appears;
- the project draft loads in the RHWP iframe;
- the loaded page count is visible;
- the save action is enabled.

- [ ] **Step 5: Record exact verification results**

Report the RHWP commit, deployment version, loaded document/page count, and any incomplete or skipped verification explicitly.
