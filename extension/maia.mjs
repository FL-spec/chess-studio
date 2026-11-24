import { Chess } from "./vendor/chess.mjs";
import { installMaia, modelUrl } from "./maia-model.mjs";

let worker;
let serial = 0;
const pending = new Map();
function inference(tokens, ratings, opponents) {
  if (!worker) {
    worker = new Worker("./maia-worker.js");
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(Error(data.error));
      else job.resolve(data);
    };
    worker.onerror = event => {
      for (const job of pending.values()) job.reject(Error(event.message));
      pending.clear();
      worker.terminate();
      worker = null;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, url: modelUrl, tokens, ratings, opponents }, [tokens.buffer, ratings.buffer, opponents.buffer]);
  });
}
function squareIndex(square, black) {
  const rank = Number(square[1]);
  return (black ? 8 - rank : rank - 1) * 8 + square.charCodeAt(0) - 97;
}
export function moveIndex(move, black) {
  const from = squareIndex(move.from, black);
  const to = squareIndex(move.to, black);
  return move.promotion
    ? 4096 + ((from % 8) * 8 + to % 8) * 4 + "qrbn".indexOf(move.promotion)
    : from * 64 + to;
}
function encode(boards) {
  const tokens = new Float32Array(boards.length * 64 * 12);
  for (const [i, board] of boards.entries()) {
    const black = board.turn() === "b";
    for (const row of board.board()) for (const piece of row) {
      if (!piece) continue;
      const channel = "pnbrqk".indexOf(piece.type) + (piece.color === board.turn() ? 0 : 6);
      tokens[(i * 64 + squareIndex(piece.square, black)) * 12 + channel] = 1;
    }
  }
  return tokens;
}
// Value logits are ordered loss, draw, win for the player to move (verified
// against decisive positions in development/bench-engine.cjs).
function outcome(values, i, width) {
  if (!values || width !== 3) return null;
  const row = Array.from(values.slice(i * 3, i * 3 + 3));
  const top = Math.max(...row);
  const mass = row.map(value => Math.exp(value - top));
  const total = mass.reduce((a, b) => a + b, 0);
  const [loss, draw, win] = mass.map(value => value / total);
  return { win, draw, loss, score: win + draw / 2 };
}
/**
 * Maia-3 predictions for each board. `ratings` is the rating of the player to
 * move, `opponents` the other player's (defaults to the same rating).
 * Returns `{ ranks, outcome }`: legal moves by probability, and the model's
 * estimate of the game result for the player to move (null if unavailable).
 */
export async function maiaPredict(boards, ratings, opponents = ratings) {
  await installMaia();
  const { logits, value } = await inference(encode(boards), Float32Array.from(ratings), Float32Array.from(opponents));
  if (logits.length !== boards.length * 4352) throw Error("Unexpected Maia policy shape.");
  const width = value ? value.length / boards.length : 0;
  return boards.map((board, i) => {
    const choices = board.moves({ verbose: true }).map(move => ({
      move, logit: logits[i * 4352 + moveIndex(move, board.turn() === "b")],
    })).sort((a, b) => b.logit - a.logit);
    const mass = choices.map(row => Math.exp(row.logit - choices[0].logit));
    const total = mass.reduce((a, b) => a + b, 0);
    return {
      ranks: choices.map(({ move }, j) => ({ move, probability: mass[j] / total })),
      outcome: outcome(value, i, width),
      valueWidth: width,
    };
  });
}
export async function maiaRanks(boards, ratings, opponents = ratings) {
  return (await maiaPredict(boards, ratings, opponents)).map(row => row.ranks);
}
// Maia inference is deterministic, so finished lines are cached per position.
const lineCache = new Map();
const copyLines = rows => rows.map(row => ({ ...row, line: [...row.line] }));
// `plies` is the length of each predicted line (move + replies). Shorter lines
// need fewer model runs, so the panel uses 2 and Studio replays use 5.
// `elo` is the rating of the player to move, `opponent` the other player's;
// the ratings alternate along the line.
export async function maiaLines(fen, elo, count, signal, plies = 5, opponent = elo) {
  signal?.throwIfAborted();
  const key = fen + "|" + elo + "|" + opponent + "|" + count + "|" + plies;
  const hit = lineCache.get(key);
  if (hit) {
    lineCache.delete(key);
    lineCache.set(key, hit);
    return copyLines(hit);
  }
  const result = await computeLines(fen, elo, opponent, count, signal, plies);
  lineCache.set(key, result);
  if (lineCache.size > 32) lineCache.delete(lineCache.keys().next().value);
  return copyLines(result);
}
async function computeLines(fen, elo, opponent, count, signal, plies) {
  const [ranked] = await maiaRanks([new Chess(fen)], [elo], [opponent]);
  const lines = ranked.slice(0, count).map(({ move, probability }) => ({
    san: move.san, probability, line: [move.san], board: new Chess(move.after),
  }));
  for (let ply = 1; ply < plies; ply++) {
    signal?.throwIfAborted();
    const live = lines.filter(item => !item.board.isGameOver());
    if (!live.length) break;
    const [self, other] = ply % 2 ? [opponent, elo] : [elo, opponent];
    const continuations = await maiaRanks(live.map(item => item.board), live.map(() => self), live.map(() => other));
    live.forEach((item, i) => item.line.push(item.board.move(continuations[i][0].move.san).san));
  }
  return lines.map(({ board, ...row }) => row);
}
