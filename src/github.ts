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

const EXPANDED_FILE_TREE_DIRECTORY_SELECTOR = [
  '[role="tree"][aria-label="File Tree"] button[aria-expanded="true"]',
  '[aria-label="File Tree Navigation"] button[aria-expanded="true"]',
  'file-tree [data-tree-entry-type="directory"] > button[aria-expanded="true"]',
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

export function findExpandedTestDirectoryControls(
  root: ParentNode = document,
): HTMLButtonElement[] {
  const controls = root.querySelectorAll<HTMLButtonElement>(
    EXPANDED_FILE_TREE_DIRECTORY_SELECTOR,
  );

  return Array.from(controls).filter((control) => (
    containsTestDirectory(normalized(control.textContent))
  ));
}
