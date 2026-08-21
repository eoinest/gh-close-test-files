import {
  findExpandedTestDirectoryControls,
  findTestReviewTargets,
  isReviewControlChecked,
  isReviewControlDisabled,
} from './github';
import { isPullRequestChangesPath } from './matching';

const CONTROL_ID = 'gh-test-file-reviewer';
const LOADING_OVERLAY_ID = 'gh-test-file-reviewer-loading';
const SETTLE_TIMEOUT_MS = 10_000;
const DOM_QUIET_MS = 350;
let suppressRefreshUntil = 0;
let lastPageMutationAt = window.performance.now();

type ControlState = 'idle' | 'working';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
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

  let marked = 0;
  let collapsedDirectories = 0;
  suppressRefreshUntil = window.performance.now() + SETTLE_TIMEOUT_MS;
  const loadingOverlay = showLoadingOverlay(targets.length);
  await waitForPaint();

  try {
    for (const { control } of targets) {
      control.click();
    }

    for (const control of findExpandedTestDirectoryControls()) {
      if (!control.isConnected || control.getAttribute('aria-expanded') !== 'true') continue;
      control.click();
      collapsedDirectories += 1;
    }

    const deadline = window.performance.now() + SETTLE_TIMEOUT_MS;
    do {
      marked = targets.filter(({ control }) => (
        !control.isConnected || isReviewControlChecked(control)
      )).length;
      const pageIsQuiet = window.performance.now() - lastPageMutationAt >= DOM_QUIET_MS;
      if (marked === targets.length && pageIsQuiet) break;
      await delay(50);
    } while (window.performance.now() < deadline);
  } finally {
    await hideLoadingOverlay(loadingOverlay);
  }

  updateControl(
    host,
    'idle',
    marked < targets.length
      ? `Queued ${targets.length} files; GitHub is still updating.`
      : [
          `Marked ${marked} file${marked === 1 ? '' : 's'} as viewed`,
          collapsedDirectories === 0
            ? '.'
            : ` and collapsed ${collapsedDirectories} __test__ director${collapsedDirectories === 1 ? 'y' : 'ies'}.`,
        ].join(''),
  );
}

function showLoadingOverlay(fileCount: number): HTMLElement {
  document.getElementById(LOADING_OVERLAY_ID)?.remove();

  const host = document.createElement('div');
  host.id = LOADING_OVERLAY_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host {
        align-items: center;
        background: var(--bgColor-default, Canvas);
        color: var(--fgColor-default, CanvasText);
        display: flex;
        font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        inset: 0;
        justify-content: center;
        opacity: 1;
        position: fixed;
        transition: opacity 140ms ease-out;
        z-index: 2147483646;
      }

      .loading {
        align-items: center;
        display: flex;
        flex-direction: column;
        gap: 12px;
        text-align: center;
      }

      .spinner {
        animation: spin 700ms linear infinite;
        border: 3px solid var(--borderColor-muted, ButtonBorder);
        border-radius: 50%;
        border-top-color: var(--fgColor-accent, Highlight);
        height: 24px;
        width: 24px;
      }

      strong { font-size: 15px; }
      span { color: var(--fgColor-muted, GrayText); }
      @keyframes spin { to { transform: rotate(360deg); } }

      @media (prefers-reduced-motion: reduce) {
        :host { transition: none; }
        .spinner { animation-duration: 1.4s; }
      }
    </style>
    <div class="loading" role="status" aria-live="assertive">
      <div class="spinner" aria-hidden="true"></div>
      <strong>Marking ${fileCount} test file${fileCount === 1 ? '' : 's'} as viewed…</strong>
      <span>Waiting for GitHub to finish</span>
    </div>
  `;
  document.body.append(host);
  return host;
}

async function hideLoadingOverlay(host: HTMLElement): Promise<void> {
  host.style.opacity = '0';
  await delay(160);
  host.remove();
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
  lastPageMutationAt = window.performance.now();
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
