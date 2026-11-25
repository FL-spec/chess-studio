import { Chess } from "./vendor/chess.mjs";
import { expectedScore } from "./pro-lines.mjs";

// Safe premoves: while the opponent is thinking, find a move for you that is
// still good whatever they are likely to play. Sites play a premove only if it
// is legal after the opponent's move and cancel it otherwise, so a premove can
// fail only when it is legal but bad.
//
//   1. The replies that matter: the likely ones (human model, until REPLY_MASS
//      of the probability) plus every capture and check, because forcing moves
//      are where a premove gets punished. One restricted MultiPV search gives
//      your best answer to each.
//   2. Candidates: the answers that are best against the most likely replies,
//      plus your recaptures when the likeliest reply is a capture.
//   3. Against every checked reply after which the candidate is legal, it must
//      lose less than MAX_LOSS expected score versus your best answer there,
//      which is below Lichess's inaccuracy threshold (0.05). All candidates are
//      checked in one restricted search per reply position.
//
// "obvious" mode accepts only the premoves players make every day:
// recaptures and captures, checks, promotions, answers to forced replies, and
// the move you would play anyway (best against 70% of likely replies).

export const MAX_LOSS = 0.04;
// "Obvious" premoves must stay close to best against every checked reply:
// a search a few plies deeper can see more, so the margin is kept wide.
export const OBVIOUS_MAX_LOSS = 0.02;
const MAX_REPLIES = 48;
const MAX_CANDIDATES = 3;
const REPLY_MASS = 0.95;
const REPLY_FLOOR = 0.02;
const MAX_LIKELY = 14;
const MIN_COVERAGE = 0.5;
const NATURAL_COVERAGE = 0.7;
const NEAR_BEST = 0.01;
const FORCED_WEIGHT = 0.75;
const ENGINE_REPLIES = 3;

// A premove is computed only on the opponent's turn and only when your side is
// certain: your account name matches a player, or the board still shows your
// side at the bottom as when the game started. A flipped board or an unknown
// side would otherwise turn the opponent's best move into a "premove".
export function premoveAllowed(view, board) {
  if (!view.playerColor || view.analysis || board.turn() === view.playerColor) return false;
  if (view.playerSource === "account") return true;
  return view.playerSource === "orientation" && view.playerColor === (view.flipped ? "b" : "w");
}
export const uciOf = (move) => move.from + move.to + (move.promotion || "");

function findMove(board, id) {
  const moves = board.moves({ verbose: true });
  // Sites auto-queen premoved promotions; match from-to and prefer the queen.
  return moves.find(move => move.from + move.to === id.slice(0, 4) && (!move.promotion || move.promotion === "q"));
}

