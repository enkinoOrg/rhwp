# Upstream 동기화 Enkino 재적용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `upstream/main@2dced7bfe` 구조를 보존하면서 Enkino Cloudflare 호스팅, strict `suppressDialogs`, 로드 UI 정책, HWPX lineseg 후검증을 최소 패치로 재적용한다.

**Architecture:** upstream `transport.js`, v1 MessageChannel, 렌더러·편집 구조를 권위로 유지한다. Enkino 변경은 호스팅 설정, SDK option 정규화, Studio 로드 UI, Rust 검증 보고로 분리해 TDD로 이식한다.

**Tech Stack:** Rust 1.93.1, wasm-pack 0.15.0, TypeScript 7, Node test runner, Vite 8, Cloudflare Wrangler 4

## Global Constraints

- 기준 커밋은 `2dced7bfe10c6597cead634264c7c1781c01f1e7`이다.
- 통합 브랜치는 `enkino/upstream-2dced7b-sync`다.
- 공개 SDK `DEFAULT_STUDIO_URL` `https://edwardkim.github.io/rhwp/`를 유지한다.
- Enkino 소비자는 `studioUrl: 'https://rhwp.enkinokorea.workers.dev'`를 명시한다.
- `suppressDialogs` 원본이 정확한 boolean `true`일 때만 대화상자를 생략한다.
- upstream `npm/editor/transport.js`와 `rhwp-studio/src/embed/` 프로토콜 구조를 보존한다.
- 문서 로드 중 로컬 글꼴 권한을 자동 요청하지 않는다.
- upstream에서 이미 제거된 HWPX 저장 안내를 다시 추가하지 않는다.
- `.github/workflows/deploy-pages.yml`은 Enkino 브랜치에서 삭제한다.
- `md-to-hwpx/.github/workflows/deploy.yml`을 변경·실행하지 않는다.
- 새 dependency를 추가하지 않는다.
- 각 생산 변경은 RED를 확인한 테스트 후에만 작성한다.
- 커밋 메시지와 사용자 문서는 한국어로 작성한다.
- 푸시·Worker 배포·npm 발행은 자동 범위에 포함하지 않는다.

---

### Task 1: Cloudflare Workers 호스팅 경계 재적용

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `wrangler.jsonc`
- Create: `rhwp-studio/public/_headers`
- Create: `rhwp-studio/tests/enkino-host-policy.test.ts`
- Delete: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: upstream `rhwp-studio/package.json` `build`/`test`, root `wasm-pack` build
- Produces: `npm run build`, `npm test`, `npm run deploy:dry-run`, Worker `rhwp` static asset contract

- [ ] **Step 1: Write the failing host policy test**

`rhwp-studio/tests/enkino-host-policy.test.ts` creates a repository-root reader and asserts:

```ts
test('Enkino Worker는 Studio dist와 로컬 글꼴 차단 정책을 사용한다', () => {
  const wrangler = JSON.parse(source('../wrangler.jsonc'));
  const headers = source('public/_headers');
  assert.equal(wrangler.name, 'rhwp');
  assert.equal(wrangler.assets.directory, './rhwp-studio/dist');
  assert.match(headers, /Permissions-Policy: local-fonts=\(\)/);
});
```

The helper resolves `../wrangler.jsonc` from `rhwp-studio` to the repository root and strips no JSON comments because the file is strict JSON-compatible JSONC.

- [ ] **Step 2: Verify RED**

Run:

```bash
rtk proxy node --test rhwp-studio/tests/enkino-host-policy.test.ts
```

Expected: FAIL because `wrangler.jsonc` and `_headers` do not exist.

- [ ] **Step 3: Add the minimal hosting files**

Create `wrangler.jsonc` with:

```json
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "rhwp",
  "compatibility_date": "2026-07-13",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./rhwp-studio/dist",
    "not_found_handling": "single-page-application",
    "html_handling": "auto-trailing-slash"
  },
  "observability": { "enabled": true, "head_sampling_rate": 1 }
}
```

Create `rhwp-studio/public/_headers` with `nosniff`, `no-referrer`, `local-fonts=()`, and immutable `/assets/*` caching. Add root scripts that call `wasm-pack build --target web --release`, `npm --prefix rhwp-studio ci`, Studio build/test, and `wrangler deploy --dry-run`. Pin existing Wrangler `4.110.0`; add no other dependency. Remove only the repository-local Pages workflow.

- [ ] **Step 4: Verify GREEN and root scripts**

Run:

```bash
rtk proxy node --test rhwp-studio/tests/enkino-host-policy.test.ts
rtk proxy npm install --package-lock-only
rtk git diff --check
```

