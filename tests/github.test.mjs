import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import {
  findExpandedTestDirectoryControls,
  findTestDirectoryControls,
} from '../src/github.ts';

test('finds expanded test directories across GitHub file-tree shapes', () => {
  const { document } = parseHTML(`
    <button id="outside-tree" aria-expanded="true">__tests__</button>
    <ul role="tree" aria-label="File Tree">
      <li role="treeitem">
        <button id="button-state" aria-expanded="true">src/__test__</button>
      </li>
      <li role="treeitem" aria-expanded="true">
        <div>
          <button id="treeitem-state" aria-label="Collapse directory"></button>
          <span>__tests__</span>
        </div>
        <ul role="group"><li role="treeitem">button.ts</li></ul>
      </li>
      <li role="treeitem">
        <div><span id="visible-group" role="button">packages/__TESTS__</span></div>
        <ul role="group"><li role="treeitem">menu.ts</li></ul>
      </li>
      <li role="treeitem" aria-expanded="false">
        <div>
          <button id="collapsed-treeitem" aria-label="Expand directory"></button>
          <span>already/collapsed/__tests__</span>
        </div>
        <ul role="group"><li role="treeitem">closed.ts</li></ul>
      </li>
      <li role="treeitem"><button id="near-match" aria-expanded="true">__testing__</button></li>
      <li role="treeitem" data-tree-entry-type="file" data-path="src/__tests__/leaf.ts">
        <button id="file-entry" aria-expanded="true">leaf.ts</button>
      </li>
      <details id="details-directory" open>
        <summary id="details-state">nested/__tests__</summary>
        <ul><li>details.ts</li></ul>
      </details>
      <li><button id="label-state" aria-label="Collapse directory: __tests__"></button></li>
    </ul>
    <nav aria-label="File Tree Navigation">
      <button id="navigation-root" aria-expanded="true">nested/__TESTS__</button>
    </nav>
    <file-tree>
      <li data-tree-entry-type="directory">
        <button id="custom-element-root" aria-expanded="true">fallback/__test__</button>
      </li>
    </file-tree>
  `);

  const allControlIds = findTestDirectoryControls(document).map(({ id }) => id);
  const expandedControlIds = findExpandedTestDirectoryControls(document).map(({ id }) => id);

  assert.deepEqual(allControlIds, [
    'button-state',
    'treeitem-state',
    'visible-group',
    'collapsed-treeitem',
    'details-state',
    'label-state',
    'navigation-root',
    'custom-element-root',
  ]);
  assert.deepEqual(expandedControlIds, [
    'button-state',
    'treeitem-state',
    'visible-group',
    'details-state',
    'label-state',
    'navigation-root',
    'custom-element-root',
  ]);
});
