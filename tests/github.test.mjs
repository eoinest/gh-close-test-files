import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { findExpandedTestDirectoryControls } from '../src/github.ts';

test('finds expanded test directories across GitHub file-tree shapes', () => {
  const { document } = parseHTML(`
    <button aria-expanded="true">__tests__</button>
    <ul role="tree" aria-label="File Tree">
      <li><button aria-expanded="true">src/__test__</button></li>
      <li><button aria-expanded="true">packages/next/src/utils/__tests__</button></li>
      <li><button aria-expanded="false">already/collapsed/__tests__</button></li>
      <li><button aria-expanded="true">__testing__</button></li>
    </ul>
    <nav aria-label="File Tree Navigation">
      <ul role="tree">
        <li><button aria-expanded="true">nested/__TESTS__</button></li>
      </ul>
    </nav>
    <file-tree>
      <li data-tree-entry-type="directory">
        <button aria-expanded="true">fallback/__test__</button>
      </li>
    </file-tree>
  `);

  const labels = findExpandedTestDirectoryControls(document)
    .map((control) => control.textContent?.trim());

  assert.deepEqual(labels, [
    'src/__test__',
    'packages/next/src/utils/__tests__',
    'nested/__TESTS__',
    'fallback/__test__',
  ]);
});
