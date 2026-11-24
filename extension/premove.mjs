import { Chess } from "./vendor/chess.mjs";
import { expectedScore } from "./pro-lines.mjs";

// Safe premoves: while the opponent is thinking, find a move for you that is
// still good whatever they play. Sites play a premove only if it is legal after
// the opponent's move and cancel it otherwise, so a premove can fail only when
// it is legal but bad. Every legal reply is therefore checked with Stockfish.
//
//   1. One MultiPV search over all of the opponent's replies gives your best
//      answer to each.
//   2. The candidate is the answer that is best against the most likely
//      replies (opponent probabilities from the human model, else uniform).
//   3. Against every reply after which the candidate is legal, it must lose
//      less than MAX_LOSS expected score versus your best answer there, which
//      is below Lichess's inaccuracy threshold (0.05).
//
// "obvious" mode accepts only the premoves players make every day:
// recaptures and captures, checks, promotions, and answers to forced replies.

export const MAX_LOSS = 0.04;
const MAX_REPLIES = 48;
const MAX_CHECKS = 36;
const MIN_COVERAGE = 0.5;

export const uciOf = (move) => move.from + move.to + (move.promotion || "");

function findMove(board, id) {
  const moves = board.moves({ verbose: true });
  // Sites auto-queen premoved promotions; match from-to and prefer the queen.
  return moves.find(move => move.from + move.to === id.slice(0, 4) && (!move.promotion || move.promotion === "q"));
}

function obvious(move, replyCount) {
  return replyCount <= 3 || Boolean(move.captured) || Boolean(move.promotion) || move.san.includes("+") || move.san.includes("#");
}

/**
 * `board`: chess.js position with the opponent to move.
 * `analyze(board, { depth, count, only, signal })`: Stockfish lines for the side to move.
 * `weights`: Map of reply UCI → probability (optional).
 * Returns null, or { move, san, from, to, replies, checked, cancelled, coverage, worstLoss }.
 */
export async function findSafePremove(board, { analyze, depth = 10, signal, weights, mode = "obvious" } = {}) {
  if (mode === "off" || board.isGameOver()) return null;
  const replies = board.moves({ verbose: true });
  if (!replies.length || replies.length > MAX_REPLIES) return null;
  const lines = await analyze(board, { depth, count: replies.length, signal });
  signal?.throwIfAborted();
  const fen = board.fen();
  const weightOf = (id) => weights?.size ? (weights.get(id) ?? 0) : 1 / replies.length;

  // Your best answer and expected score after each reply.
  const answers = new Map();
  for (const reply of replies) {
    const id = uciOf(reply);
    const after = new Chess(fen);
    after.move(reply);
    if (after.isGameOver()) {
      answers.set(id, { after, ended: true });
      continue;
    }
    const line = lines.find(item => item.pv[0] === id);
    answers.set(id, {
      after,
      best: line ? 1 - expectedScore(line) : null,
      answer: line?.pv[1] || null,
      line,
    });
  }

  // Candidates: answers ranked by the probability of the replies they answer best.
  const votes = new Map();
  // Sites auto-queen premoved promotions, so a promotion candidate is the queen.
  const asPremove = (id) => id.length > 4 ? id.slice(0, 4) + "q" : id;
  for (const [id, info] of answers) {
    if (!info.answer) continue;
    const vote = asPremove(info.answer);
    votes.set(vote, (votes.get(vote) || 0) + weightOf(id));
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1]).slice(0, 2);
  const likeliest = [...answers.keys()].sort((a, b) => weightOf(b) - weightOf(a))[0];

  let checks = 0;
  for (const [candidate] of ranked) {
    const result = await verify(candidate);
    if (result) return result;
  }
  return null;

  async function verify(candidate) {
    // The "obvious" test reads the move as it would be played after the most
    // likely reply (a recapture there may be a quiet move after a rare reply).
    const expected = likeliest && !answers.get(likeliest).ended && findMove(answers.get(likeliest).after, candidate);
    if (!expected) return null;
    if (mode === "obvious" && !obvious(expected, replies.length)) return null;
    let coverage = 0, cancelled = 0, worstLoss = 0, checked = 0;
    for (const [id, info] of answers) {
      if (info.ended) continue;
      const move = findMove(info.after, candidate);
      if (!move) {
        cancelled++;
        continue;
      }
      let loss = 0;
      if (info.answer !== uciOf(move)) {
        if (info.best == null || ++checks > MAX_CHECKS) return null;
        const [line] = await analyze(info.after, { depth, count: 1, only: uciOf(move), signal });
        signal?.throwIfAborted();
        if (!line) return null;
        loss = Math.max(0, info.best - expectedScore(line));
        if (line.type === "mate" && line.value < 0 && !(info.line?.type === "mate")) return null;
      }
      if (loss > MAX_LOSS) return null;
      worstLoss = Math.max(worstLoss, loss);
      checked++;
      if (loss <= 0.01) coverage += weightOf(id);
    }
    const total = [...answers.keys()].reduce((sum, id) => sum + weightOf(id), 0) || 1;
    // It must be playable after the most likely reply and best against most replies.
    if (!checked || coverage / total < MIN_COVERAGE) return null;
    const shown = expected;
    return {
      move: candidate.slice(0, 4) + (shown?.promotion || ""),
      san: shown?.san || candidate,
      from: candidate.slice(0, 2),
      to: candidate.slice(2, 4),
      replies: replies.length,
      checked,
      cancelled,
      coverage: coverage / total,
      worstLoss,
    };
  }
}
