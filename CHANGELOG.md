# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## 1.10.0 · 2026-11-25

### Added

- **Opening talk.** When a new opening appears on the board, the coach names it once and gives its main idea, for example "Here comes the Scandinavian Defence. Black hits e4 at once, and the queen comes out early." Each coach says it in their own voice. Your first move after the book is marked, for example "We leave theory here."
- **Plain words on the top move.** The best move row says what the move does ("Captures the pawn on d5.") instead of only the squares.

### Changed

- **Coach first.** In Coach mode, the coach and speech bubble now sit at the top of the panel, as in Commentator. The coach is larger (88px) and the text is easier to read.
- **Clearer header.** The settings button is a visible 40px button, and the Coach / Commentator switch is taller with a dark selected side.
- **Opening names.** More early positions get the right name (Italian Game, Ruy Lopez, Scotch Game, Two Knights, Sicilian with 2…Nc6, Alapin). Two repertoire names are clearer: "London System with …c5" and "London vs King's Indian setup".

## 1.9.0 · 2026-11-24

### Added

- **Book moves.** Opening theory is graded Book with the opening name, as on Chess.com. The book has 34 named main lines and the bundled move statistics. In the first 8 moves, Maia-3 also counts as an opening explorer: a strong move that at least 12% of 2200-rated players choose is Book.
- **Your openings.** In Settings, choose an opening as White, an answer to 1.e4 and an answer to 1.d4. In those positions, your opening's move comes first, labelled "Your opening · London System".
- **One level everywhere.** A level picker in the panel (Human and Pro) changes the same level as Settings, for Human, Pro, premoves and bullet.
- **Pro balance.** A slider from engine-like to human-like replaces the three Pro styles. Saved styles still work.
- **Coach voices.** Each coach has its own words. Coach and Commentator now say the same things.

### Changed

- **Bullet mode is human by default.** It shows the move a player would make, checked by a quick Stockfish search (depth 8). "Engine" keeps the old Stockfish-only mode.
- **Coach comments.** Your moves get a short comment with the plan, or the better move after a mistake. Short sounds such as "Hm." appear only for book moves. The face still reacts only to moves that matter.
- **Clearer move explanations.** Development and central pawn moves are explained as a coach would ("Develops the knight to c6", "Takes space in the center").
- **Steadier premoves.** The premove check now runs first, within a time budget (2.5 s, or 1.2 s in bullet), instead of waiting behind the main search. A fast opponent no longer cancels it every move. "Obvious" also accepts the move you would play anyway: best against at least 70% of likely replies, at almost no cost. On Chess.com, your colour is found more reliably.
- **Faster human model.** One Maia-3 run per position is shared by Pro, premoves and bullet, and Pro starts it while Stockfish searches.
- **Shorter, plainer text** in Settings and the mode guides, with larger labels. Settings now have Level, Human & Pro, Bullet, and Premoves & openings sections.

### Fixed

- A new game no longer shows the previous game's last grade.

## 1.8.3 · 2026-11-24

### Changed

- Removed the Live / Analysis tag from the top of the panel.
- The Selected move / All moves switch now spans the full width, like the Engine / Human / Pro switch above it, with centered labels.

## 1.8.2 · 2026-11-24

### Changed

- When a move is not worth a comment, the Coach-mode coach says only a short sound such as "Hm.", "Mm-hm." or "Ah." instead of a sentence. The sound changes with each move, never repeats the previous one, and appears after a short pause. Screen readers skip it.

## 1.8.1 · 2026-11-24

### Added

- Coach mode now shows the coach's reactions too: a small animated portrait with a comment, right under the last move's grade.

### Changed

- The coach reacts only to moves that matter. For your moves, that means brilliant moves, inaccuracies, mistakes, blunders, and best-move streaks of 3, 5, 8, 12 and 20. For your opponent's moves, it means their mistakes and blunders. Ordinary good moves get no reaction.
- Reactions start after a short, slightly random pause (0.6–1.1 s), as if the coach watched the move. They hold for about 4 seconds, then the coach returns to idle. Each move reacts only once. In Coach mode the comment stays visible for the move and its reply.
- Commentator still lists every move in its feed, but its portrait follows the same rules.

## 1.8.0 · 2026-11-24

### Added

- Safe premoves. While your opponent thinks, a green dashed arrow and a panel chip show a premove that Stockfish checked against every legal reply. It must lose less than 4% expected score after each reply where it is legal; illegal premoves are cancelled by the site. **Obvious** (default) allows only recaptures and other captures, checks, promotions and answers to forced replies. **All safe** allows any checked move.
- Human model settings: your level and opponent level (600–2600), player ratings read from Chess.com game pages (converted to the model's Lichess scale), and Pro style (Precise, Balanced, Natural).
- Stockfish depth is a slider from 6 to 30 for the game page and 6 to 24 for practice.
- Maia-3 now receives the opponent's rating separately, and its rating-aware outcome estimate appears in the Human and Pro mode guides.
- Pro warns when the most common human move is a mistake.
- `development/model-bench.cjs` benchmarks prediction accuracy by rating band, Pro trade-offs, outcome calibration and premove safety on real games.

### Changed

- Pro now plays the strongest move a human would really choose. It checks Maia-3's likely moves with Stockfish, even when they are outside the engine's top lines. It keeps moves within the style's tolerance and ranks them by `ln P(human) − loss / λ`. Rows show the evaluation and how often players choose the move.
- The mode explanation is an info icon on the status line. It replaces the "i" segment in the mode switch, and it explains Engine and Human too.

## 1.7.8 · 2026-11-23

- Add Pro analysis, ranking near-equal Stockfish moves by human likelihood.
- Add a reversible Bullet preset for one fast Stockfish line and early board arrows.

## 1.7.7 · 2026-11-23

- Give the streamer, grandmaster and analyst distinct silhouettes and outfits.
- Explain graded moves with position-specific effects, engine replies and better alternatives.

## 1.7.6 · 2026-11-23

- Replace all five Commentator avatars with original illustrated characters and six animated GIF reactions each.
- Celebrate engine-supported sacrifices and identify important pieces lost to a blunder.

## 1.7.5 · 2026-11-23

- Detect Chess.com games at direct `/game/<id>` URLs.

## 1.7.4 · 2026-11-23

- Restore automatic board arrows on supported Chess.com live-game pages.
- Open Studio in move analysis even when the compact panel uses Commentator mode.
- Map evaluation-bar fill to pawn advantage, preserving full endpoints for forced mates.
- Update ONNX Runtime Web to 1.26.0 for its WebAssembly CPU detection fix.

## 1.7.3 · 2026-11-23

### Fixed

- Arrow keys step through a Studio line from anywhere on the page, without clicking first.
- Stepping forward and back keeps working after the panel redraws (the replay position is kept).
- Studio's line view fits the window: the board sizes to the screen height.

## 1.7.2 · 2026-11-23

### Changed

- In the pop-out and pinned panel, your player button is always on the left, and the last-move grade sits below the player buttons.
- The Commentator is now a live feed: the coach stays on screen and only changes expression, and every move (yours and your opponent's) adds a comment in the same style with its grade. Existing comments never redraw, so the panel no longer flickers when moves arrive. New comments arrive after a short pause, and earlier ones collapse behind **Show earlier moves**.
- In Coach mode, **Why <move>? →** opens the line in Studio, so the separate Open Studio button is gone. In Commentator mode Open Studio is a small button at the bottom.
- Studio's line view: a prominent **Back to game** button, large step arrows, and clicking the board plays the next move of the line.

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
