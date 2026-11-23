import { Chess } from "./vendor/chess.mjs";
import { installMaia, modelUrl } from "./maia-model.mjs";

let worker;
let serial = 0;
const pending = new Map();
function inference(tokens, ratings) {
  if (!worker) {
    worker = new Worker("./maia-worker.js");
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(Error(data.error));
      else job.resolve(data.logits);
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
    worker.postMessage({ id, url: modelUrl, tokens, ratings }, [tokens.buffer, ratings.buffer]);
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
export async function maiaRanks(boards, ratings) {
  await installMaia();
  const tokens = new Float32Array(boards.length * 64 * 12);
  for (const [i, board] of boards.entries()) {
    const black = board.turn() === "b";
    for (const row of board.board()) for (const piece of row) {
      if (!piece) continue;
      const channel = "pnbrqk".indexOf(piece.type) + (piece.color === board.turn() ? 0 : 6);
      tokens[(i * 64 + squareIndex(piece.square, black)) * 12 + channel] = 1;
    }
  }
  const logits = await inference(tokens, Float32Array.from(ratings));
  if (logits.length !== boards.length * 4352) throw Error("Unexpected Maia policy shape.");
  return boards.map((board, i) => {
    const choices = board.moves({ verbose: true }).map(move => ({
      move, logit: logits[i * 4352 + moveIndex(move, board.turn() === "b")],
    })).sort((a, b) => b.logit - a.logit);
    const mass = choices.map(row => Math.exp(row.logit - choices[0].logit));
    const total = mass.reduce((a, b) => a + b, 0);
    return choices.map(({ move }, j) => ({ move, probability: mass[j] / total }));
  });
}
// Maia inference is deterministic, so finished lines are cached per position.
const lineCache = new Map();
const copyLines = rows => rows.map(row => ({ ...row, line: [...row.line] }));
// `plies` is the length of each predicted line (move + replies). Shorter lines
// need fewer model runs, so the panel uses 2 and Studio replays use 5.
export async function maiaLines(fen, elo, count, signal, plies = 5) {
  signal?.throwIfAborted();
  const key = fen + "|" + elo + "|" + count + "|" + plies;
  const hit = lineCache.get(key);
  if (hit) {
    lineCache.delete(key);
    lineCache.set(key, hit);
    return copyLines(hit);
  }
  const result = await computeLines(fen, elo, count, signal, plies);
  lineCache.set(key, result);
  if (lineCache.size > 32) lineCache.delete(lineCache.keys().next().value);
  return copyLines(result);
}
async function computeLines(fen, elo, count, signal, plies) {
  const [ranked] = await maiaRanks([new Chess(fen)], [elo]);
  const lines = ranked.slice(0, count).map(({ move, probability }) => ({
    san: move.san, probability, line: [move.san], board: new Chess(move.after),
  }));
  for (let ply = 1; ply < plies; ply++) {
    signal?.throwIfAborted();
    const live = lines.filter(item => !item.board.isGameOver());
    if (!live.length) break;
    const continuations = await maiaRanks(live.map(item => item.board), live.map(() => elo));
    live.forEach((item, i) => item.line.push(item.board.move(continuations[i][0].move.san).san));
  }
  return lines.map(({ board, ...row }) => row);
}
