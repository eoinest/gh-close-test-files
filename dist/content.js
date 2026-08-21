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
  function containsTestDirectory(path) {
    return /(^|[^a-z0-9_.-])__tests?__(?=$|[^a-z0-9_.-])/i.test(path.trim());
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
  var FILE_TREE_ROOT_SELECTOR = [
    '[role="tree"]',
    '[role="tree"][aria-label="File Tree"]',
    '[aria-label*="file tree" i]',
    '[aria-label="File Tree Navigation"]',
    "file-tree",
    '[data-target*="fileTree"]',
    '[data-testid*="file-tree"]'
  ].join(",");
  var DIRECTORY_CANDIDATE_SELECTOR = [
    "[aria-expanded]",
    '[aria-label*="directory" i]',
    '[title*="directory" i]',
    '[role="treeitem"]',
    '[data-tree-entry-type="directory"]',
    "details"
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
  function textWithoutNestedGroups(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('[role="group"], ul, ol').forEach((group) => group.remove());
    return normalized(clone.textContent);
  }
  function directoryLabel(element) {
    return [
      element.getAttribute("aria-label") ?? "",
      element.getAttribute("title") ?? "",
      element.getAttribute("data-path") ?? "",
      element.getAttribute("data-name") ?? "",
      textWithoutNestedGroups(element)
    ].join(" ");
  }
  function directoryNode(candidate) {
    return candidate.closest([
      '[role="treeitem"]',
      '[data-tree-entry-type="directory"]',
      "details"
    ].join(",")) ?? candidate;
  }
  function directoryControl(node, candidate) {
    if (candidate.matches('button, [role="button"], summary')) return candidate;
    return node.querySelector([
      ":scope > button",
      ':scope > [role="button"]',
      ":scope > summary",
      ':scope > :not([role="group"]) button',
      ':scope > :not([role="group"]) [role="button"]',
      ':scope > :not([role="group"]) [aria-label*="directory" i]',
      ':scope > :not([role="group"]) [title*="directory" i]'
    ].join(",")) ?? node;
  }
  function explicitExpandedState(element) {
    const ariaExpanded = element.getAttribute("aria-expanded");
    if (ariaExpanded === "true") return true;
    if (ariaExpanded === "false") return false;
    if (element.matches("details")) return element.hasAttribute("open");
    const state = `${element.getAttribute("data-state") ?? ""} ${element.className}`;
    if (/\b(expanded|open)\b/i.test(state)) return true;
    if (/\b(collapsed|closed)\b/i.test(state)) return false;
    const actionLabel = `${element.getAttribute("aria-label") ?? ""} ${element.getAttribute("title") ?? ""}`;
    if (/\bcollapse\b/i.test(actionLabel)) return true;
    if (/\bexpand\b/i.test(actionLabel)) return false;
    return null;
  }
  function visibleChildGroup(node) {
    const group = node.querySelector(
      ':scope > [role="group"], :scope > ul, :scope > ol'
    );
    if (!group || group.hidden || group.getAttribute("aria-hidden") === "true") return false;
    if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
      const style = window.getComputedStyle(group);
      return style.display !== "none" && style.visibility !== "hidden";
    }
    return true;
  }
  function isExpandedDirectory(node, control) {
    return explicitExpandedState(control) ?? explicitExpandedState(node) ?? visibleChildGroup(node);
  }
  function findTestDirectoryControls(root = document) {
    const controls = [];
    const seen = /* @__PURE__ */ new Set();
    const roots = root.querySelectorAll(FILE_TREE_ROOT_SELECTOR);
    for (const tree of roots) {
      for (const candidate of tree.querySelectorAll(DIRECTORY_CANDIDATE_SELECTOR)) {
        const node = directoryNode(candidate);
        if (node.dataset.treeEntryType === "file") continue;
        if (!containsTestDirectory(directoryLabel(node))) continue;
        const control = directoryControl(node, candidate);
        if (seen.has(control)) continue;
        seen.add(control);
        controls.push(control);
      }
    }
    return controls;
  }
  function findExpandedTestDirectoryControls(root = document) {
    return findTestDirectoryControls(root).filter((control) => {
      const node = directoryNode(control);
      return isExpandedDirectory(node, control);
    });
  }

  // src/content.ts
  var CONTROL_ID = "gh-test-file-reviewer";
  var LOADING_OVERLAY_ID = "gh-test-file-reviewer-loading";
  var SETTLE_TIMEOUT_MS = 1e4;
  var DOM_QUIET_MS = 350;
  var suppressRefreshUntil = 0;
  var collapseTestDirectoriesUntil = 0;
  var lastPageMutationAt = window.performance.now();
  var attemptedDirectoryControls = /* @__PURE__ */ new WeakSet();
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
    host.dataset.extensionVersion = "0.2.1";
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
      .version { color: var(--fgColor-muted, GrayText); font-weight: 400; }

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
      <summary>Test files <span class="version">v${"0.2.1"}</span></summary>
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
    const directoryControls = findTestDirectoryControls().length;
    const expandedDirectories = findExpandedTestDirectoryControls().length;
    button.disabled = state === "working";
    button.textContent = state === "working" ? "Marking\u2026" : remaining === 0 ? "Collapse test directories" : "Mark as viewed";
    let fallbackStatus;
    if (targets.length === 0 && directoryControls === 0) {
      fallbackStatus = "No matching files found.";
    } else if (remaining === 0 && expandedDirectories > 0) {
      fallbackStatus = `${expandedDirectories} test director${expandedDirectories === 1 ? "y" : "ies"} to collapse.`;
    } else if (remaining === 0) {
      fallbackStatus = "Matching files viewed; click to retry sidebar collapse.";
    } else {
      fallbackStatus = `${remaining} matching file${remaining === 1 ? "" : "s"} to mark.`;
    }
    status.textContent = message ?? fallbackStatus;
  }
  function collapseExpandedTestDirectories() {
    let collapsed = 0;
    for (const control of findExpandedTestDirectoryControls()) {
      if (!control.isConnected || attemptedDirectoryControls.has(control)) continue;
      attemptedDirectoryControls.add(control);
      control.click();
      collapsed += 1;
    }
    return collapsed;
  }
  async function markTestFilesViewed(host) {
    if (host.dataset.controlState === "working") return;
    const targets = findTestReviewTargets().filter(({ control }) => control.isConnected && !isReviewControlChecked(control) && !isReviewControlDisabled(control));
    collapseTestDirectoriesUntil = window.performance.now() + SETTLE_TIMEOUT_MS;
    suppressRefreshUntil = collapseTestDirectoriesUntil;
    attemptedDirectoryControls = /* @__PURE__ */ new WeakSet();
    if (targets.length === 0) {
      const collapsed = collapseExpandedTestDirectories();
      updateControl(
        host,
        "idle",
        collapsed > 0 ? `Collapsed ${collapsed} test director${collapsed === 1 ? "y" : "ies"}.` : "No expanded test directories found; you can retry."
      );
      return;
    }
    let collapsedDirectories = collapseExpandedTestDirectories() > 0;
    updateControl(
      host,
      "working",
      `Marking ${targets.length} file${targets.length === 1 ? "" : "s"}\u2026`
    );
    let marked = 0;
    const loadingOverlay = showLoadingOverlay(targets.length);
    await waitForPaint();
    try {
      for (const { control } of targets) {
        control.click();
      }
      const deadline = window.performance.now() + SETTLE_TIMEOUT_MS;
      do {
        collapsedDirectories = collapseExpandedTestDirectories() > 0 || collapsedDirectories;
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
      marked < targets.length ? `Queued ${targets.length} files; GitHub is still updating.` : [
        `Marked ${marked} file${marked === 1 ? "" : "s"} as viewed`,
        collapsedDirectories ? " and collapsed test directories." : "."
      ].join("")
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
      collapseTestDirectoriesUntil = 0;
      existing?.remove();
      return;
    }
    if (!existing) document.body.append(createControl());
  }
  var refreshTimer = 0;
  var observer = new MutationObserver(() => {
    lastPageMutationAt = window.performance.now();
    if (lastPageMutationAt < collapseTestDirectoriesUntil) {
      collapseExpandedTestDirectories();
    }
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
  observer.observe(document.documentElement, {
    attributeFilter: ["aria-expanded"],
    attributes: true,
    childList: true,
    subtree: true
  });
  window.addEventListener("popstate", syncControl);
  document.addEventListener("turbo:load", syncControl);
})();
