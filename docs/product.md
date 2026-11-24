# Chess Studio product brief

The core workflow is to open the extension beside a board, confirm that the position and side to move match, then inspect the strongest move, the most likely human move, in separate views. The built-in board adds practice and lets the player replay each line without changing the game on another site.

| User goal | Product behavior |
| --- | --- |
| Trust that the extension follows the right board | The website view names the source and shows the side to move. The adapter checks the visible pieces against a readable position, a replayed move list, or a unique legal transition. Unsupported routes clear stale recommendations. |
| Get the right amount of information quickly | Engine ranks Stockfish candidates. Human ranks predicted moves at the chosen skill level. Both share the same player selector and Studio replay controls. |
| Configure analysis without leaving a game | Settings holds depth, candidate count, skill level and arrow behavior. Reduced-motion preferences disable transitions. |
| Learn from a choice | Explanations describe observable effects on the board. The built-in review workspace lets players replay a candidate, compare it with the played move, or retry the position. |
| Use the tool without a subscription | Stockfish, the human model, practice, and review run locally. All controls are available without an account. |

Remaining opportunities are to validate more signed-in page layouts and game variants, add per-site detection diagnostics, and calibrate the human model on a larger recent holdout by skill band and game phase. Current automatic adapters cover Chess.com standard boards on the listed routes and Lichess Analysis. Paste PGN or FEN for other boards. The human skill scale is a model input and does not certify playing Elo.

## Feature coverage

| Workflow | Chess Studio |
| --- | --- |
| Engine suggestions and strength controls | Local Stockfish MultiPV, depth and candidate count controls, evaluation bar, and forced-move comparison |
| Human-like suggestions | Learned move probabilities and continuations conditioned on skill |
| Board indication | Turn-aware arrows on supported website boards, with expiry and stale-position cleanup |
| Autoplay | Local practice opponent on the built-in board |
| Account and premium modes | All shipped features are available free without an account |
| Neural, style, and fusion modes | Separate Engine and Human views expose search scores and estimated move probabilities. Maia-3 provides rating-conditioned neural predictions. Individual style profiles have not been calibrated. |

Move explanations use observed board changes and legal continuations. The forced-move comparison reports Stockfish search results, which can change with depth. Human continuations are projections from the model.

## Engineering review · 1.4.2

**Position and turn.** The website adapter supplies the position and side to move. Board orientation affects rendering. Account identity, or the training-board orientation fallback, maps colors to players. Selecting a player pins that role within the source tab for the lifetime of the assistant view. When that player moves second, Studio computes replies after the selected first move. Replay uses a private board.

**Engine.** In 1.4.2 a cancellable worker ran Stockfish 19 Lite locally. The website defaults to depth 16 and five MultiPV candidates. Ranking uses Stockfish’s own MultiPV order from a complete search depth. At the time limit, the worker returns the deepest completed set available.

