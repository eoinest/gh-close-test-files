import assert from 'node:assert/strict';
import test from 'node:test';
import { isPullRequestChangesPath, isTestFilePath } from '../src/matching.ts';

test('recognizes GitHub files and changes routes', () => {
  assert.equal(isPullRequestChangesPath('/eoinest/example/pull/12/files'), true);
  assert.equal(isPullRequestChangesPath('/eoinest/example/pull/12/files/abc'), true);
  assert.equal(isPullRequestChangesPath('/eoinest/example/pull/12/changes'), true);
  assert.equal(isPullRequestChangesPath('/eoinest/example/pull/12'), false);
  assert.equal(isPullRequestChangesPath('/eoinest/example/issues/12/files'), false);
});

test('matches literal __test__ paths and *.test.* filenames case-insensitively', () => {
  assert.equal(isTestFilePath('src/__test__/button.tsx'), true);
  assert.equal(isTestFilePath('src/button.__test__.tsx'), true);
  assert.equal(isTestFilePath('src/__TEST__/button.tsx'), true);
  assert.equal(isTestFilePath('src/button.test.ts'), true);
  assert.equal(isTestFilePath('src/menu.TEST.tsx'), true);
  assert.equal(isTestFilePath('src/__tests__/button.tsx'), false);
  assert.equal(isTestFilePath('src/folder.test/button.tsx'), false);
  assert.equal(isTestFilePath('src/button.spec.tsx'), false);
});
