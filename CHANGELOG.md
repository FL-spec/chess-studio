# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## 1.7.1 · 2026-11-23

### Fixed

- Commentator reactions to your move no longer disappear when the opponent replies quickly. Each move is graded on its own search, and Commentator mode skips the hidden candidate search so reactions arrive within about a second.
- Board arrows wait for the finished search instead of jumping between shallow candidates.
- The origin-square highlight stays on its square while the arrow draws in.
- The Commentator card no longer flickers when the panel redraws.
- The move badge shows your own last move, labelled "Your" or "Their".
- The panel no longer freezes when the game tab stops answering, for example after a page navigation or an extension reload. Requests to the tab time out and the update loop restarts itself.

### Changed

- New neutral palette: black and white with blue as the single accent, in light and dark mode.
- The preview board in the panel can be hidden with **Hide board**, and no longer replays on hover.
- The move explanation text is replaced by one **Why <move>? →** link that opens the line in Studio.
- Practice and Review in Studio have distinct layouts: Practice is board-first, Review starts from an import card and shows quality dots and an evaluation graph.
- Candidate moves default to 3, and Human predictions default to two plies (move and reply), so Human mode answers much faster. Both are adjustable in Settings.
- The panel finds a game in a tab that was open before the extension was installed or reloaded, without a page refresh.
- Engine and Human predictions are both computed after every move, so switching lenses is instant.
- Commentators have a transparent background and a distinct motion per mood: a hop for Best, a nod for good moves, a head tilt while thinking, a wince for mistakes and a jolt for blunders.
- Panel redraws during a search no longer flicker: rows keep a fixed height and animations only play on real changes.
- The pinned panel and pop-out fit a 720 px tall screen.
- New commentator avatars with professional clothing (blazer, sweater, hoodie) and clearer expressions.
- More varied commentator lines, and no line repeats twice in a row.

## 1.7.0 · 2026-11-23

### Changed

- Stockfish workers stay warm and are reused between searches, with `ucinewgame` before each search. A new position at depth 12 takes about 110 ms instead of about 414 ms, and an 8-move turning-point scan about 70 ms instead of 2,424 ms. Results are identical to 1.6.0 ([performance review](docs/performance.md)).
- Identical searches are shared, and repeated positions return from an LRU cache.
- The popup, side panel and Studio share one engine through an offscreen document.
- Board tracking on Chess.com and Lichess is event-driven instead of polling every 125 ms, so a page with a live arrow uses almost no idle CPU.
- Maia-3 results for positions already seen come from an LRU cache.
- Redesigned header above the board: one compact row with the turn, live source and **Back to game**, and player strips aligned with the board.
- Redesigned board arrows: tapered solid arrows with a contrast outline, a solid amber reply, and graded size in **All moves**.
- Interface font changed to Nunito, bundled locally.
- The pop-out and pinned panel always follow the website board. The board source switch is gone.
- Settings are grouped into Analysis, Board & arrows, Coaching, Appearance and Practice board. Each control has a one-line explanation, switches and segmented controls replace most menus, and **Reset to recommended** restores the defaults.

### Added

- Partial engine lines appear in the pop-out and pinned panel while the search runs.
- A scanning state while Chess Studio looks for a game, and a depth indicator while Stockfish searches.
- Move animations: pieces slide, captures fade, and arrows draw in. An animated mini-board in the pop-out and pinned panel plays the selected move and reply.
- Move-quality badges (Best, Excellent, Good, Inaccuracy, Mistake, Blunder) graded from the drop in expected score, with a best-move streak and a short celebration.
- **Coach | Commentator** modes in the pop-out and pinned panel. Coach shows the best moves and arrows. Commentator hides suggestions and comments on each move with the grade, streak and accuracy. Choose between five commentator personas (The Coach, The Streamer, The Grandmaster, The Professor, The Analyst), each with its own voice and six expressions.
- A **Live** or **Analysis** status chip replaces the website name.
- Board colours (Slate, Green, Wood) and an Animations setting.
- Accuracy rings in Review.

### Removed

- The unused Stockfish 19 Lite build (1.85 MB).

## 1.6.0

### Changed

- Move rows show piece icons.
- Flatter layout with fewer boxes and rules.

### Added

- Evaluation bar in the pop-out and pinned panel, from White's perspective. It can be hidden in Settings.
- Loading indicators while the engine and model start.
- Reduced-motion support: transitions are turned off when the system asks for it.

## 1.5.0

### Changed

- The engine is the full Stockfish 19 NNUE build instead of Stockfish 19 Lite.
- Maia-3 is the default human model. On 240 positions from Lichess games it ranked the played move first in 53.8% of cases, against 31.7% for the built-in model. The built-in model remains as a fallback and can be selected in Settings.

## 1.4.2

### Changed

- Board arrows follow the turn.

### Added

- **Back to game** in Studio returns to the source tab.

### Removed

- **Copy FEN**.

## 1.4.0

### Added

- Three views: **Pop out**, **Pin analysis** and **Open Studio**.
- Engine and Human toggle.
- Arrows for all candidate moves or only the selected one.
- Arrows for the opponent's moves.

## 1.3.x

### Added

- Turn-aware arrows.
- Detection of the signed-in user on Chess.com, so players are labelled You and Opponent.
- A single Settings page.
