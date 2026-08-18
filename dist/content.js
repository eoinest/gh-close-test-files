"use strict";
(() => {
  // src/matching.ts
  var PULL_REQUEST_CHANGES_ROUTE = /^\/[^/]+\/[^/]+\/pull\/\d+\/(?:files|changes)(?:\/|$)/;
  function isPullRequestChangesPath(pathname) {
    return PULL_REQUEST_CHANGES_ROUTE.test(pathname);
  }
  function isTestFilePath(path) {
    return path.toLocaleLowerCase("en-US").includes("__test__");
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
  function labelText(checkbox) {
    const labels = Array.from(checkbox.labels ?? [], (label) => label.textContent ?? "");
    return [
      checkbox.getAttribute("aria-label") ?? "",
      checkbox.getAttribute("title") ?? "",
      checkbox.dataset.testid ?? "",
      checkbox.className,
      ...labels
    ].join(" ").replace(/\s+/g, " ").trim();
  }
  function isViewedCheckbox(checkbox) {
    if (checkbox.classList.contains("js-reviewed-checkbox")) return true;
    return /\b(viewed|mark(?: this)? file as viewed)\b/i.test(labelText(checkbox));
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
      'a[data-pjax="#repo-content-pjax-container"][title]'
    ].join(","));
    if (!pathElement) return "";
    for (const attribute of ["data-path", "data-file-path", "data-tagsearch-path", "title"]) {
      const value = normalized(pathElement.getAttribute(attribute));
      if (value) return value;
    }
    return normalized(pathElement.textContent);
  }
  function findFileContainer(checkbox) {
    let current = checkbox;
    while (current && current !== document.body) {
      if (current.matches(FILE_CONTAINER_SELECTOR) && pathFromElement(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return checkbox.closest(FILE_CONTAINER_SELECTOR);
  }
  function findReviewTargets(root = document) {
    const targets = [];
    const seen = /* @__PURE__ */ new Set();
    for (const checkbox of root.querySelectorAll('input[type="checkbox"]')) {
      if (seen.has(checkbox) || !isViewedCheckbox(checkbox)) continue;
      const container = findFileContainer(checkbox);
      const path = container ? pathFromElement(container) : "";
      if (!path) continue;
      seen.add(checkbox);
      targets.push({ checkbox, path });
    }
    return targets;
  }
  function findTestReviewTargets(root = document) {
    return findReviewTargets(root).filter(({ path }) => isTestFilePath(path));
  }

  // src/content.ts
  var CONTROL_ID = "gh-test-file-reviewer";
  var CLICK_DELAY_MS = 175;
  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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
    const targets = findTestReviewTargets();
    const remaining = targets.filter(({ checkbox }) => !checkbox.checked).length;
    button.disabled = state === "working" || remaining === 0;
    button.textContent = state === "working" ? "Marking\u2026" : "Mark as viewed";
    status.textContent = message ?? (targets.length === 0 ? "No matching files found." : remaining === 0 ? `All ${targets.length} matching file${targets.length === 1 ? "" : "s"} viewed.` : `${remaining} matching file${remaining === 1 ? "" : "s"} to mark.`);
  }
  async function markTestFilesViewed(host) {
    updateControl(host, "working", "Starting\u2026");
    const targets = findTestReviewTargets().filter(({ checkbox }) => !checkbox.checked);
    let marked = 0;
    for (const { checkbox } of targets) {
      if (!checkbox.isConnected || checkbox.checked || checkbox.disabled) continue;
      checkbox.click();
      await delay(CLICK_DELAY_MS);
      if (checkbox.checked) marked += 1;
      updateControl(host, "working", `Marked ${marked} of ${targets.length}.`);
    }
    updateControl(
      host,
      "idle",
      marked === 0 ? "No files needed updating." : `Marked ${marked} file${marked === 1 ? "" : "s"} as viewed.`
    );
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
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      syncControl();
      const host = document.getElementById(CONTROL_ID);
      if (host) updateControl(host, "idle");
    }, 150);
  });
  syncControl();
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", syncControl);
  document.addEventListener("turbo:load", syncControl);
})();
