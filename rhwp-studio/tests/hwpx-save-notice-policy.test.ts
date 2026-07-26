import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';

const studioDir = dirname(dirname(fileURLToPath(import.meta.url)));

function runNotice({ embedded, format }: { embedded: boolean; format: string }) {
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
      statement.name?.text === 'notifyHwpxSaveModeIfNeeded',
  );
  assert.ok(declaration, 'HWPX 저장 안내 함수를 찾을 수 있어야 한다');

  const transpiled = ts.transpileModule(
    `${declaration.getText(sourceFile)}
notifyHwpxSaveModeIfNeeded();`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const topWindow: { parent?: unknown; open(): void } = { open() {} };
  const currentWindow: { parent?: unknown; open(): void } = embedded
    ? { parent: topWindow, open() {} }
    : topWindow;
  currentWindow.parent ??= currentWindow;
  const toasts: unknown[] = [];
  const status = { textContent: '기존 상태' };

  runInNewContext(transpiled, {
    window: currentWindow,
    wasm: { getSourceFormat: () => format },
    showToast: (options: unknown) => toasts.push(options),
    sbMessage: () => status,
  });

  return { toastCount: toasts.length, statusText: status.textContent };
}

test('iframe의 HWPX는 단독 저장 안내를 표시하지 않는다', () => {
  assert.deepEqual(runNotice({ embedded: true, format: 'hwpx' }), {
    toastCount: 0,
    statusText: '기존 상태',
  });
});

test('단독 Studio의 HWPX는 기존 저장 안내를 유지한다', () => {
  const result = runNotice({ embedded: false, format: 'hwpx' });
  assert.equal(result.toastCount, 1);
  assert.match(result.statusText, /HWPX 변환 저장 모드/);
});

test('HWP 문서는 저장 안내를 표시하지 않는다', () => {
  assert.deepEqual(runNotice({ embedded: false, format: 'hwp' }), {
    toastCount: 0,
    statusText: '기존 상태',
  });
});
