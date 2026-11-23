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
