import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipInitialAutosaveRecovery } from '../src/core/initial-autosave-policy.ts';

test('shouldSkipInitialAutosaveRecovery returns true when url search param exists or embedded is true', () => {
  assert.equal(shouldSkipInitialAutosaveRecovery('', false), false);
  assert.equal(shouldSkipInitialAutosaveRecovery('?url=%2Fsamples%2Fsample.hwp', false), true);
  assert.equal(shouldSkipInitialAutosaveRecovery('', true), true);
});
