import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createEditor } from './index.js';

function createBrowserHarness(onRequest, options = {}) {
  const messageListeners = new Set();
  const requests = [];
  const timers = new Set();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let iframeRemoveCount = 0;
  const contentWindow = {
    postMessage(message, targetOrigin) {
      requests.push({ message, targetOrigin });
      onRequest({ message, targetOrigin, dispatchMessage, contentWindow });
    },
  };
  const iframe = {
    allow: '',
    contentWindow,
    src: '',
    style: {},
    addEventListener(type, listener) {
      if (type === 'load') queueMicrotask(listener);
    },
    remove() {
      iframeRemoveCount += 1;
    },
  };
  const container = {
    appendChild(element) {
      assert.equal(element, iframe);
    },
  };

  function dispatchMessage(event) {
    for (const listener of messageListeners) listener(event);
  }

  globalThis.document = {
    createElement(tagName) {
      assert.equal(tagName, 'iframe');
      return iframe;
    },
  };
  globalThis.window = {
    location: { href: 'https://host.example.test/documents/1' },
    addEventListener(type, listener) {
      if (type === 'message') messageListeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'message') messageListeners.delete(listener);
    },
  };
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay === options.throwOnTimeoutDelay) {
      throw options.timeoutError;
    }
    const timer = { callback, delay, args };
    timers.add(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    timers.delete(timer);
  };

  return {
    activeTimerCount: () => timers.size,
    container,
    contentWindow,
    dispatchMessage,
    iframe,
    iframeRemoveCount: () => iframeRemoveCount,
    messageListenerCount: () => messageListeners.size,
    requests,
    restore() {
      if (originalDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = originalDocument;
      }
      if (originalWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = originalWindow;
      }
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}

test('SDK는 Studio URL의 정확한 origin을 요청 targetOrigin으로 사용한다', async (t) => {
  const studioOrigin = 'https://studio.example.test';
  const harness = createBrowserHarness(({ message, dispatchMessage, contentWindow }) => {
    dispatchMessage({
      data: { type: 'rhwp-response', id: message.id, result: true },
      origin: studioOrigin,
      source: contentWindow,
    });
  });
  t.after(() => harness.restore());

  const editor = await createEditor(harness.container, {
    studioUrl: `${studioOrigin}/editor?project=alpha`,
  });
  await editor.pageCount();

  assert.ok(harness.requests.length >= 2);
  assert.deepEqual(
    harness.requests.map(({ targetOrigin }) => targetOrigin),
    Array(harness.requests.length).fill(studioOrigin),
  );
});

test('SDK는 위조 origin 또는 iframe이 아닌 source의 응답을 무시한다', async (t) => {
  const studioOrigin = 'https://studio.example.test';
  const siblingWindow = {};
  const harness = createBrowserHarness(({ message, dispatchMessage, contentWindow }) => {
    if (message.method === 'ready') {
      dispatchMessage({
        data: { type: 'rhwp-response', id: message.id, result: true },
        origin: studioOrigin,
        source: contentWindow,
      });
      return;
    }

    dispatchMessage({
      data: { type: 'rhwp-response', id: message.id, result: 41 },
      origin: 'https://attacker.example.test',
      source: contentWindow,
    });
    dispatchMessage({
      data: { type: 'rhwp-response', id: message.id, result: 42 },
      origin: studioOrigin,
      source: siblingWindow,
    });
    dispatchMessage({
      data: { type: 'rhwp-response', id: message.id, result: 7 },
      origin: studioOrigin,
      source: contentWindow,
    });
  });
  t.after(() => harness.restore());

  const editor = await createEditor(harness.container, {
    studioUrl: `${studioOrigin}/editor`,
  });

  assert.equal(await editor.pageCount(), 7);
});

test('SDK는 성공 응답과 실패 응답을 받으면 각 요청 timer를 즉시 해제한다', async (t) => {
  const studioOrigin = 'https://studio.example.test';
  const harness = createBrowserHarness(({ message, dispatchMessage, contentWindow }) => {
    dispatchMessage({
      data: {
        type: 'rhwp-response',
        id: message.id,
        ...(message.method === 'pageCount'
          ? { error: '페이지 수 조회 실패' }
          : { result: true }),
      },
      origin: studioOrigin,
      source: contentWindow,
    });
  });
  t.after(() => harness.restore());

  const editor = await createEditor(harness.container, {
    studioUrl: `${studioOrigin}/editor`,
  });

  assert.equal(harness.activeTimerCount(), 0);
  await assert.rejects(editor.pageCount(), /페이지 수 조회 실패/);
  assert.equal(harness.activeTimerCount(), 0);
});

test('destroy는 listener와 pending 요청을 정리하고 중복 호출과 재사용을 안전하게 거부한다', async (t) => {
  const studioOrigin = 'https://studio.example.test';
  const harness = createBrowserHarness(({ message, dispatchMessage, contentWindow }) => {
    if (message.method !== 'ready') return;
    dispatchMessage({
      data: { type: 'rhwp-response', id: message.id, result: true },
      origin: studioOrigin,
      source: contentWindow,
    });
  });
  t.after(() => harness.restore());

  const editor = await createEditor(harness.container, {
    studioUrl: `${studioOrigin}/editor`,
  });
  assert.equal(harness.activeTimerCount(), 0);

  const pending = editor.pageCount();
  assert.equal(harness.activeTimerCount(), 1);

  editor.destroy();

  const pendingOutcome = await Promise.race([
    pending.then(
      () => ({ status: 'resolved' }),
      (error) => ({ status: 'rejected', error }),
    ),
    new Promise((resolve) => setImmediate(() => resolve({ status: 'pending' }))),
  ]);

  assert.equal(pendingOutcome.status, 'rejected');
  assert.match(pendingOutcome.error?.message ?? '', /Editor destroyed/);
  assert.equal(harness.activeTimerCount(), 0);
  assert.equal(harness.messageListenerCount(), 0);
  assert.equal(harness.iframeRemoveCount(), 1);

  editor.destroy();
  assert.equal(harness.iframeRemoveCount(), 1);

  const requestCount = harness.requests.length;
  await assert.rejects(editor.pageCount(), /Editor destroyed/);
  assert.equal(harness.requests.length, requestCount);
});

test('createEditor는 ready 실패 시 원 오류를 보존하고 생성한 자원을 모두 정리한다', async (t) => {
  const studioOrigin = 'https://studio.example.test';
  const waitReadyError = new Error('ready retry scheduling failed');
  const harness = createBrowserHarness(
    () => {
      throw new Error('Studio transport failed');
    },
    {
      throwOnTimeoutDelay: 500,
      timeoutError: waitReadyError,
    },
  );
  t.after(() => harness.restore());

  let actualError;
  try {
    await createEditor(harness.container, {
      studioUrl: `${studioOrigin}/editor`,
    });
  } catch (error) {
    actualError = error;
  }

  assert.equal(actualError, waitReadyError);
  assert.deepEqual(
    {
      activeTimers: harness.activeTimerCount(),
      iframeRemovals: harness.iframeRemoveCount(),
      messageListeners: harness.messageListenerCount(),
    },
    {
      activeTimers: 0,
      iframeRemovals: 1,
      messageListeners: 0,
    },
  );
});

test('SDK 보안 버전과 root 및 npm publish 검증 진입점이 연결된다', () => {
  const editorPackage = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
  const rootPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  const workflow = readFileSync(
    new URL('../../.github/workflows/npm-publish.yml', import.meta.url),
    'utf8',
  );
  const editorPublishJob = workflow
    .split('  publish-npm-editor:')[1]
    ?.split('  publish-vscode:')[0];

  assert.equal(editorPackage.version, '0.7.19');
  assert.equal(rootPackage.scripts['test:sdk'], 'node --test npm/editor/index.test.mjs');
  assert.match(rootPackage.scripts.test, /npm run test:sdk/);
  assert.match(rootPackage.scripts.check, /npm run test:sdk/);
  assert.match(editorPublishJob ?? '', /name: Test SDK[\s\S]*run: npm run test:sdk/);
});