Expected: host policy PASS; lockfile is generated without changing Studio dependencies; diff check exits 0.

- [ ] **Step 5: Commit**

```bash
rtk git add package.json package-lock.json wrangler.jsonc rhwp-studio/public/_headers rhwp-studio/tests/enkino-host-policy.test.ts .github/workflows/deploy-pages.yml
rtk git diff --cached --check
rtk git commit -m "Enkino Cloudflare 호스팅 경계 복원"
```

### Task 2: SDK `suppressDialogs` strict opt-in

**Files:**
- Modify: `npm/editor/tests/load-file-options.contract.test.mjs`
- Modify: `npm/editor/index.js`
- Modify: `npm/editor/index.d.ts`
- Modify: `npm/editor/README.md`

**Interfaces:**
- Consumes: `RhwpEditor.loadFile(data, fileName, options)`, upstream `EditorTransport.request`
- Produces: payload field `suppressDialogs: options.suppressDialogs === true`

- [ ] **Step 1: Change the contract test first**

Extend inputs with a truthy string and require omission to remain interactive:

```js
await editor.loadFile(data, 'omitted.hwp');
await editor.loadFile(data, 'false.hwp', { suppressDialogs: false });
await editor.loadFile(data, 'true.hwp', { suppressDialogs: true });
await editor.loadFile(data, 'string.hwp', { suppressDialogs: 'true' });

assert.deepEqual(requests.map(({ params }) => params.suppressDialogs), [
  false, false, true, false,
]);
```

The string intentionally bypasses TypeScript through JavaScript runtime input and proves strict normalization.

- [ ] **Step 2: Verify RED**

```bash
rtk proxy node --test npm/editor/tests/load-file-options.contract.test.mjs
```

Expected: FAIL because omitted upstream options currently send `true`.

- [ ] **Step 3: Apply the minimal SDK change**

In `RhwpEditor.loadFile`, retain `data`, `fileName`, and `skipUnsavedGuard`; change only:

```js
suppressDialogs: options.suppressDialogs === true,
```

Do not edit `transport.js` or `DEFAULT_STUDIO_URL`.

- [ ] **Step 4: Update types and SDK docs**

Keep `suppressDialogs?: boolean` and document default `false`, exact `true` opt-in, and explicit Enkino `studioUrl`. Remove upstream text claiming omitted options suppress dialogs. Do not claim the Enkino URL is the public SDK default.

- [ ] **Step 5: Verify GREEN and transport regression**

```bash
rtk proxy node --test npm/editor/tests/*.test.mjs
rtk grep -n "DEFAULT_STUDIO_URL = 'https://edwardkim.github.io/rhwp/'" npm/editor/index.js
rtk git diff --check
```

Expected: all SDK tests pass and the upstream default URL remains present.

- [ ] **Step 6: Commit**

```bash
rtk git add npm/editor/index.js npm/editor/index.d.ts npm/editor/README.md npm/editor/tests/load-file-options.contract.test.mjs
rtk git diff --cached --check
rtk git commit -m "임베드 대화상자 억제를 명시 옵션으로 제한"
```

### Task 3: Studio validation, local-font, autosave policies

**Files:**
- Modify: `rhwp-studio/src/main.ts`
- Create: `rhwp-studio/src/core/load-dialog-policy.ts`
- Create: `rhwp-studio/src/core/initial-autosave-policy.ts`
- Create: `rhwp-studio/tests/enkino-load-policy.test.ts`
- Create: `rhwp-studio/tests/autosave-recovery-policy.test.ts`
- Verify: `rhwp-studio/src/embed/rpc-router.ts`
- Verify: `rhwp-studio/tests/embed-protocol.test.ts`

**Interfaces:**
- Consumes: `initializeDocument(docInfo, displayName, { suppressDialogs })`, `wasm.getValidationWarnings()`, `showValidationModalIfNeeded`
- Produces: `validationDialogAction(sourceFormat, warningCount, suppressDialogs): 'none' | 'prompt'`, `shouldSkipInitialAutosaveRecovery(search, embedded): boolean`, interactive residual-warning modal, no automatic local-font prompt

- [ ] **Step 1: Write RED tests for load-dialog policy and initialization behavior**

Create `enkino-load-policy.test.ts`. Import the wished-for real policy function and assert literal outcomes:

```ts
assert.equal(validationDialogAction('hwpx', 1, false), 'prompt');
assert.equal(validationDialogAction('hwpx', 1, true), 'none');
assert.equal(validationDialogAction('hwpx', 0, false), 'none');
assert.equal(validationDialogAction('hwp', 1, false), 'none');
```

