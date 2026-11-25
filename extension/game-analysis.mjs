// Post-game review analysis (pure logic, no DOM). Replays a PGN, analyses
// every position with its full move history (so the engine sees repetitions),
// and grades each move the same way the live coach does (companion.mjs).
// `analyze` is injected so this runs in Node tests with a fake engine.

import { Chess } from "./vendor/chess.mjs";
import {
  GRADES, gameAccuracy, gradeMove, gradedTactic, refineGrade, toCentipawns,
} from "./gamify.mjs";
import { bookMove, trapAfter } from "./book.mjs";
import { moveCommentary } from "./analysis-evidence.mjs";

export const REVIEW_DEPTH = 14;
const MATE_CP = 10000;
const uciOf = (move) => move.from + move.to + (move.promotion || "");

/** Parse a PGN into { start, moves, headers }. Throws on an illegal PGN. */
export function parseGame(pgn, start) {
  const game = new Chess(start || undefined);
  game.loadPgn(String(pgn || "").trim());
  const headers = game.getHeaders ? game.getHeaders() : game.header();
  const history = game.history({ verbose: true });
  const startFen = history[0]?.before || game.fen();
  const moves = history.map((move) => ({
    san: move.san, color: move.color, from: move.from, to: move.to,
    promotion: move.promotion, captured: move.captured, before: move.before, after: move.after,
  }));
  return { start: startFen, moves, headers };
}

/** The board after `count` moves, built by replay so it carries the move history. */
export function boardAt(start, moves, count) {
  const board = new Chess(start);
  for (const move of moves.slice(0, count)) board.move({ from: move.from, to: move.to, promotion: move.promotion });
  return board;
}

// Engine lines stored compactly: { t: "cp"|"mate", v, p: "e2e4 e7e5 …" }.
export function packLines(lines) {
  return (lines || []).slice(0, 2).map((line) => ({ t: line.type, v: line.value, p: (line.pv || []).slice(0, 6).join(" ") }));
}
export function unpackLines(packed) {
  return (packed || []).map((line) => ({ type: line.t, value: line.v, pv: line.p ? line.p.split(" ") : [] }));
}

/**
 * Analyse each position 0..n in order. `onPosition(index, lines)` fires as
 * each finishes. `known[index]` (engine lines) skips a search. Resolves with
 * the array of lines per position ([] for terminal positions).
 */
export async function analysePositions({ start, moves, analyze, depth = REVIEW_DEPTH, signal, known = [], onPosition }) {
  const results = [];
  for (let index = 0; index <= moves.length; index += 1) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    let lines = known[index];
    if (!lines) {
      const board = boardAt(start, moves, index);
      lines = board.isGameOver() ? [] : await analyze(board, { depth, count: 2, signal });
    }
    results[index] = lines || [];
    onPosition?.(index, results[index]);
  }
  return results;
}

/** Evaluation of position `index` in centipawns from White's side, or null when unknown. */
export function whiteEval(start, moves, lines, index) {
  const board = boardAt(start, moves, index);
  if (board.isCheckmate()) return board.turn() === "w" ? -MATE_CP : MATE_CP;
  if (board.isGameOver()) return 0;
  const best = lines[index]?.[0];
  if (!best) return null;
  const cp = toCentipawns(best);
  return board.turn() === "w" ? cp : -cp;
}

/**
 * Grade move `index` (0-based; it leads from position index to index + 1).
 * Needs lines for both positions. `previous` is the graded move before it.
 * Returns null while the engine lines are missing.
 */
