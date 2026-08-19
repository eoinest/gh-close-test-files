# GitHub Test File Reviewer

A deliberately small Chrome extension for GitHub pull requests. On a PR's **Files changed** page, it adds a compact dropdown in the lower-right corner that marks matching test files as **Viewed**. GitHub then collapses those files in the usual way.

Matching is case-insensitive. A file matches when its path contains the literal `__test__` or its filename follows `*.test.*`, such as `src/__test__/button.ts`, `src/button.__test__.ts`, or `src/button.test.tsx`.

## Screenshot

![GitHub Test File Reviewer marking two matching files as viewed on a public GT pull request](docs/gt-pr-2073.png)

Shown on [`generaltranslation/gt` pull request #2073](https://github.com/generaltranslation/gt/pull/2073/changes).

## Install

1. Install dependencies and build the extension:

   ```sh
   npm install
   npm run build
   ```

2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this repository's `dist` directory.

## Use

Open a GitHub pull request's **Files changed** page. Open the **Test files** dropdown at the lower right and click **Mark as viewed**. Already-viewed files are left alone.

Both GitHub's `/pull/.../files` route and its `/pull/.../changes` route are supported. The extension requests access only to GitHub pull-request pages and does not send data anywhere.

## Develop and verify

```sh
npm run check
```

For a local browser fixture, build first and then run:

```sh
node scripts/fixture-server.mjs
```

Visit `http://127.0.0.1:4173/eoinest/example/pull/1/files`. The fixture loads the built content script directly so the review interaction can be exercised without changing a real pull request.
