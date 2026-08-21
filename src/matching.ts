const PULL_REQUEST_CHANGES_ROUTE =
  /^\/[^/]+\/[^/]+\/pull\/\d+\/(?:files|changes)(?:\/|$)/;

export function isPullRequestChangesPath(pathname: string): boolean {
  return PULL_REQUEST_CHANGES_ROUTE.test(pathname);
}

export function isTestFilePath(path: string): boolean {
  const normalizedPath = path.toLocaleLowerCase('en-US');
  const filename = normalizedPath.split('/').at(-1) ?? normalizedPath;
  return normalizedPath.includes('__test__') || filename.includes('.test.');
}

export function containsTestDirectory(path: string): boolean {
  return /(^|[^a-z0-9_.-])__tests?__(?=$|[^a-z0-9_.-])/i.test(path.trim());
}