The production mutation this catches is global warning suppression or a non-HWPX modal. The test initially fails because `src/core/load-dialog-policy.ts` does not exist.

In the same file, execute `initializeDocument` through a focused TypeScript VM harness with real policy logic and dependency fakes. Assert: prompt action calls `showValidationModalIfNeeded` once; suppress action calls it zero times; choosing `auto-fix` calls `reflowLinesegs`, reloads the canvas, and marks `validation-auto-fix`; neither path calls the local-font permission prompt. Fakes mirror `DocumentInfo`, validation report, canvas, document state, input, toolbar, and progress dependencies used by the real function.

- [ ] **Step 2: Write RED tests for autosave and removed save notice**

Create `autosave-recovery-policy.test.ts` importing `shouldSkipInitialAutosaveRecovery` from the wished-for `src/core/initial-autosave-policy.ts`. Pass explicit values rather than reading global window state:

```ts
assert.equal(shouldSkipInitialAutosaveRecovery('', false), false);
assert.equal(shouldSkipInitialAutosaveRecovery('?url=%2Fsamples%2Fsample.hwp', false), true);
assert.equal(shouldSkipInitialAutosaveRecovery('', true), true);
```

Do not add a source-presence test for the already removed HWPX save notice. No production code should resurrect that notice.

- [ ] **Step 3: Verify RED and baseline characterization**

```bash
rtk proxy node --test rhwp-studio/tests/document-initialization-order.test.ts rhwp-studio/tests/enkino-load-policy.test.ts rhwp-studio/tests/autosave-recovery-policy.test.ts
```

Expected: FAIL because both policy modules are absent. After the modules exist but before `main.ts` wiring, the initialization behavior assertions still fail because upstream globally opens as-is and prompts local fonts.

- [ ] **Step 4: Implement the pure policies and restore the validation modal minimally**

Create `load-dialog-policy.ts`:

```ts
export type ValidationDialogAction = 'none' | 'prompt';

export function validationDialogAction(
  sourceFormat: string,
  warningCount: number,
  suppressDialogs: unknown,
): ValidationDialogAction {
  return sourceFormat === 'hwpx' && warningCount > 0 && suppressDialogs !== true
    ? 'prompt'
    : 'none';
}
```

Create `initial-autosave-policy.ts`:

```ts
export function shouldSkipInitialAutosaveRecovery(search: string, embedded: boolean): boolean {
  return new URLSearchParams(search).has('url') || embedded;
}
```

Import `showValidationModalIfNeeded`. In the existing HWPX validation branch:

```ts
let normalizedDuringLoad = false;
const report = wasm.getValidationWarnings();
if (validationDialogAction(docInfo.sourceFormat, report.count, options.suppressDialogs) === 'prompt') {
  const choice = await showValidationModalIfNeeded(report);
  if (choice === 'auto-fix') {
    const normalized = wasm.reflowLinesegs();
    if (normalized > 0) {
      await canvasView?.loadDocument();
      normalizedDuringLoad = true;
    }
  }
}
if (normalizedDuringLoad) {
  documentState.markDirty('validation-auto-fix');
} else {
  documentState.markClean('document-initialized');
}
```

Preserve the HML warning branch, progress updates, CanvasKit preparation, and input activation order. Mark clean only when no explicit modal auto-fix changed the document.

- [ ] **Step 5: Remove automatic local-font permission flow from load**

Remove only the call `await promptLocalFontsIfNeeded(docInfo, displayName)` from `initializeDocument`. Keep web-font loading and replacement rendering. Do not add automatic `detectLocalFonts` calls elsewhere.

- [ ] **Step 6: Skip initial autosave recovery in iframe**

Import the pure policy under an explicit alias, then change the existing window-state wrapper to:

```ts
import {
  shouldSkipInitialAutosaveRecovery as shouldSkipInitialAutosaveRecoveryPolicy,
} from './core/initial-autosave-policy';

function shouldSkipInitialAutosaveRecovery(): boolean {
  return shouldSkipInitialAutosaveRecoveryPolicy(
    window.location.search,
    window.parent !== window,
  );
}
```

- [ ] **Step 7: Verify GREEN plus upstream protocol**

```bash
rtk proxy node --test rhwp-studio/tests/enkino-load-policy.test.ts rhwp-studio/tests/autosave-recovery-policy.test.ts rhwp-studio/tests/embed-protocol.test.ts
rtk proxy npm --prefix rhwp-studio test
rtk git diff --check
```

Expected: targeted and all 641+ Studio tests pass; embed router still proves strict boolean and v1 transport behavior.

