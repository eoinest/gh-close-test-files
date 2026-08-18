import { isTestFilePath } from './matching';

export interface ReviewTarget {
  checkbox: HTMLInputElement;
  path: string;
}

const FILE_CONTAINER_SELECTOR = [
  '.js-file',
  '[data-testid="diff-file"]',
  '[data-testid="file-diff"]',
  '[data-path]',
  '[data-file-path]',
  '[data-tagsearch-path]',
].join(',');

function normalized(value: string | null | undefined): string {
  return value?.trim().replace(/^\u200e/, '') ?? '';
}

function labelText(checkbox: HTMLInputElement): string {
  const labels = Array.from(checkbox.labels ?? [], (label) => label.textContent ?? '');
  return [
    checkbox.getAttribute('aria-label') ?? '',
    checkbox.getAttribute('title') ?? '',
    checkbox.dataset.testid ?? '',
    checkbox.className,
    ...labels,
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isViewedCheckbox(checkbox: HTMLInputElement): boolean {
  if (checkbox.classList.contains('js-reviewed-checkbox')) return true;
  return /\b(viewed|mark(?: this)? file as viewed)\b/i.test(labelText(checkbox));
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
  ].join(','));

  if (!pathElement) return '';

  for (const attribute of ['data-path', 'data-file-path', 'data-tagsearch-path', 'title']) {
    const value = normalized(pathElement.getAttribute(attribute));
    if (value) return value;
  }

  return normalized(pathElement.textContent);
}

function findFileContainer(checkbox: HTMLInputElement): Element | null {
  let current: Element | null = checkbox;

  while (current && current !== document.body) {
    if (current.matches(FILE_CONTAINER_SELECTOR) && pathFromElement(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return checkbox.closest(FILE_CONTAINER_SELECTOR);
}

export function findReviewTargets(root: ParentNode = document): ReviewTarget[] {
  const targets: ReviewTarget[] = [];
  const seen = new Set<HTMLInputElement>();

  for (const checkbox of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    if (seen.has(checkbox) || !isViewedCheckbox(checkbox)) continue;

    const container = findFileContainer(checkbox);
    const path = container ? pathFromElement(container) : '';
    if (!path) continue;

    seen.add(checkbox);
    targets.push({ checkbox, path });
  }

  return targets;
}

export function findTestReviewTargets(root: ParentNode = document): ReviewTarget[] {
  return findReviewTargets(root).filter(({ path }) => isTestFilePath(path));
}

