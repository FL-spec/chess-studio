# Contributing

Bug reports, board detection problems and pull requests are welcome.

## Reporting a detection problem

Most bugs are about a page Chess Studio reads wrongly or not at all. The most useful report has:

1. the page URL pattern (for example `chess.com/play/computer`), with any game IDs removed;
2. the position as FEN, if you can copy it from the site;
3. what Chess Studio showed, and what you expected;
4. your Chrome version and the Chess Studio version from `chrome://extensions`.

A screenshot helps. Crop out usernames you don't want to share.

A pull request that changes a site adapter should add the case to `development/detector-test.mjs`.

## Running the tests

The tests load the unpacked extension in a real browser through Playwright Core. Use Node.js 20 or later and a Chrome for Testing or Chromium build that can load unpacked extensions.

```bash
cd development
npm install
CHESS_TEST_CHROME=/path/to/chrome npm test
```

One way to get a suitable browser is `npx playwright install chromium`, then point `CHESS_TEST_CHROME` at the installed binary.

## Working on the extension

- Load `extension/` with **Load unpacked** and click the reload icon on `chrome://extensions` after each change.
- The extension has no build step and no runtime dependencies beyond `vendor/`. Keep it that way unless a dependency is clearly worth it.
- Engine and model changes must not change results silently. If you touch `engine.mjs`, `engine-core.mjs` or the Maia code, run `development/perf-bench.cjs` before and after and compare the output.
- Honor `prefers-reduced-motion` in any new animation.
- Keep everything local. Pull requests that add network calls, analytics or accounts will not be accepted.

## Style

- Plain JavaScript modules, two-space indentation, see `.editorconfig`.
- Short, specific UI copy in sentence case.
- Third-party code goes in `extension/vendor/` with its license file, and gets a row in `THIRD_PARTY_NOTICES.md`.

By contributing, you agree that your contribution is licensed under GPL-3.0-or-later.
