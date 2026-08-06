import test from 'node:test';
import assert from 'node:assert/strict';

import { RhwpEditor } from '../index.js';

test('loadFile sends the embed dialog default while preserving explicit choices', async () => {
  const requests = [];
  const transport = {
    request(method, params) {
      requests.push({ method, params });
      return Promise.resolve({ pageCount: 1 });
    },
  };
  const editor = new RhwpEditor({}, transport);
  const data = new Uint8Array([1, 2, 3]);

  await editor.loadFile(data, 'omitted.hwp');
  await editor.loadFile(data, 'false.hwp', { suppressDialogs: false });
  await editor.loadFile(data, 'true.hwp', { suppressDialogs: true });
  await editor.loadFile(data, 'string.hwp', { suppressDialogs: 'true' });

  assert.deepEqual(
    requests.map(({ params }) => params.suppressDialogs),
    [false, false, true, false],
  );
});
