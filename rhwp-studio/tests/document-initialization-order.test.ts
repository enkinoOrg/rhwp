import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function source(path: string): string {
  return readFileSync(join(rootDir, path), 'utf8');
}

function initializeDocumentSource(): string {
  const main = source('src/main.ts');
  const start = main.indexOf('async function initializeDocument');
  const end = main.indexOf('\nasync function promptLocalFontsIfNeeded', start);
  assert.ok(start >= 0 && end > start, 'initializeDocument 범위를 찾을 수 있어야 한다');
  return main.slice(start, end);
}

test('문서 초기화는 자동 로컬 글꼴 팝업 없이 입력 핸들러를 활성화하고 완료한다', () => {
  const initializeDocument = initializeDocumentSource();
  const promptIndex = initializeDocument.indexOf('await promptLocalFontsIfNeeded(docInfo, displayName);');
  const activateIndex = initializeDocument.indexOf('inputHandler?.activateWithCaretPosition();');

  assert.equal(promptIndex, -1, '자동 로컬 글꼴 팝업 호출이 없어야 한다');
  assert.ok(activateIndex >= 0, '캐럿을 활성화해야 한다');
  assert.doesNotMatch(
    initializeDocument,
    /updateLoadProgress\(100, '완료'\)/,
    '최종 파일명 전환 전에 불필요한 100% paint 대기를 두지 않는다',
  );
});

test('CanvasKit local face 등록은 문서 초기화 대신 현재 뷰 재그리기를 요청한다', () => {
  const main = source('src/main.ts');
  const start = main.indexOf('function prepareCanvasKitLocalFonts');
  const end = main.indexOf('\nasync function initialize()', start);
  assert.ok(start >= 0 && end > start, 'CanvasKit local face 준비 함수를 찾을 수 있어야 한다');
  const prepareLocalFonts = main.slice(start, end);

  assert.match(prepareLocalFonts, /eventBus\.emit\('document-view-changed'\);/);
  assert.doesNotMatch(prepareLocalFonts, /canvasView\?\.loadDocument\(\);/);
});

test('로컬 글꼴 감지는 Canvas2D 문서를 전체 재로딩하지 않는다', () => {
  const main = source('src/main.ts');
  assert.doesNotMatch(main, /eventBus\.on\('local-fonts-changed',[\s\S]*?canvasView\?\.loadDocument\(\);/);
});