- [ ] **Step 8: Commit**

```bash
rtk git add rhwp-studio/src/main.ts rhwp-studio/src/core/load-dialog-policy.ts rhwp-studio/src/core/initial-autosave-policy.ts rhwp-studio/tests/enkino-load-policy.test.ts rhwp-studio/tests/autosave-recovery-policy.test.ts
rtk git diff --cached --check
rtk git commit -m "Studio 로드 대화상자 정책 복원"
```

### Task 4: HWPX lineseg automatic-reflow revalidation

**Files:**
- Modify: `tests/hwpx_roundtrip_integration.rs`
- Modify: `src/document_core/commands/document.rs`
- Modify: `src/document_core/mod.rs`

**Interfaces:**
- Consumes: `DocumentCore::from_bytes`, `validate_linesegs`, `reflow_zero_height_paragraphs`, HWP5-origin marker
- Produces: post-load residual HWPX `ValidationReport`

- [ ] **Step 1: Add the HWPX RED regression**

Add `load_reports_only_lineseg_warnings_remaining_after_automatic_reflow` from Enkino's existing regression test. It serializes a text paragraph with empty `line_segs`, loads it through `DocumentCore::from_bytes`, asserts synthesized linesegs, then asserts an empty validation report.

- [ ] **Step 2: Add format-boundary controls**

Add `hwp_load_preserves_validation_report_from_before_automatic_reflow` and retain/extend existing HML/HWP5-origin tests if present. The HWP test serializes one zero-height `LineSeg` and expects one `LinesegUncomputed` warning. These controls encode why the patch is HWPX-only.

- [ ] **Step 3: Verify RED**

```bash
rtk cargo test --test hwpx_roundtrip_integration load_reports_only_lineseg_warnings_remaining_after_automatic_reflow -- --exact
```

Expected: FAIL because the load repaired the paragraph but retained `LinesegArrayEmpty` in the pre-reflow report.

- [ ] **Step 4: Apply the upstream-aware minimum patch**

Make the initial report mutable. After upstream reflow and `clear_missing_lineseg_placeholders`, replace it only for ordinary HWPX:

```rust
let mut validation_report = Self::validate_linesegs(&document, check_textrun_reflow);
// existing upstream reflow and placeholder cleanup
if matches!(source_format, crate::parser::FileFormat::Hwpx) && !hwp5_origin_hwpx {
    validation_report = Self::validate_linesegs(&document, check_textrun_reflow);
}
```

Do not alter HML, HWP/HWP3, layout-profile, cell-empty, metadata, or normalization branches. Update only direct `validation_report` comments in `mod.rs`.

- [ ] **Step 5: Verify GREEN and format controls**

```bash
rtk cargo fmt --all -- --check
rtk cargo test --test hwpx_roundtrip_integration
rtk cargo test --lib
```

Expected: target regression and format controls pass; upstream lib result has no failures. Report ignored tests explicitly.

- [ ] **Step 6: Commit**

```bash
rtk git add src/document_core/commands/document.rs src/document_core/mod.rs tests/hwpx_roundtrip_integration.rs
rtk git diff --cached --check
rtk git commit -m "HWPX 자동보정 후 잔여 경고 재검증"
```

### Task 5: Enkino integration and operations documentation

**Files:**
- Modify: `README.md`
- Modify: `npm/editor/README.md` only if Task 2 did not complete all consumer guidance
- Create: `docs/tech/architecture.md`
- Create: `docs/tech/deployment.md`
- Create: `docs/tech/integration-guide.md`
- Create: `docs/tech/upstream-sync.md`
- Create: `docs/logs/2026-08-06-upstream-동기화-enkino-재적용.md`
- Create: `tests/enkino-integration-docs.test.mjs`

**Interfaces:**
- Consumes: exact SDK and Worker contracts implemented by Tasks 1-4
- Produces: canonical Enkino deployment/integration/upstream-sync guidance

- [ ] **Step 1: Write the documentation contract test**

The Node test reads the files and asserts:

```js
assert.match(integration, /studioUrl:\s*['"]https:\/\/rhwp\.enkinokorea\.workers\.dev/);
assert.match(integration, /suppressDialogs:\s*true/);
assert.match(integration, /boolean `true`/);
assert.match(integration, /event\.origin/);
assert.match(integration, /event\.source/);
assert.doesNotMatch(integration, /SDK.*options.*지원하지 않/);
assert.match(deployment, /npm run deploy:dry-run/);
assert.match(upstreamSync, /upstream\/main/);
```

- [ ] **Step 2: Verify RED**

```bash
rtk proxy node --test tests/enkino-integration-docs.test.mjs
```

