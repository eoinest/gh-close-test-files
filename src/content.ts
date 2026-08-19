import {
  findTestReviewTargets,
  isReviewControlChecked,
  isReviewControlDisabled,
} from './github';
import { isPullRequestChangesPath } from './matching';

const CONTROL_ID = 'gh-test-file-reviewer';
const SETTLE_TIMEOUT_MS = 1_200;
let suppressRefreshUntil = 0;

type ControlState = 'idle' | 'working';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function createControl(): HTMLElement {
  const host = document.createElement('div');
  host.id = CONTROL_ID;
  host.setAttribute('data-extension', 'github-test-file-reviewer');
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host {
        bottom: 20px;
        color-scheme: light dark;
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        position: fixed;
        right: 20px;
        z-index: 2147483000;
      }

      details {
        background: var(--bgColor-default, Canvas);
        border: 1px solid var(--borderColor-default, ButtonBorder);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgb(0 0 0 / 14%);
        color: var(--fgColor-default, CanvasText);
        min-width: 188px;
      }

      summary {
        cursor: pointer;
        font-weight: 600;
        list-style: none;
        padding: 7px 10px;
        user-select: none;
      }

      summary::-webkit-details-marker { display: none; }
      summary::after { content: " ▾"; font-size: 11px; }
      details[open] summary::after { content: " ▴"; }

      .body {
        border-top: 1px solid var(--borderColor-muted, ButtonBorder);
        padding: 10px;
      }

      button {
        background: var(--button-default-bgColor-rest, ButtonFace);
        border: 1px solid var(--button-default-borderColor-rest, ButtonBorder);
        border-radius: 6px;
        color: var(--button-default-fgColor-rest, ButtonText);
        cursor: pointer;
        display: block;
        font: inherit;
        font-weight: 600;
        padding: 5px 9px;
        width: 100%;
      }

      button:hover:not(:disabled) { filter: brightness(0.96); }
      button:disabled { cursor: default; opacity: 0.65; }
      [role="status"] { color: var(--fgColor-muted, GrayText); margin-top: 7px; }
    </style>
    <details>
      <summary>Test files</summary>
      <div class="body">
        <button type="button">Mark as viewed</button>
        <div role="status" aria-live="polite"></div>
      </div>
    </details>
  `;

  const button = shadow.querySelector<HTMLButtonElement>('button');
  if (!button) throw new Error('Could not create extension control');
  button.addEventListener('click', () => void markTestFilesViewed(host));

  updateControl(host, 'idle');
  return host;
}

function updateControl(host: HTMLElement, state: ControlState, message?: string): void {
  const button = host.shadowRoot?.querySelector<HTMLButtonElement>('button');
  const status = host.shadowRoot?.querySelector<HTMLElement>('[role="status"]');
  if (!button || !status) return;

  host.dataset.controlState = state;
  const targets = findTestReviewTargets();
  const remaining = targets.filter(({ control }) => !isReviewControlChecked(control)).length;
  button.disabled = state === 'working' || remaining === 0;
  button.textContent = state === 'working' ? 'Marking…' : 'Mark as viewed';
  status.textContent = message ?? (
    targets.length === 0
      ? 'No matching files found.'
      : remaining === 0
        ? `All ${targets.length} matching file${targets.length === 1 ? '' : 's'} viewed.`
        : `${remaining} matching file${remaining === 1 ? '' : 's'} to mark.`
  );
}

async function markTestFilesViewed(host: HTMLElement): Promise<void> {
  if (host.dataset.controlState === 'working') return;

  const targets = findTestReviewTargets()
    .filter(({ control }) => (
      control.isConnected
      && !isReviewControlChecked(control)
      && !isReviewControlDisabled(control)
    ));

  if (targets.length === 0) {
    updateControl(host, 'idle', 'No files needed updating.');
    return;
  }

  updateControl(
    host,
    'working',
    `Marking ${targets.length} file${targets.length === 1 ? '' : 's'}…`,
  );

  // Run every click in one rendering frame. GitHub can then apply its optimistic
  // collapse state in one paint instead of visibly collapsing files one by one.
  suppressRefreshUntil = window.performance.now() + SETTLE_TIMEOUT_MS;
  await nextAnimationFrame();
  for (const { control } of targets) {
    control.click();
  }

  const deadline = window.performance.now() + SETTLE_TIMEOUT_MS;
  let marked = 0;
  do {
    marked = targets.filter(({ control }) => (
      !control.isConnected || isReviewControlChecked(control)
    )).length;
    if (marked === targets.length) break;
    await delay(50);
  } while (window.performance.now() < deadline);

  updateControl(
    host,
    'idle',
    marked < targets.length
      ? `Queued ${targets.length} files; GitHub is still updating.`
      : `Marked ${marked} file${marked === 1 ? '' : 's'} as viewed.`,
  );
}

function syncControl(): void {
  const existing = document.getElementById(CONTROL_ID);

  if (!isPullRequestChangesPath(window.location.pathname)) {
    existing?.remove();
    return;
  }

  if (!existing) document.body.append(createControl());
}

let refreshTimer = 0;
const observer = new MutationObserver(() => {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    if (window.performance.now() < suppressRefreshUntil) return;
    syncControl();
    const host = document.getElementById(CONTROL_ID);
    if (host && host.dataset.controlState !== 'working') {
      updateControl(host, 'idle');
    }
  }, 150);
});

syncControl();
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('popstate', syncControl);
document.addEventListener('turbo:load', syncControl);
