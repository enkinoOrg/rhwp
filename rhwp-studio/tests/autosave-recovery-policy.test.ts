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
