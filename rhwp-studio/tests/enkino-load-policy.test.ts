import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validationDialogAction } from '../src/core/load-dialog-policy.ts';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function getInitializeDocumentRunner(mainSource: string) {
  const start = mainSource.indexOf('async function initializeDocument(');
  const end = mainSource.indexOf('\nasync function promptLocalFontsIfNeeded', start);
  assert.ok(start >= 0 && end > start, 'initializeDocument 범위를 찾을 수 있어야 한다');
  let code = mainSource.slice(start, end);
  code = code
    .replace(/:\s*DocumentInfo/g, '')
    .replace(/:\s*string/g, '')
    .replace(/:\s*\{\s*suppressDialogs\?: boolean\s*\}\s*=\s*\{\}/g, '= {}')
    .replace(/:\s*Promise<void>/g, '')
    .replace(/as HTMLElement/g, '');

  return new Function(
    'docInfo',
    'displayName',
    'options',
    'sbMessage',
    'updateLoadProgress',
    'sbSection',
    'loadWebFonts',
    'extensionViewerSettings',
    'applySavedTextMarkSettings',
    'inputHandler',
    'canvasView',
    'prepareCanvasKitLocalFonts',
    'toolbar',
    'wasm',
    'validationDialogAction',
    'showValidationModalIfNeeded',
    'showHmlImportWarning',
    'promptLocalFontsIfNeeded',
    'documentState',
    'console',
    `let totalSections = 1;
     return (${code})(docInfo, displayName, options);`
  );
}

test('validationDialogAction returns prompt only for hwpx with warnings when suppressDialogs is not true', () => {
  assert.equal(validationDialogAction('hwpx', 1, false), 'prompt');
  assert.equal(validationDialogAction('hwpx', 1, true), 'none');
  assert.equal(validationDialogAction('hwpx', 0, false), 'none');
  assert.equal(validationDialogAction('hwp', 1, false), 'none');
});

test('initializeDocument harness: prompt action calls showValidationModalIfNeeded once and auto-fix marks dirty', async () => {
  const mainSource = readFileSync(join(rootDir, 'src/main.ts'), 'utf8');
  const runInitializeDocument = getInitializeDocumentRunner(mainSource);

  const showModalCalls: any[] = [];
  let canvasLoadCount = 0;
  const dirtyMarked: string[] = [];
  const cleanMarked: string[] = [];
  let localFontPromptCalled = false;

  const docInfo = { sourceFormat: 'hwpx', fontsUsed: ['Batang'] };
  const wasm = {
    getSourceFormat: () => 'hwpx',
    getValidationWarnings: () => ({ count: 1, summary: { 'empty-lineseg': 1 } }),
    reflowLinesegs: () => 1,
    getHmlOpenMetadata: () => null,
  };
  const canvasView = {
    loadDocument: async () => { canvasLoadCount++; },
  };
  const documentState = {
    markDirty: (reason: string) => { dirtyMarked.push(reason); },
    markClean: (reason: string) => { cleanMarked.push(reason); },
  };

  await runInitializeDocument(
    docInfo,
    'test.hwpx',
    { suppressDialogs: false },
    () => ({ textContent: '' }),
    async () => {},
    () => ({ textContent: '' }),
    async () => {},
    {},
    () => {},
    { deactivate: () => {}, activateWithCaretPosition: () => {} },
    canvasView,
    () => {},
    { setEnabled: () => {}, initFontDropdown: () => {}, initStyleDropdown: () => {} },
    wasm,
    validationDialogAction,
    async (report: any) => {
      showModalCalls.push(report);
      return 'auto-fix';
    },
    () => {},
    async () => { localFontPromptCalled = true; },
    documentState,
    console,
  );

  assert.equal(showModalCalls.length, 1, 'prompt 액션일 때 showValidationModalIfNeeded가 1회 호출되어야 한다');
  assert.equal(canvasLoadCount, 2, 'auto-fix 시 canvasView.loadDocument가 초기 로드 1회 + auto-fix 재로드 1회 총 2회 호출되어야 한다');
  assert.deepEqual(dirtyMarked, ['validation-auto-fix'], 'auto-fix 적용 시 validation-auto-fix 사유로 dirty 처리되어야 한다');
  assert.equal(cleanMarked.length, 0, 'auto-fix 적용 시 markClean이 호출되지 않아야 한다');
  assert.equal(localFontPromptCalled, false, 'initializeDocument에서 local-font 프롬프트가 호출되지 않아야 한다');
});

test('initializeDocument harness: suppressDialogs action calls showValidationModalIfNeeded 0 times and marks clean', async () => {
  const mainSource = readFileSync(join(rootDir, 'src/main.ts'), 'utf8');
  const runInitializeDocument = getInitializeDocumentRunner(mainSource);

  const showModalCalls: any[] = [];
  const cleanMarked: string[] = [];
  let localFontPromptCalled = false;

  const docInfo = { sourceFormat: 'hwpx', fontsUsed: ['Batang'] };
  const wasm = {
    getSourceFormat: () => 'hwpx',
    getValidationWarnings: () => ({ count: 1, summary: { 'empty-lineseg': 1 } }),
    reflowLinesegs: () => 0,
    getHmlOpenMetadata: () => null,
  };
  const documentState = {
    markDirty: () => {},
    markClean: (reason: string) => { cleanMarked.push(reason); },
  };

  await runInitializeDocument(
    docInfo,
    'test.hwpx',
    { suppressDialogs: true },
    () => ({ textContent: '' }),
    async () => {},
    () => ({ textContent: '' }),
    async () => {},
    {},
    () => {},
    { deactivate: () => {}, activateWithCaretPosition: () => {} },
    { loadDocument: async () => {} },
    () => {},
    { setEnabled: () => {}, initFontDropdown: () => {}, initStyleDropdown: () => {} },
    wasm,
    validationDialogAction,
    async (report: any) => {
      showModalCalls.push(report);
      return 'as-is';
    },
    () => {},
    async () => { localFontPromptCalled = true; },
    documentState,
    console,
  );

  assert.equal(showModalCalls.length, 0, 'suppressDialogs=true 일 때 showValidationModalIfNeeded가 0회 호출되어야 한다');
  assert.deepEqual(cleanMarked, ['document-initialized'], 'auto-fix 미실행 시 document-initialized 사유로 clean 처리되어야 한다');
  assert.equal(localFontPromptCalled, false, 'initializeDocument에서 local-font 프롬프트가 호출되지 않아야 한다');
});
