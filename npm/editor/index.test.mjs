import assert from 'node:assert/strict';
import test from 'node:test';

import { createEditor } from './index.js';

function createBrowserHarness(onRequest) {
  const messageListeners = new Set();
  const requests = [];
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
    remove() {},
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
  };

  return { container, contentWindow, dispatchMessage, iframe, requests };
}

test('SDK는 Studio URL의 정확한 origin을 요청 targetOrigin으로 사용한다', async (t) => {
  t.after(() => {
    delete globalThis.document;
    delete globalThis.window;
  });

  const studioOrigin = 'https://studio.example.test';
  const harness = createBrowserHarness(({ message, dispatchMessage, contentWindow }) => {
    dispatchMessage({
      data: { type: 'rhwp-response', id: message.id, result: true },
      origin: studioOrigin,
      source: contentWindow,
    });
  });

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
  t.after(() => {
    delete globalThis.document;
    delete globalThis.window;
  });

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

  const editor = await createEditor(harness.container, {
    studioUrl: `${studioOrigin}/editor`,
  });

  assert.equal(await editor.pageCount(), 7);
});
