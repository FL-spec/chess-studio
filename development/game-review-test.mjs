// Game review analysis (extension/game-analysis.mjs) with a deterministic fake engine.
import assert from "node:assert/strict";
import {
  analysePositions, boardAt, gradeGame, inferReason, packLines, parseGame, resultText, summarise, unpackLines, whiteEval,
} from "../extension/game-analysis.mjs";

const cp = (value, ...pv) => ({ type: "cp", value, pv });
// Lines keyed by the SAN history, so the fake also proves the board carries it.
const LINES = {
  "": [cp(30, "e2e4"), cp(20, "d2d4")],
  "e4": [cp(-30, "e7e5"), cp(-40, "c7c5")],
  "e4 e5": [cp(30, "g1f3"), cp(20, "b1c3")],
  "e4 e5 Qh5": [cp(0, "b8c6"), cp(-10, "g7g6")],
  "e4 e5 Qh5 Nc6": [cp(30, "f1c4"), cp(10, "d2d3")],
  "e4 e5 Qh5 Nc6 Bc4": [cp(-50, "d8e7"), cp(-60, "g7g6")],
  "e4 e5 Qh5 Nc6 Bc4 Nf6": [cp(600, "h5f7"), cp(100, "d2d3")],
  "e4 e5 Qh5 Nc6 Bc4 Nf6 d3": [cp(-150, "g7g6"), cp(-200, "d7d6")],
};
const calls = [];
async function fakeAnalyze(board, options) {
  assert.equal(options.count, 2);
  if (board.isGameOver()) return [];
  const key = board.history().join(" ");
  calls.push(key);
  if (LINES[key]) return LINES[key];
  const move = board.moves({ verbose: true })[0];
  return [cp(25 * (board.turn() === "w" ? 1 : -1), move.from + move.to + (move.promotion || ""))];
}

async function review(pgn, playerColor = null) {
  const { start, moves } = parseGame(pgn);
  const progress = [];
  const lines = await analysePositions({ start, moves, analyze: fakeAnalyze, onPosition: (index) => progress.push(index) });
  assert.deepEqual(progress, moves.map((_, index) => index).concat(moves.length));
  return { start, moves, lines, graded: gradeGame({ start, moves, lines, playerColor }) };
}

// Grades, book, blunder and Miss.
{
  const { graded } = await review("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. d3 *", "w");
  assert.equal(graded.length, 7);
  assert.equal(graded[0].grade.key, "book", "1. e4 is book");
  assert.ok(graded[0].grade.opening);
  assert.equal(graded[5].move.san, "Nf6");
  assert.equal(graded[5].grade.key, "blunder");
  assert.equal(graded[5].best, "d8e7");
  assert.equal(graded[6].move.san, "d3");
  assert.equal(graded[6].grade.key, "miss", "missing the punishment of a blunder is a Miss");
  assert.equal(graded[6].mine, true);
  assert.equal(graded[5].mine, false);
  assert.ok(graded[6].commentary.reason.length > 0);
  const summary = summarise(graded);
  assert.equal(summary.b.counts.blunder, 1);
  assert.equal(summary.w.counts.miss, 1);
  assert.ok(summary.w.accuracy > 0 && summary.w.accuracy < 100);
  assert.ok(summary.b.accuracy < summary.w.accuracy + 50);
}

// Checkmate: the final position is never searched and counts as a win.
{
  calls.length = 0;
  const { start, moves, lines, graded } = await review("1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0");
  assert.equal(calls.includes("e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#"), false);
  assert.deepEqual(lines[7], []);
  assert.equal(graded.at(-1).afterCp, 10000);
  assert.equal(graded.at(-1).grade.tone, "best");
  assert.equal(whiteEval(start, moves, lines, 7), 10000);
  assert.equal(inferReason(start, moves), "checkmate");
  assert.equal(resultText("1-0", "checkmate", "w"), "You won by checkmate");
  assert.equal(resultText("1-0", "checkmate", "b"), "You lost by checkmate");
  assert.equal(resultText("1/2-1/2", "repetition"), "Draw by repetition");
  assert.equal(resultText("0-1", "resignation"), "Black won by resignation");
}

// Threefold repetition: the repeated position is a draw (0), not the engine's +30.
{
  calls.length = 0;
  const { start, moves, lines, graded } = await review("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2");
  assert.equal(moves.length, 8);
  assert.ok(boardAt(start, moves, 8).isThreefoldRepetition());
  assert.equal(calls.length, 8, "positions 0..7 searched, the repeated one is not");
  assert.equal(calls[4], "Nf3 Nf6 Ng1 Ng8", "searches receive the move history");
  assert.equal(whiteEval(start, moves, lines, 0), 30);
  assert.equal(whiteEval(start, moves, lines, 8), 0);
  assert.equal(graded.at(-1).afterCp, 0);
  assert.equal(inferReason(start, moves), "repetition");
}

// Accuracy: only best moves gives ~100%; cached lines skip searches.
{
  calls.length = 0;
  const { start, moves } = parseGame("1. e4 e5 2. Nf3 *");
  const first = await analysePositions({ start, moves, analyze: fakeAnalyze });
  const packed = first.map(packLines);
  calls.length = 0;
  const again = await analysePositions({ start, moves, analyze: fakeAnalyze, known: packed.map(unpackLines) });
  assert.equal(calls.length, 0);
  const summary = summarise(gradeGame({ start, moves, lines: again }));
  assert.ok(summary.w.accuracy > 98 && summary.b.accuracy > 99.9);
  assert.equal(summary.w.moves, 2);
}

// Cancel.
{
  const controller = new AbortController();
  controller.abort();
  const { start, moves } = parseGame("1. e4 *");
  await assert.rejects(analysePositions({ start, moves, analyze: fakeAnalyze, signal: controller.signal }), /Cancelled/);
}
console.log("game review tests passed");
