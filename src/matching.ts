const PULL_REQUEST_CHANGES_ROUTE =
  /^\/[^/]+\/[^/]+\/pull\/\d+\/(?:files|changes)(?:\/|$)/;

export function isPullRequestChangesPath(pathname: string): boolean {
  return PULL_REQUEST_CHANGES_ROUTE.test(pathname);
}

export function isTestFilePath(path: string): boolean {
  return path.toLocaleLowerCase('en-US').includes('__test__');
}

