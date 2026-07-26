import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';

const studioDir = dirname(dirname(fileURLToPath(import.meta.url)));

function extractMessageHandlerSource(): string {
  const sourceText = readFileSync(join(studioDir, 'src/main.ts'), 'utf8');
  const sourceFile = ts.createSourceFile(
    'main.ts',
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  let handlerExpression: ts.Expression | undefined;

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sourceFile) === 'window' &&
      node.expression.name.text === 'addEventListener' &&
      node.arguments[0]?.getText(sourceFile) === "'message'"
    ) {
      handlerExpression = node.arguments[1];
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.ok(handlerExpression, 'main.ts의 message 핸들러를 찾을 수 있어야 한다');

  if (ts.isIdentifier(handlerExpression)) {
    const declaration = sourceFile.statements.find(
      statement =>
        ts.isFunctionDeclaration(statement) && statement.name?.text === handlerExpression?.text,
    );
    assert.ok(declaration, 'message 핸들러 함수 선언을 찾을 수 있어야 한다');
    return `${declaration.getText(sourceFile)}\nglobalThis.__handler = ${handlerExpression.text};`;
  }

  return `globalThis.__handler = ${handlerExpression.getText(sourceFile)};`;
}

function extractDeclarationsSource(names: string[]): string {
  const sourceText = readFileSync(join(studioDir, 'src/main.ts'), 'utf8');
  const sourceFile = ts.createSourceFile(
    'main.ts',
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  const declarations = new Map<string, ts.FunctionDeclaration>();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement);
    }
  }

  return names.map((name) => {
    const declaration = declarations.get(name);
    assert.ok(declaration, `main.ts의 ${name} 함수 선언을 찾을 수 있어야 한다`);
    return declaration.getText(sourceFile);
  }).join('\n');
}

function createStudioHarness(
  wasmOverrides: Record<string, unknown> = {},
  loadBytes: (bytes: Uint8Array) => Promise<void> = async () => {},
) {
  const replies: Array<{
    message: unknown;
    options: { targetOrigin?: string; transfer?: Transferable[] } | string;
  }> = [];
  const parentWindow = {
    postMessage(message: unknown, options: { targetOrigin?: string } | string) {
      replies.push({ message, options });
    },
  };
  const source = extractMessageHandlerSource();
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const context = {
    Uint8Array,
    canReplaceCurrentDocument: async () => true,
    initPromise: Promise.resolve(),
    loadBytes,
    wasm: {
      exportHwp: () => new Uint8Array(),
      exportHwpVerify: () => '{}',
      exportHwpx: () => new Uint8Array(),
      pageCount: 1,
      renderPageSvg: () => '<svg></svg>',
      ...wasmOverrides,
    },
    window: { parent: parentWindow },
  } as Record<string, unknown>;

  runInNewContext(transpiled, context);
  const handler = context.__handler as (event: {
    data: unknown;
    origin: string;
    source: unknown;
  }) => Promise<void>;

  return { handler, parentWindow, replies };
}

test('Studio는 sibling 또는 non-parent의 rhwp-request를 무시한다', async () => {
  const { handler, replies } = createStudioHarness();
  const siblingWindow = {
    postMessage(message: unknown, options: unknown) {
      replies.push({ message, options: options as string });
    },
  };

  await handler({
    data: { type: 'rhwp-request', id: 1, method: 'ready', params: {} },
    origin: 'https://host.example.test',
    source: siblingWindow,
  });

  assert.equal(replies.length, 0);
});

test('Studio는 실제 parent 요청의 origin을 응답 targetOrigin으로 사용한다', async () => {
  const { handler, parentWindow, replies } = createStudioHarness();
  const origins = ['https://project-a.example.test', 'https://project-b.example.test'];

  for (const [index, origin] of origins.entries()) {
    await handler({
      data: { type: 'rhwp-request', id: index + 1, method: 'ready', params: {} },
      origin,
      source: parentWindow,
    });
  }

  assert.equal(replies.length, 2);
  assert.deepEqual(
    replies.map(({ options }) =>
      typeof options === 'string' ? options : options.targetOrigin,
    ),
    origins,
  );
});

test('Studio는 transferred ArrayBuffer, Uint8Array와 legacy number[] loadFile 입력을 모두 받는다', async () => {
  const loaded: Uint8Array[] = [];
  const { handler, parentWindow } = createStudioHarness({}, async bytes => {
    loaded.push(bytes);
  });
  const inputs = [
    new Uint8Array([11, 13]).buffer,
    new Uint8Array([17, 19]),
    [23, 29],
  ];

  for (const [index, data] of inputs.entries()) {
    await handler({
      data: { type: 'rhwp-request', id: index + 1, method: 'loadFile', params: { data } },
      origin: 'https://host.example.test',
      source: parentWindow,
    });
  }

  assert.deepEqual(loaded.map(bytes => [...bytes]), [[11, 13], [17, 19], [23, 29]]);
});