**Human.** The offline policy combines learned move features with opening frequencies by rating band. It ranks legal moves by estimated likelihood. Each continuation takes the model’s most likely next move. The training run held out 300 games and matched 487 of 1,711 sampled moves (28.5%). Log loss was 2.57, versus 3.27 for uniform legal moves. Those figures describe the bundled model on its own holdout. A claim of parity with a Maia-family model would require a shared test set and per-rating results. See [Maia research and implementations](https://www.maiachess.com/).


## Model selection and verification · 1.5.0

**Engine analysis.** The full Stockfish 19 browser build uses the larger evaluation network. Single-threaded WebAssembly works across the extension’s windows without cross-origin isolation. A complete MultiPV iteration determines the displayed order. The built-in evaluation meter consumes Stockfish’s win/draw/loss estimate when available. Those outcomes refer to engine self-play at the evaluated position. [Stockfish release](https://stockfishchess.org/blog/2026/stockfish-19/) · [Browser engine variants](https://github.com/nmrugg/stockfish.js/tree/v19.0.1)

**Human analysis.** The default is the exact ONNX file used by CSSLab’s browser implementation. The extension mirrors Black’s board into the model’s coordinates, supplies the selected skill as both players’ rating, and normalizes the logits over legal moves. Five candidates can each carry a five-ply continuation. Each ply batches the active branches into one inference. Browser workers isolate computation from the board UI. The official browser file’s correspondence to the named research checkpoints is unconfirmed, so this release identifies it by source commit and digest. [Browser implementation](https://github.com/CSSLab/maia-platform-frontend/tree/91516ecb3be4c4f3ef3b0470a78570443ff27eb3) · [Checkpoint provenance discussion](https://github.com/CSSLab/maia3/issues/12)

**Other approaches reviewed.** ChessDS adds time control and game history and targets high-rated and classical games. Carlson’s residual model combines Maia and Stockfish features and studies personalized style. Their published numbers use different populations or candidate sets. Neither was evaluated in the comparison below. [ChessDS](https://github.com/ChessDS/chessds-dsc) · [Residual move model](https://arxiv.org/abs/2606.25176)

**Same-position comparison.** The evaluation used one deterministic position per game from the first 240 qualifying games in the October 2026 Lichess rated standard export. Games needed at least 20 plies and the sampled player needed a recorded rating between 1000 and 2000. Both models received identical positions and mover ratings. The benchmark ran in Chrome with networking disabled after the initial model download. [Lichess public games](https://database.lichess.org/)

| Prediction metric | Lightweight | Maia-3 browser |
| --- | ---: | ---: |
| Actual move ranked first | 76/240 (31.7%) | 129/240 (53.8%) |
| Actual move in first three | 121/240 (50.4%) | 197/240 (82.1%) |
| Mean negative log likelihood, lower is better | 2.58 | 1.43 |

The sample covers a slice of one day of online play. Human clocks, individual style, Chess.com rating calibration, and coaching effectiveness were not measured. To reproduce, pass the decompressed October 2026 PGN to `node development/model-eval.cjs` with `CHESS_TEST_CHROME` set. The same test verifies offline inference, forced mate, five legal engine continuations, and engine outcome totals.

## Human-like coaching · 1.8.0

**Pro.** Pro picks the strongest move a human would really play. Maia-3 lists the moves players at the target rating choose, until it covers 90% of the probability (at most five, each at least 3%). Stockfish searches any of these that are not in its own top lines, at the same depth. Pro keeps moves that lose at most the style's tolerance in expected score: Precise 2%, Balanced 4%, Natural 7%. It then ranks them by `ln P(human) − loss / λ` (λ = 0.01, 0.025, 0.05). This is the closed form of KL-regularised search ([Jacob et al., 2022](https://arxiv.org/abs/2112.07544)). Expected score uses Lichess's win-probability curve. When the most common human move is rejected and at least 20% of players choose it, the panel shows it as a common mistake.

**Safe premoves.** One MultiPV search over all of the opponent's replies (up to 48) gives your best answer to each. The candidate must be best after the likely replies (at least 50% of Maia's opponent probability). After every reply where it is legal, it must lose less than 4% expected score, which is below Lichess's 5% inaccuracy threshold. Sites cancel premoves that are illegal, so those replies are safe. **Obvious** mode also requires a capture, check or promotion, or an opponent with three moves or fewer. Promotions are checked as queens, because sites auto-queen premoves.

**Ratings.** Maia-3 takes separate ratings for the player to move and the opponent. On Chess.com, ratings beside the players are read from the page and converted to Maia's Lichess scale with `0.76 × rating + 635`. This line sits between published blitz and rapid fits; expect about ±70 points of error. Lichess Analysis has no ratings, so it uses the levels in Settings.

### Benchmark

Data: 1,200 positions from 1,546 rated Lichess arena games played on 2026-11-24 (rapid and blitz, ratings 600–2300). Up to three positions per game, from ply 8 on. Stockfish ran at depth 12 and Maia-3 is the browser model. Reproduce with `node development/model-bench.cjs <pgn> 1200 400`. Raw output: `development/model-bench-results.json`.

| Mover rating | n | Maia-3 top-1 | Maia-3 top-3 | Engine top-1 | Pro Balanced top-1 | Pro loss | Maia pick loss | Human loss |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| < 1200 | 54 | 55.6% | 74.1% | 31.5% | 48.1% | 0.4% | 1.6% | 5.4% |
| 1200–1499 | 208 | 44.7% | 75.5% | 33.2% | 46.2% | 0.3% | 2.8% | 5.4% |
| 1500–1799 | 498 | 53.8% | 80.5% | 36.1% | 49.4% | 0.4% | 2.7% | 4.5% |
| 1800–2099 | 380 | 60.3% | 87.1% | 37.9% | 53.7% | 0.3% | 2.4% | 3.8% |
| 2100+ | 60 | 58.3% | 78.3% | 31.7% | 48.3% | 0.2% | 2.1% | 2.9% |
| All | 1200 | 54.6% | 81.3% | 35.8% | 50.1% | 0.4% | 2.6% | 4.4% |

"Loss" is the mean drop in expected score versus Stockfish's best move.

| Pro style | Matches the human move | Mean loss |
| --- | ---: | ---: |
| Precise | 46.8% | 0.2% |
| Balanced (default) | 50.1% | 0.4% |
| Natural | 52.8% | 0.6% |

- **The rating input matters.** Using the player's real rating instead of a fixed 2000 lowers log loss from 1.53 to 1.43. The gain is largest below 1200: 2.14 to 1.78.
- **A separate opponent rating made no measurable difference:** 54.6% vs 54.8% top-1, log loss 1.428 vs 1.430. It stays, because it is free and matches how the model was trained.
- **The lightweight model** matches 26.3% of moves, against 54.6% for Maia-3. It is an offline fallback only.
- **Outcome calibration.** The Brier score (lower is better) for the game result from the player to move is 0.175 for Maia-3's value head and 0.206 for Stockfish through Lichess's curve.
- **Premoves**, over 400 positions with the opponent to move:
  - Obvious mode found a premove in 29 positions; All safe mode found one in 41.
  - After the opponent's real move, 27 of the 29 would have been played and 2 cancelled.
  - 22 of the 27 were Stockfish's best move at depth 16.
  - Mean loss was 0.4%, worst 2.1%, and none was an inaccuracy or worse.
  - The check took 280 ms on average (Apple silicon, headless Chrome).

Limits: one day of Lichess arena games, with few positions below 1200 or above 2100. Chess.com rating conversion and clock pressure were not measured. The premove run used the code from before the promotion fix (promotions now checked as queens).