export function gradeReviewMove({ start, moves, lines, index, previous, playerColor = null }) {
  const move = moves[index];
  const best = lines[index]?.[0];
  const second = lines[index]?.[1];
  const afterBoard = boardAt(start, moves, index + 1);
  const terminal = afterBoard.isGameOver();
  if (!best?.pv?.length || (!terminal && !lines[index + 1])) return null;
  const reply = lines[index + 1]?.[0];
  const wasBest = best.pv[0] === uciOf(move);
  const beforeCp = toCentipawns(best);
  const afterCp = afterBoard.isCheckmate() ? MATE_CP : terminal ? 0 : -toCentipawns(reply);
  let grade = gradedTactic(gradeMove(beforeCp, afterCp, wasBest), move, reply, beforeCp, afterCp, wasBest);
  const opponentErred = Boolean(previous && previous.move.color !== move.color &&
    (previous.grade.key === "mistake" || previous.grade.key === "blunder"));
  if (grade.key !== "brilliant") grade = refineGrade(grade, {
    beforeCp, opponentErred,
    secondCp: second?.pv?.length ? toCentipawns(second) : null,
  });
  const ply = index + 1;
  const book = ply <= 30 && grade.tone !== "bad" ? bookMove(move.before, move.san) : null;
  if (book) grade = { ...GRADES.book, key: "book", loss: grade.loss, opening: book.name };
  const mine = playerColor ? move.color === playerColor : true;
  const entry = {
    grade, move, mine, ply, wasBest, beforeCp, afterCp,
    best: best.pv[0], bestLine: best.pv.slice(0, 6),
    commentary: moveCommentary(move, grade, best, reply),
  };
  const trap = trapAfter(move.after);
  if (trap) entry.trap = { name: trap.name, idea: trap.idea, punish: trap.punish, victimIsMe: trap.victim === (playerColor || move.color) };
  if (book) entry.openingIntro = previous?.grade.opening !== book.name;
  else if (previous?.grade.key === "book" && mine) entry.leftBook = true;
  return entry;
}

/** Grade every move whose positions are analysed, in order; stops at the first gap. */
export function gradeGame({ start, moves, lines, playerColor = null }) {
  const graded = [];
  for (let index = 0; index < moves.length; index += 1) {
    const entry = gradeReviewMove({ start, moves, lines, index, previous: graded[index - 1], playerColor });
    if (!entry) break;
    graded.push(entry);
  }
  return graded;
}

export const SUMMARY_KEYS = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"];

/** Accuracy and grade counts per side: { w: { accuracy, counts }, b: {…} }. */
export function summarise(graded) {
  const side = (color) => {
    const grades = graded.filter((entry) => entry.move.color === color).map((entry) => entry.grade);
    const counts = Object.fromEntries(SUMMARY_KEYS.map((key) => [key, grades.filter((grade) => grade.key === key).length]));
    return { accuracy: gameAccuracy(grades), counts, moves: grades.length };
  };
  return { w: side("w"), b: side("b") };
}

/** The result in plain words, from the player's side when known. */
export function resultText(result, reason = "", playerColor = null) {
  const why = {
    checkmate: "checkmate", resignation: "resignation", time: "time", timeout: "time",
    repetition: "repetition", stalemate: "stalemate", agreement: "agreement",
    insufficient: "insufficient material", "50-move": "the 50-move rule", abandoned: "abandonment",
  }[String(reason).toLowerCase()] || "";
  const by = why ? " by " + why : "";
  if (result === "1/2-1/2") return "Draw" + by;
  if (result !== "1-0" && result !== "0-1") return "Game not finished";
  const winner = result === "1-0" ? "w" : "b";
  if (playerColor) return (winner === playerColor ? "You won" : "You lost") + by;
  return (winner === "w" ? "White" : "Black") + " won" + by;
}

/** The game-ending reason from the final position when the record has none. */
export function inferReason(start, moves) {
  const board = boardAt(start, moves, moves.length);
  if (board.isCheckmate()) return "checkmate";
  if (board.isStalemate()) return "stalemate";
  if (board.isThreefoldRepetition()) return "repetition";
  if (board.isInsufficientMaterial()) return "insufficient";
  if (board.isDraw()) return "50-move";
  return "";
}
