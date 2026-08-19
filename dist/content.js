"use strict";
(() => {
  // src/matching.ts
  var PULL_REQUEST_CHANGES_ROUTE = /^\/[^/]+\/[^/]+\/pull\/\d+\/(?:files|changes)(?:\/|$)/;
  function isPullRequestChangesPath(pathname) {
    return PULL_REQUEST_CHANGES_ROUTE.test(pathname);
  }
  function isTestFilePath(path) {
    const normalizedPath = path.toLocaleLowerCase("en-US");
    const filename = normalizedPath.split("/").at(-1) ?? normalizedPath;
    return normalizedPath.includes("__test__") || filename.includes(".test.");
  }

  // src/github.ts
  var FILE_CONTAINER_SELECTOR = [
    ".js-file",
    '[data-testid="diff-file"]',
    '[data-testid="file-diff"]',
    "[data-path]",
    "[data-file-path]",
    "[data-tagsearch-path]"
  ].join(",");
  function normalized(value) {
    return value?.trim().replace(/^\u200e/, "") ?? "";
  }
  function labelText(control) {
    const labels = control instanceof HTMLInputElement ? Array.from(control.labels ?? [], (label) => label.textContent ?? "") : [];
    const labelledBy = (control.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "");
    return [
      control.getAttribute("aria-label") ?? "",
      control.getAttribute("title") ?? "",
      control.dataset.testid ?? "",
      control.className,
      ...labelledBy,
      ...labels
    ].join(" ").replace(/\s+/g, " ").trim();
  }
  function isViewedControl(control) {
    if (control.classList.contains("js-reviewed-checkbox")) return true;
    if (Array.from(control.classList).some((name) => name.includes("MarkAsViewedButton"))) {
      return true;
    }
    return /\b(viewed|mark(?: this)? file as viewed)\b/i.test(labelText(control));
  }
  function pathFromElement(element) {
    for (const attribute of ["data-path", "data-file-path", "data-tagsearch-path"]) {
      const value = normalized(element.getAttribute(attribute));
      if (value) return value;
    }
    const pathElement = element.querySelector([
      "[data-path]",
      "[data-file-path]",
      "[data-tagsearch-path]",
      '[data-testid="file-name"]',
      ".file-info a[title]",
      'a[data-pjax="#repo-content-pjax-container"][title]',
      'a[href^="#diff-"]',
      '[aria-label^="File path:"]'
    ].join(","));
    if (!pathElement) return "";
    for (const attribute of ["data-path", "data-file-path", "data-tagsearch-path", "title"]) {
      const value = normalized(pathElement.getAttribute(attribute));
      if (value) return value;
    }
    const ariaLabel = normalized(pathElement.getAttribute("aria-label"));
    if (ariaLabel.toLocaleLowerCase("en-US").startsWith("file path:")) {
      return ariaLabel.slice("file path:".length).trim();
    }
    return normalized(pathElement.textContent);
  }
  function findFileContainer(control) {
    let current = control;
    while (current && current !== document.body) {
      if (pathFromElement(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return control.closest(FILE_CONTAINER_SELECTOR);
  }
  function isReviewControlChecked(control) {
    if (control instanceof HTMLInputElement) return control.checked;
    return control.getAttribute("aria-checked") === "true" || control.getAttribute("aria-pressed") === "true" || control.dataset.state === "checked";
  }
  function isReviewControlDisabled(control) {
    if (control instanceof HTMLInputElement || control instanceof HTMLButtonElement) {
      return control.disabled;
    }
    return control.getAttribute("aria-disabled") === "true";
  }
  function findReviewTargets(root = document) {
    const targets = [];
    const seen = /* @__PURE__ */ new Set();
    const controls = root.querySelectorAll([
      'input[type="checkbox"]',
      "button[aria-pressed]",
      '[role="checkbox"]'
    ].join(","));
    for (const control of controls) {
      if (seen.has(control) || !isViewedControl(control)) continue;
      const container = findFileContainer(control);
      const path = container ? pathFromElement(container) : "";
      if (!path) continue;
      seen.add(control);
      targets.push({ control, path });
    }
    return targets;
  }
  function findTestReviewTargets(root = document) {
    return findReviewTargets(root).filter(({ path }) => isTestFilePath(path));
  }

  // src/content.ts
  var CONTROL_ID = "gh-test-file-reviewer";
  var LOADING_OVERLAY_ID = "gh-test-file-reviewer-loading";
  var SETTLE_TIMEOUT_MS = 1e4;
  var DOM_QUIET_MS = 350;
  var suppressRefreshUntil = 0;
  var lastPageMutationAt = window.performance.now();
  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
  function waitForPaint() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }
  function createControl() {
    const host = document.createElement("div");
    host.id = CONTROL_ID;
    host.setAttribute("data-extension", "github-test-file-reviewer");
    const shadow = host.attachShadow({ mode: "open" });
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
      summary::after { content: " \u25BE"; font-size: 11px; }
      details[open] summary::after { content: " \u25B4"; }

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
    const button = shadow.querySelector("button");
    if (!button) throw new Error("Could not create extension control");
    button.addEventListener("click", () => void markTestFilesViewed(host));
    updateControl(host, "idle");
    return host;
  }
  function updateControl(host, state, message) {
    const button = host.shadowRoot?.querySelector("button");
    const status = host.shadowRoot?.querySelector('[role="status"]');
    if (!button || !status) return;
    host.dataset.controlState = state;
    const targets = findTestReviewTargets();
    const remaining = targets.filter(({ control }) => !isReviewControlChecked(control)).length;
    button.disabled = state === "working" || remaining === 0;
    button.textContent = state === "working" ? "Marking\u2026" : "Mark as viewed";
    status.textContent = message ?? (targets.length === 0 ? "No matching files found." : remaining === 0 ? `All ${targets.length} matching file${targets.length === 1 ? "" : "s"} viewed.` : `${remaining} matching file${remaining === 1 ? "" : "s"} to mark.`);
  }
  async function markTestFilesViewed(host) {
    if (host.dataset.controlState === "working") return;
    const targets = findTestReviewTargets().filter(({ control }) => control.isConnected && !isReviewControlChecked(control) && !isReviewControlDisabled(control));
    if (targets.length === 0) {
      updateControl(host, "idle", "No files needed updating.");
      return;
    }
    updateControl(
      host,
      "working",
      `Marking ${targets.length} file${targets.length === 1 ? "" : "s"}\u2026`
    );
    let marked = 0;
    suppressRefreshUntil = window.performance.now() + SETTLE_TIMEOUT_MS;
    const loadingOverlay = showLoadingOverlay(targets.length);
    await waitForPaint();
    try {
      for (const { control } of targets) {
        control.click();
      }
      const deadline = window.performance.now() + SETTLE_TIMEOUT_MS;
      do {
        marked = targets.filter(({ control }) => !control.isConnected || isReviewControlChecked(control)).length;
        const pageIsQuiet = window.performance.now() - lastPageMutationAt >= DOM_QUIET_MS;
        if (marked === targets.length && pageIsQuiet) break;
        await delay(50);
      } while (window.performance.now() < deadline);
    } finally {
      await hideLoadingOverlay(loadingOverlay);
    }
    updateControl(
      host,
      "idle",
      marked < targets.length ? `Queued ${targets.length} files; GitHub is still updating.` : `Marked ${marked} file${marked === 1 ? "" : "s"} as viewed.`
    );
  }
  function showLoadingOverlay(fileCount) {
    document.getElementById(LOADING_OVERLAY_ID)?.remove();
    const host = document.createElement("div");
    host.id = LOADING_OVERLAY_ID;
    const shadow = host.attachShadow({ mode: "open" });
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
      <strong>Marking ${fileCount} test file${fileCount === 1 ? "" : "s"} as viewed\u2026</strong>
      <span>Waiting for GitHub to finish</span>
    </div>
  `;
    document.body.append(host);
    return host;
  }
  async function hideLoadingOverlay(host) {
    host.style.opacity = "0";
    await delay(160);
    host.remove();
  }
  function syncControl() {
    const existing = document.getElementById(CONTROL_ID);
    if (!isPullRequestChangesPath(window.location.pathname)) {
      existing?.remove();
      return;
    }
    if (!existing) document.body.append(createControl());
  }
  var refreshTimer = 0;
  var observer = new MutationObserver(() => {
    lastPageMutationAt = window.performance.now();
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      if (window.performance.now() < suppressRefreshUntil) return;
      syncControl();
      const host = document.getElementById(CONTROL_ID);
      if (host && host.dataset.controlState !== "working") {
        updateControl(host, "idle");
      }
    }, 150);
  });
  syncControl();
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", syncControl);
  document.addEventListener("turbo:load", syncControl);
})();
