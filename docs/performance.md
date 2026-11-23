# Performance review

This review measured Chess Studio 1.6.0 against the 1.7.0 development build in November 2026.

## Conclusion

The largest cost was that every Stockfish search started a new 99 MB WASM worker (about 300 ms each). Workers are now kept warm and reused, with `ucinewgame` before each search, so results are byte-identical to the old build. A game scan of 8 moves dropped from 2,424 ms to 70 ms. A new position at depth 12 dropped from 414 ms to 110 ms. Repeated positions (takebacks, re-renders) now return in about 1 ms from an LRU cache. The 125 ms marker poll on Chess.com/Lichess is replaced by event-driven upkeep, so a page with a live arrow uses near-zero idle CPU.

Analysis quality is unchanged: same engine, same net, same depth defaults, same MultiPV. Proof: 10 searches (5 positions, MultiPV and `searchmoves`) give identical JSON output in the old and new builds (`development/perf-bench.cjs`, `BENCH_RESULTS`).

## Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `engine.mjs` created and terminated a Stockfish worker per `analyze()` call: WASM instantiation + NNUE load (~300 ms) on every search, including each move of the mistake scan and each pane | High | Fixed: warm pool (max 2 idle, 60 s idle timeout) |
| 2 | Identical concurrent searches in one view ran twice; repeated positions were re-searched | Medium | Fixed: in-flight sharing + 64-entry LRU per (position+history, depth, MultiPV, searchmoves) |
| 3 | Cancel terminated the worker | Medium | Fixed: `stop`, wait for `bestmove`, return worker to pool (terminate if no answer in 1 s) |
| 4 | `detect-entry.js` polled every 125 ms per marker, each tick running `capture()` (several `querySelectorAll`, node clones, `JSON.stringify`); live arrows (held open by a view's port) never expire, so the poll ran forever | Medium | Fixed: ResizeObserver + scroll/resize + MutationObserver, throttled to one rAF |
| 5 | No early results: UI waits for the final depth | Medium (UX) | Fixed for panel and pop-out (`companion.mjs`): partial lines from depth 8, at most one redraw per 120 ms, only when moves or scores change. Final candidates are still the completed target-depth result. New view-model fields `searching`, `depth`, `targetDepth` |
| 6 | `vendor/stockfish-19-lite-single.{js,wasm}` (1.85 MB) not referenced anywhere | Low | Removed |
| 7 | Maia lines recomputed for a position already seen | Low | Fixed: 32-entry LRU in `maiaLines` (inference is deterministic) |
| 8 | Popup, side panel and Studio each ran their own engine and analysis of the same FEN | Medium | Fixed: one offscreen document (`engine-host.html`, reason WORKERS) hosts the engine for all views; shared cache and one search per position. Falls back to the in-page engine if the offscreen API or the host is unavailable |
| 9 | Maia ONNX: session created once per worker and cached; model in Cache API with SHA-256 check; batched inference; SIMD build used; `numThreads = 1` | OK | No change. Threads need cross-origin isolation, which extension pages do not have |
| 10 | MutationObserver on the whole document with an attribute filter, callback does one `querySelector` + `contains` per batch, capture debounced 35 ms and de-duplicated by signature | OK | No change; measured at about 1 ms script per 50 board updates |
| 11 | ZIP size: 99 MB full NNUE WASM dominates; already compressed by ZIP | OK | Not shrunk. A smaller net would lose strength |

## Measurements

Headless Chrome for Testing, Apple Silicon, `development/perf-bench.cjs`. Old = the 1.6.0 release, new = the 1.7.0 development build.

| Metric | Old | New |
|---|---|---|
| First search, cold (depth 12, MultiPV 3) | 461 ms | 461-503 ms (same: cold start) |
| New position, depth 12, MultiPV 3 | 414 ms | 110-117 ms |
| Same position again | 415 ms | 1 ms |
| Depth 16, MultiPV 3 (warm) | 769 ms | 471-496 ms |
| Time to first streamed candidate line | n/a (only final) | 2 ms after start (via `onProgress`) |
| 8 sequential depth-8 searches (mistake scan) | 2,424 ms | 70-74 ms |
| Chess.com page idle, no arrow, 5 s | 0 ms script | 0 ms script |
| Chess.com page with live arrow, 5 s | 9 ms script, 10 ms tasks | 0 ms script, 1 ms tasks |
| Position request round trip (capture) | 0.7 ms | 0.8 ms (noise) |
| Extension folder | 109 MB | 107 MB |

The fixture page is small. On a real Chess.com page `capture()` costs more (larger DOM, move list), so the poll removal saves more there than the fixture shows.

## Two views open (popup x2, same positions, `development/perf-views.cjs`)

| Metric | Old | New |
|---|---|---|
| First position, depth 16 (each view) | 1,177-1,261 ms | 1,111-1,307 ms (cold start) |
| Next position, depth 20 (each view) | 2,987 ms | 2,538 ms |
| Takeback to a seen position | 1,191 ms | 0-1 ms |
| Browser RSS, peak during the search | 2,445 MB | 1,834 MB (one engine, not two) |
| Browser RSS, right after the search | 1,153 MB | 1,835 MB (warm engine kept) |
| Browser RSS, 50 s after the last search | 1,149 MB | 1,139 MB (warm engine released after 45 s) |

Trade-off: one warm engine (about 690 MB RSS, mostly the WASM heap) is kept for 45 s after the last search, so the next search starts in about 100 ms instead of about 400 ms. The idle pool holds at most 1 worker.

## Possible follow-ups

1. Studio (`app.mjs` ~514) can pass the same `onProgress` option for early lines.
2. `companion-view.mjs` can render `view.searching` / `view.depth` / `view.targetDepth` as a small "depth 12 → 16" indicator.