Expected: FAIL because the Enkino docs do not exist on the upstream-based branch.

- [ ] **Step 3: Write minimum canonical docs**

Document the explicit Cloudflare `studioUrl`, strict opt-in `suppressDialogs`, as-is semantics, current public SDK options support, exact origin/source validation, Worker build ordering, and upstream-first patch-layer policy. Keep detailed instructions in `docs/tech/integration-guide.md`; README links to it instead of duplicating the entire protocol.

The work log lists each commit, RED/GREEN evidence, test counts, build result, unresolved npm audit findings, and explicitly states no push/deploy.

- [ ] **Step 4: Verify GREEN**

```bash
rtk proxy node --test tests/enkino-integration-docs.test.mjs
rtk grep -n "[T]ODO\|[T]BD\|[F]IXME" README.md docs/tech docs/logs/2026-08-06-upstream-동기화-enkino-재적용.md
rtk git diff --check
```

Expected: docs test passes; placeholder search returns no matches; diff check exits 0.

- [ ] **Step 5: Commit**

```bash
rtk git add README.md npm/editor/README.md docs/tech docs/logs/2026-08-06-upstream-동기화-enkino-재적용.md tests/enkino-integration-docs.test.mjs
rtk git diff --cached --check
rtk git commit -m "Enkino RHWP 운영 및 연동 문서 재구성"
```

### Task 6: Overlap review and full verification

**Files:**
- Review: `.github/workflows/npm-publish.yml`
- Review: `.gitignore`
- Review: `npm/editor/README.md`
- Review: `rhwp-studio/vite.config.ts`
- Update: `docs/logs/2026-08-06-upstream-동기화-enkino-재적용.md`

**Interfaces:**
- Consumes: completed Tasks 1-5
- Produces: verified integration branch ready for human review, not deployment

- [ ] **Step 1: Review the four overlapping files against both parents**

```bash
rtk git diff 10f5c51e..upstream/main -- .github/workflows/npm-publish.yml .gitignore npm/editor/README.md rhwp-studio/vite.config.ts
rtk git diff upstream/main..HEAD -- .github/workflows/npm-publish.yml .gitignore npm/editor/README.md rhwp-studio/vite.config.ts
```

Keep upstream workflow pins, sample middleware, subsecond support, and PWA caching. Add only `.wrangler/`, `.worktrees/`, `.codegraph/` ignores when absent and required. Do not enable another deployment workflow.

- [ ] **Step 2: Install exact dependencies**

```bash
rtk proxy npm ci
rtk proxy npm --prefix rhwp-studio ci
```

Record audit warnings without automatically changing dependencies.

- [ ] **Step 3: Run fresh Rust and JavaScript verification**

```bash
rtk cargo fmt --all -- --check
rtk cargo test --lib
rtk cargo test --test hwpx_roundtrip_integration
rtk proxy npm test
rtk proxy npm --prefix rhwp-studio test
```

Every skipped/ignored test and any long-running suite not executed must be listed in the log.

- [ ] **Step 4: Build release WASM and Studio**

```bash
rtk proxy wasm-pack build --target web --release
rtk proxy npm --prefix rhwp-studio run build
rtk proxy npm run deploy:dry-run
```

Expected: release WASM exists under `pkg`, Studio `dist` references it, and Wrangler reads Worker `rhwp` assets without deploying.

- [ ] **Step 5: Run an independent Gemini review**

Use exactly:

```bash
rtk proxy agy --model gemini-3.6-flash-high --effort high --mode plan --dangerously-skip-permissions --print-timeout 10m --print "Review upstream/main..HEAD in read-only mode. Check strict suppressDialogs, transport preservation, local-font load policy, HWPX residual-warning behavior, Cloudflare config, tests, and scope. Do not edit files. Report only concrete defects with file and reason."
```

Verify every finding directly against source and tests. Do not apply a suggestion solely because the subagent proposed it.

- [ ] **Step 6: Finalize the work log and verify scope**

```bash
rtk git diff --check
rtk git status --short
rtk git log --oneline upstream/main..HEAD
rtk proxy git diff --name-only upstream/main..HEAD
```

The changed-file list must contain only this repository and must not contain any `md-to-hwpx` path.

- [ ] **Step 7: Commit final review corrections or log only**

```bash
rtk git add docs/logs/2026-08-06-upstream-동기화-enkino-재적용.md
rtk git diff --cached --check
rtk git commit -m "upstream 동기화 검증 결과 기록"
```

Do not push, merge into `enkino/self-host`, publish npm, or deploy Worker without a new explicit user request.