test('embed loadFile의 suppressDialogs는 검증 모달을 기다리지 않고 로드를 완료한다', async () => {
  const source = extractDeclarationsSource([
    'applySavedTextMarkSettings',
    'initializeDocument',
    'loadBytes',
    'handleRhwpMessage',
  ]);
  const transpiled = ts.transpileModule(
    `${source}\nglobalThis.__handler = handleRhwpMessage;`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  let validationModalCalls = 0;
  const replies: unknown[] = [];
  const parentWindow = {
    postMessage(message: unknown) {
      replies.push(message);
    },
  };
  const context = {
    Uint8Array,
    autosaveManager: {
      beginDocument: async () => {},
    },
    canReplaceCurrentDocument: async () => true,
    canvasView: { loadDocument() {} },
    console,
    documentState: {
      markClean() {},
      markDirty() {},
    },
    extensionViewerSettings: {},
    initPromise: Promise.resolve(),
    inputHandler: {
      activateWithCaretPosition() {},
      deactivate() {},
    },
    loadWebFonts: async () => {},
    notifyHwpxSaveModeIfNeeded() {},
    performance,
    sbMessage: () => ({ textContent: '' }),
    sbSection: () => ({ textContent: '' }),
    showValidationModalIfNeeded: () => {
      validationModalCalls += 1;
      return new Promise(() => {});
    },
    syncTextMarkMenu() {},
    toolbar: {
      initFontDropdown() {},
      initStyleDropdown() {},
      setEnabled() {},
    },
    totalSections: 0,
    userSettings: {
      getViewSettings: () => ({
        showControlCodes: false,
        showParagraphMarks: false,
      }),
    },
    wasm: {
      currentFileHandle: null,
      fileName: 'embedded.hwpx',
      getSourceFormat: () => 'hwpx',
      getValidationWarnings: () => ({ count: 1, summary: 'non-standard lineseg' }),
      loadDocument: () => ({
        fontsUsed: [],
        pageCount: 1,
        sectionCount: 1,
      }),
      pageCount: 1,
      setShowControlCodes() {},
      setShowParagraphMarks() {},
    },
    window: {
      parent: parentWindow,
    },
  } as Record<string, unknown>;

  runInNewContext(transpiled, context);
  const handler = context.__handler as (event: {
    data: unknown;
    origin: string;
    source: unknown;
  }) => Promise<void>;
  const outcome = await Promise.race([
    handler({
      data: {
        type: 'rhwp-request',
        id: 77,
        method: 'loadFile',
        params: {
          data: new Uint8Array([1, 2, 3]),
          fileName: 'embedded.hwpx',
          suppressDialogs: true,
        },
      },
      origin: 'https://host.example.test',
      source: parentWindow,
    }).then(() => 'completed'),
    new Promise<string>((resolve) => setTimeout(() => resolve('timed-out'), 50)),
  ]);

  assert.equal(outcome, 'completed');
  assert.equal(validationModalCalls, 0);
  assert.equal(JSON.stringify(replies), JSON.stringify([{
    type: 'rhwp-response',
    id: 77,
    result: { pageCount: 1 },
  }]));

  const truthyStringOutcome = await Promise.race([
    handler({
      data: {
        type: 'rhwp-request',
        id: 78,
        method: 'loadFile',
        params: {
          data: new Uint8Array([4, 5, 6]),
          fileName: 'embedded.hwpx',
          suppressDialogs: 'true',
        },
      },
      origin: 'https://host.example.test',
      source: parentWindow,
    }).then(() => 'completed'),
    new Promise<string>((resolve) => setTimeout(() => resolve('timed-out'), 50)),
  ]);

  assert.equal(truthyStringOutcome, 'timed-out');
  assert.equal(validationModalCalls, 1);
});

test('Studio는 큰 HWP/HWPX 결과를 standalone ArrayBuffer로 복사해 transfer한다', async () => {
  const hwp = new Uint8Array(8 * 1024 * 1024 + 2);
  hwp[0] = 31;
  hwp[hwp.length - 1] = 37;
  const hwpx = new Uint8Array([41, 43]);
  const { handler, parentWindow, replies } = createStudioHarness({
    exportHwp: () => hwp,
    exportHwpx: () => hwpx,
  });

  for (const [index, method] of ['exportHwp', 'exportHwpx'].entries()) {
    await handler({
      data: { type: 'rhwp-request', id: index + 1, method, params: {} },
      origin: 'https://host.example.test',
      source: parentWindow,
    });
  }

  for (const reply of replies) {
    const result = (reply.message as { result: unknown }).result;
    assert.ok(result instanceof ArrayBuffer);
    const transfer = typeof reply.options === 'string' ? [] : reply.options.transfer ?? [];
    assert.equal(transfer.length, 1);
    assert.equal(transfer[0], result);
  }
  const hwpResult = new Uint8Array((replies[0].message as { result: ArrayBuffer }).result);
  assert.equal(hwpResult.byteLength, hwp.byteLength);
  assert.equal(hwpResult[0], 31);
  assert.equal(hwpResult.at(-1), 37);
  assert.notEqual(hwpResult.buffer, hwp.buffer);
});
