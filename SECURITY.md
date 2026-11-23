# Security policy

Chess Studio runs on chess websites you visit and reads the board on them. Problems that could let a page or another extension read data it shouldn't, or run code in the extension, are treated as security issues.

## Reporting a vulnerability

Please report it privately through [GitHub's private vulnerability reporting](https://github.com/FL-spec/chess-studio/security/advisories/new) rather than in a public issue. Include the steps to reproduce it and the extension version from `chrome://extensions`.

## What Chess Studio does with your data

- It has no server, account, analytics or telemetry.
- Board positions, player names, saved games and settings stay in Chrome's local extension storage.
- The only network request is the one-time download of the Maia-3 model from `raw.githubusercontent.com`. The file is checked against a pinned SHA-256 digest before use, and nothing about you or your games is sent.
- Content scripts run only on chess.com and lichess.org, as declared in `manifest.json`. **Read this tab** uses the `activeTab` permission, which applies to one tab until you leave the page.
- The extension never moves pieces or submits anything on a website.

## Supported versions

Only the latest release receives fixes.
