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
  return path
    .toLocaleLowerCase('en-US')
    .split(/[\\/]/)
    .some((segment) => ['__test__', '__tests__'].includes(segment.trim()));
}
