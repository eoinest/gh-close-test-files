import { containsTestDirectory, isTestFilePath } from './matching.ts';

export interface ReviewTarget {
  control: ReviewControl;
  path: string;
}

export type ReviewControl = HTMLInputElement | HTMLButtonElement | HTMLElement;

const FILE_CONTAINER_SELECTOR = [
  '.js-file',
  '[data-testid="diff-file"]',
  '[data-testid="file-diff"]',
  '[data-path]',
  '[data-file-path]',
  '[data-tagsearch-path]',
].join(',');

const FILE_TREE_ROOT_SELECTOR = [
  '[role="tree"]',
  '[role="tree"][aria-label="File Tree"]',
  '[aria-label*="file tree" i]',
  '[aria-label="File Tree Navigation"]',
  'file-tree',
  '[data-target*="fileTree"]',
  '[data-testid*="file-tree"]',
].join(',');

const DIRECTORY_CANDIDATE_SELECTOR = [
  '[aria-expanded]',
  '[aria-label*="directory" i]',
  '[title*="directory" i]',
  '[role="treeitem"]',
  '[data-tree-entry-type="directory"]',
  'details',
].join(',');

function normalized(value: string | null | undefined): string {
  return value?.trim().replace(/^\u200e/, '') ?? '';
}

function labelText(control: ReviewControl): string {
  const labels = control instanceof HTMLInputElement
    ? Array.from(control.labels ?? [], (label) => label.textContent ?? '')
    : [];
  const labelledBy = (control.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '');

  return [
    control.getAttribute('aria-label') ?? '',
    control.getAttribute('title') ?? '',
    control.dataset.testid ?? '',
    control.className,
    ...labelledBy,
    ...labels,
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isViewedControl(control: ReviewControl): boolean {
  if (control.classList.contains('js-reviewed-checkbox')) return true;
  if (Array.from(control.classList).some((name) => name.includes('MarkAsViewedButton'))) {
    return true;
  }
  return /\b(viewed|mark(?: this)? file as viewed)\b/i.test(labelText(control));
}

function pathFromElement(element: Element): string {
  for (const attribute of ['data-path', 'data-file-path', 'data-tagsearch-path']) {
    const value = normalized(element.getAttribute(attribute));
    if (value) return value;
  }

  const pathElement = element.querySelector<HTMLElement>([
    '[data-path]',
    '[data-file-path]',
    '[data-tagsearch-path]',
    '[data-testid="file-name"]',
    '.file-info a[title]',
    'a[data-pjax="#repo-content-pjax-container"][title]',
    'a[href^="#diff-"]',
    '[aria-label^="File path:"]',
  ].join(','));

  if (!pathElement) return '';

  for (const attribute of ['data-path', 'data-file-path', 'data-tagsearch-path', 'title']) {
    const value = normalized(pathElement.getAttribute(attribute));
    if (value) return value;
  }

  const ariaLabel = normalized(pathElement.getAttribute('aria-label'));
  if (ariaLabel.toLocaleLowerCase('en-US').startsWith('file path:')) {
    return ariaLabel.slice('file path:'.length).trim();
  }

  return normalized(pathElement.textContent);
}

function findFileContainer(control: ReviewControl): Element | null {
  let current: Element | null = control;

  while (current && current !== document.body) {
    if (pathFromElement(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return control.closest(FILE_CONTAINER_SELECTOR);
}

export function isReviewControlChecked(control: ReviewControl): boolean {
  if (control instanceof HTMLInputElement) return control.checked;
  return control.getAttribute('aria-checked') === 'true'
    || control.getAttribute('aria-pressed') === 'true'
    || control.dataset.state === 'checked';
}

export function isReviewControlDisabled(control: ReviewControl): boolean {
  if (control instanceof HTMLInputElement || control instanceof HTMLButtonElement) {
    return control.disabled;
  }
  return control.getAttribute('aria-disabled') === 'true';
}

export function findReviewTargets(root: ParentNode = document): ReviewTarget[] {
  const targets: ReviewTarget[] = [];
  const seen = new Set<ReviewControl>();

  const controls = root.querySelectorAll<HTMLElement>([
    'input[type="checkbox"]',
    'button[aria-pressed]',
    '[role="checkbox"]',
  ].join(','));

  for (const control of controls) {
    if (seen.has(control) || !isViewedControl(control)) continue;

    const container = findFileContainer(control);
    const path = container ? pathFromElement(container) : '';
    if (!path) continue;

    seen.add(control);
    targets.push({ control, path });
  }

  return targets;
}

export function findTestReviewTargets(root: ParentNode = document): ReviewTarget[] {
  return findReviewTargets(root).filter(({ path }) => isTestFilePath(path));
}

function textWithoutNestedGroups(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('[role="group"], ul, ol').forEach((group) => group.remove());
  return normalized(clone.textContent);
}

function directoryLabel(element: Element): string {
  return [
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? '',
    element.getAttribute('data-path') ?? '',
    element.getAttribute('data-name') ?? '',
    textWithoutNestedGroups(element),
  ].join(' ');
}

function directoryNode(candidate: HTMLElement): HTMLElement {
  return candidate.closest<HTMLElement>([
    '[role="treeitem"]',
    '[data-tree-entry-type="directory"]',
    'details',
  ].join(',')) ?? candidate;
}

function directoryControl(node: HTMLElement, candidate: HTMLElement): HTMLElement {
  if (candidate.matches('button, [role="button"], summary')) return candidate;

  return node.querySelector<HTMLElement>([
    ':scope > button',
    ':scope > [role="button"]',
    ':scope > summary',
    ':scope > :not([role="group"]) button',
    ':scope > :not([role="group"]) [role="button"]',
    ':scope > :not([role="group"]) [aria-label*="directory" i]',
    ':scope > :not([role="group"]) [title*="directory" i]',
  ].join(',')) ?? node;
}

function explicitExpandedState(element: Element): boolean | null {
  const ariaExpanded = element.getAttribute('aria-expanded');
  if (ariaExpanded === 'true') return true;
  if (ariaExpanded === 'false') return false;
  if (element.matches('details')) return element.hasAttribute('open');

  const state = `${element.getAttribute('data-state') ?? ''} ${element.className}`;
  if (/\b(expanded|open)\b/i.test(state)) return true;
  if (/\b(collapsed|closed)\b/i.test(state)) return false;

  const actionLabel = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`;
  if (/\bcollapse\b/i.test(actionLabel)) return true;
  if (/\bexpand\b/i.test(actionLabel)) return false;
  return null;
}

function visibleChildGroup(node: HTMLElement): boolean {
  const group = node.querySelector<HTMLElement>(
    ':scope > [role="group"], :scope > ul, :scope > ol',
  );
  if (!group || group.hidden || group.getAttribute('aria-hidden') === 'true') return false;

  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(group);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  return true;
}

function isExpandedDirectory(node: HTMLElement, control: HTMLElement): boolean {
  return explicitExpandedState(control)
    ?? explicitExpandedState(node)
    ?? visibleChildGroup(node);
}

export function findTestDirectoryControls(root: ParentNode = document): HTMLElement[] {
  const controls: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const roots = root.querySelectorAll<HTMLElement>(FILE_TREE_ROOT_SELECTOR);

  for (const tree of roots) {
    for (const candidate of tree.querySelectorAll<HTMLElement>(DIRECTORY_CANDIDATE_SELECTOR)) {
      const node = directoryNode(candidate);
      if (node.dataset.treeEntryType === 'file') continue;
      if (!containsTestDirectory(directoryLabel(node))) continue;

      const control = directoryControl(node, candidate);
      if (seen.has(control)) continue;
      seen.add(control);
      controls.push(control);
    }
  }

  return controls;
}

export function findExpandedTestDirectoryControls(
  root: ParentNode = document,
): HTMLElement[] {
  return findTestDirectoryControls(root).filter((control) => {
    const node = directoryNode(control);
    return isExpandedDirectory(node, control);
  });
}
