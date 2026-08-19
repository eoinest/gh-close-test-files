import {
  findTestReviewTargets,
  isReviewControlChecked,
  isReviewControlDisabled,
} from './github';
import { isPullRequestChangesPath } from './matching';

const CONTROL_ID = 'gh-test-file-reviewer';
const CLICK_DELAY_MS = 175;

type ControlState = 'idle' | 'working';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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
  updateControl(host, 'working', 'Starting…');
  const targets = findTestReviewTargets()
    .filter(({ control }) => !isReviewControlChecked(control));
  let marked = 0;

  for (const { control } of targets) {
    if (
      !control.isConnected
      || isReviewControlChecked(control)
      || isReviewControlDisabled(control)
    ) continue;
    control.click();
    await delay(CLICK_DELAY_MS);
    if (isReviewControlChecked(control)) marked += 1;
    updateControl(host, 'working', `Marked ${marked} of ${targets.length}.`);
  }

  updateControl(
    host,
    'idle',
    marked === 0
      ? 'No files needed updating.'
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
    syncControl();
    const host = document.getElementById(CONTROL_ID);
    if (host) updateControl(host, 'idle');
  }, 150);
});

syncControl();
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('popstate', syncControl);
document.addEventListener('turbo:load', syncControl);
