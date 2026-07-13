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

function createStudioHarness() {
  const replies: Array<{ message: unknown; options: { targetOrigin?: string } | string }> = [];
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
    loadBytes: async () => {},
    wasm: {
      exportHwp: () => new Uint8Array(),
      exportHwpVerify: () => '{}',
      exportHwpx: () => new Uint8Array(),
      pageCount: 1,
      renderPageSvg: () => '<svg></svg>',
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