const forcing = (move) => Boolean(move.captured) || Boolean(move.promotion) || /[+#]/.test(move.san);
// Sites auto-queen premoved promotions, so a promotion candidate is the queen.
const asPremove = (id) => id.length > 4 ? id.slice(0, 4) + "q" : id;

/** The replies worth checking: likely ones by probability, plus every forcing one. */
export function relevantReplies(replies, weights, always = new Set()) {
  if (!weights?.size) return replies;
  const sorted = [...replies].sort((a, b) => (weights.get(uciOf(b)) ?? 0) - (weights.get(uciOf(a)) ?? 0));
  const total = sorted.reduce((sum, move) => sum + (weights.get(uciOf(move)) ?? 0), 0);
  if (total <= 0) return replies;
  const picked = new Set();
  let mass = 0;
  for (const move of sorted) {
    const weight = (weights.get(uciOf(move)) ?? 0) / total;
    if (picked.size >= MAX_LIKELY || (mass >= REPLY_MASS && weight < REPLY_FLOOR)) break;
    picked.add(move);
    mass += weight;
  }
  for (const move of replies) if (forcing(move) || always.has(uciOf(move))) picked.add(move);
  return replies.filter(move => picked.has(move));
}

/**
 * `board`: chess.js position with the opponent to move.
 * `analyze(board, { depth, count, only, signal })`: Stockfish lines for the side to move;
 * `only` may hold several space-separated UCI moves.
 * `weights`: Map of reply UCI → probability (optional; without it every reply is checked).
 * Returns null, or { fen, move, san, from, to, replies, checked, cancelled, coverage, worstLoss }.
 */
export async function findSafePremove(board, { analyze, depth = 10, signal, weights, mode = "obvious", trace } = {}) {
  if (mode === "off" || board.isGameOver()) return null;
  signal?.throwIfAborted();
  const all = board.moves({ verbose: true });
  if (!all.length) return null;
  // The opponent's best replies by Stockfish are always checked, however
  // unlikely the human model finds them: a strong reply the model misses (for
  // example a king step that attacks the premoved piece) must not slip through.
  // A no-op onProgress keeps this a quick search of its own instead of joining
  // the panel's deeper search of the same position.
  const top = await analyze(board, { depth, count: Math.min(ENGINE_REPLIES, all.length), signal, onProgress: () => {} });
  signal?.throwIfAborted();
  const replies = relevantReplies(all, weights, new Set(top.map(line => line.pv[0])));
  if (replies.length > MAX_REPLIES) return null;
  const fen = board.fen();
  const uniform = !weights?.size;
  const rawWeight = (id) => uniform ? 1 : (weights.get(id) ?? 0);
  const total = replies.reduce((sum, move) => sum + rawWeight(uciOf(move)), 0) || 1;
  // Weights over the checked replies; a checked reply never weighs zero.
  const weightOf = (id) => Math.max(rawWeight(id) / total, 1e-4);

  const lines = await analyze(board, { depth, count: replies.length, only: replies.map(uciOf).join(" "), signal });
  signal?.throwIfAborted();

  // Your best answer and expected score after each checked reply.
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
      bestMate: line?.type === "mate" && line.value < 0,
      answer: line?.pv[1] || null,
    });
  }
  const order = [...answers.keys()].sort((a, b) => weightOf(b) - weightOf(a));
  const likeliest = order[0];
  if (!likeliest || answers.get(likeliest).ended) return null;
  const likelyAfter = answers.get(likeliest).after;

  // Candidates: answers ranked by the probability of the replies they answer best.
  const votes = new Map();
  for (const [id, info] of answers) {
    if (!info.answer) continue;
    const vote = asPremove(info.answer);
    votes.set(vote, (votes.get(vote) || 0) + weightOf(id));
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  // A recapture on the square of the likeliest capture is always worth a check.
  const likelyMove = replies.find(move => uciOf(move) === likeliest);
  if (likelyMove?.captured) {
    for (const move of likelyAfter.moves({ verbose: true }))
      if (move.to === likelyMove.to && !ranked.includes(asPremove(uciOf(move)))) ranked.push(asPremove(uciOf(move)));
  }
  const candidates = ranked.filter(id => findMove(likelyAfter, id)).slice(0, MAX_CANDIDATES + 1);
  trace?.({ replies: replies.map(uciOf), likeliest, candidates, answers: [...answers].map(([id, info]) => [id, info.answer, info.best?.toFixed(3)]) });
  if (!candidates.length) return null;

  // One restricted search per reply position checks every candidate at once.
  const scores = new Map();
  async function scoresAfter(id) {
    if (scores.has(id)) return scores.get(id);
    const info = answers.get(id);
    const legal = candidates.map(candidate => findMove(info.after, candidate)).filter(Boolean)
      .filter(move => uciOf(move) !== info.answer);
    const result = new Map();
    if (legal.length) {
      const checked = await analyze(info.after, { depth, count: legal.length, only: legal.map(uciOf).join(" "), signal });
      signal?.throwIfAborted();
      for (const line of checked) result.set(line.pv[0], line);
    }
    scores.set(id, result);
    return result;
  }

  // Forced replies: the opponent has (almost) one move.
  const forced = replies.length <= 3 || (!uniform && weightOf(likeliest) >= FORCED_WEIGHT);
  for (const candidate of candidates) {
    const result = await verify(candidate);
    if (result) return result;
  }
  return null;

  async function verify(candidate) {
    // The "obvious" test reads the move as it would be played after the most
    // likely reply (a recapture there may be a quiet move after a rare reply).
    const expected = findMove(likelyAfter, candidate);
    if (!expected) return null;
    // Not a capture, check or forced answer: still "obvious" when it is the move
    // you would play anyway (best against most replies, at almost no cost).
    const natural = mode === "obvious" && !forced && !forcing(expected);
    let coverage = 0, cancelled = 0, worstLoss = 0, checked = 0;
    for (const id of order) {
      const info = answers.get(id);
      if (info.ended) continue;
      const move = findMove(info.after, candidate);
      if (!move) {
        cancelled++;
        continue;
      }
      let loss = 0;
      if (info.answer !== uciOf(move)) {
        if (info.best == null) return trace?.({ candidate, reject: "no best", id }), null;
        const line = (await scoresAfter(id)).get(uciOf(move));
        if (!line) return trace?.({ candidate, reject: "no line", id }), null;
        // Walking into a forced mate is never safe unless every answer is mated.
        if (line.type === "mate" && line.value < 0 && !info.bestMate) return null;
        loss = Math.max(0, info.best - expectedScore(line));
      }
      if (loss > (mode === "obvious" ? OBVIOUS_MAX_LOSS : MAX_LOSS)) return trace?.({ candidate, reject: "loss", id, loss }), null;
      worstLoss = Math.max(worstLoss, loss);
      checked++;
      if (loss <= NEAR_BEST) coverage += weightOf(id);
    }
    // It must be playable after the most likely reply and best against most replies.
    trace?.({ candidate, checked, coverage, worstLoss, natural });
    if (!checked || coverage < MIN_COVERAGE) return null;
    if (natural && (coverage < NATURAL_COVERAGE || worstLoss > NEAR_BEST)) return null;
    return {
      fen,
      move: candidate.slice(0, 4) + (expected.promotion || ""),
      san: expected.san,
      from: candidate.slice(0, 2),
      to: candidate.slice(2, 4),
      replies: replies.length,
      legal: all.length,
      checked,
      cancelled,
      coverage,
      worstLoss,
    };
  }
}
