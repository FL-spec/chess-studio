// Board knowledge for the coach: material exchanges, tactics and positional
// features, read from the position alone (pure, no DOM, no engine).
import { Chess } from "./vendor/chess.mjs";

export const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const FILES = "abcdefgh";
const other = (color) => (color === "w" ? "b" : "w");
const fileOf = (square) => FILES.indexOf(square[0]);
const rankOf = (square) => Number(square[1]);
const at = (file, rank) => (file >= 0 && file < 8 && rank >= 1 && rank <= 8 ? FILES[file] + rank : null);
// Rank counted from the given side (1 = its own back rank).
const relRank = (square, color) => (color === "w" ? rankOf(square) : 9 - rankOf(square));

const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIRS = { b: BISHOP_DIRS, r: ROOK_DIRS, q: [...ROOK_DIRS, ...BISHOP_DIRS] };

const board = (fen) => new Chess(fen, { skipValidation: true });

/**
 * Static exchange evaluation: material `by` wins by capturing on `square`
 * and both sides recapturing with their cheapest piece, each free to stop.
 * Returns 0 when `by` has no capture or the capture does not pay.
 */
export function see(game, square, by) {
  const target = game.get(square);
  if (!target || target.color === by || !game.attackers(square, by).length) return 0;
  const g = board(game.fen());
  const gain = [];
  let onSquare = target;
  let side = by;
  for (let depth = 0; depth < 32; depth += 1) {
    const attackers = g.attackers(square, side)
      .map((from) => ({ from, piece: g.get(from) }))
      .sort((a, b) => VALUE[a.piece.type] - VALUE[b.piece.type]);
    const next = attackers[0];
    if (!next) break;
    // A king may only take when nothing guards the square afterwards.
    if (next.piece.type === "k" && g.attackers(square, other(side)).filter((from) => from !== square).length) break;
    gain[depth] = VALUE[onSquare.type] - (depth ? gain[depth - 1] : 0);
    g.remove(next.from);
    g.remove(square);
    g.put(next.piece, square);
    onSquare = next.piece;
    side = other(side);
  }
  for (let depth = gain.length - 1; depth > 0; depth -= 1) gain[depth - 1] = -Math.max(-gain[depth - 1], gain[depth]);
  return Math.max(0, gain[0] || 0);
}

function pieces(game, color) {
  return game.board().flat().filter((piece) => piece && (!color || piece.color === color));
}

/** Pieces of `color` that the other side can win now, best first: [{ square, type, gain }]. */
export function hanging(game, color) {
  return pieces(game, color)
    .filter((piece) => piece.type !== "k")
    .map((piece) => ({ square: piece.square, type: piece.type, gain: see(game, piece.square, other(color)) }))
    .filter((item) => item.gain > 0)
    .sort((a, b) => b.gain - a.gain);
}

const defended = (game, square, color) => game.attackers(square, color).length > 0;

// The first two pieces along a ray from `square`.
function ray(game, square, [df, dr]) {
  const found = [];
  let file = fileOf(square) + df;
  let rank = rankOf(square) + dr;
  while (at(file, rank) && found.length < 2) {
    const piece = game.get(at(file, rank));
    if (piece) found.push({ ...piece, square: at(file, rank) });
    file += df;
    rank += dr;
  }
  return found;
}

/** A pin or skewer by the slider on `square`, or null. */
function lineTactic(game, square) {
  const slider = game.get(square);
  if (!slider || !DIRS[slider.type]) return null;
  let found = null;
  for (const direction of DIRS[slider.type]) {
    const [front, back] = ray(game, square, direction);
    if (!front || !back || front.color === slider.color || back.color === slider.color) continue;
    // Pin: the front piece shields a more valuable one (it cannot move without loss).
    if (front.type !== "k" && VALUE[back.type] > VALUE[front.type] && front.type !== "p" &&
        (back.type === "k" || VALUE[back.type] > VALUE[slider.type] || !defended(game, back.square, back.color))) {
      const pin = { kind: "pin", front, back };
      if (!found || back.type === "k") found = pin;
    } else if ((front.type === "k" || VALUE[front.type] > VALUE[back.type]) && back.type !== "p" &&
        (VALUE[back.type] > VALUE[slider.type] || !defended(game, back.square, back.color) || front.type === "k")) {
      // Skewer: the front piece must move and leaves the one behind it.
      if (!found || found.kind !== "pin") found = { kind: "skewer", front, back };
    }
  }
  return found;
}

/** Enemy pieces worth forking from `square`: the king, bigger pieces, or loose ones. */
function forkTargets(game, square) {
  const piece = game.get(square);
  if (!piece) return [];
  return pieces(game, other(piece.color))
    .filter((target) => target.type !== "p" && game.attackers(target.square, piece.color).includes(square))
    .filter((target) => target.type === "k" || VALUE[target.type] > VALUE[piece.type] ||
      see(game, target.square, piece.color) > 0)
    .sort((a, b) => VALUE[b.type] - VALUE[a.type]);
}

/** Squares of mover's sliders whose line through `from` now reaches an enemy piece. */
function discovered(before, after, move) {
  const result = [];
  for (const slider of pieces(after, move.color)) {
    if (!DIRS[slider.type] || slider.square === move.to) continue;
    const df = Math.sign(fileOf(move.from) - fileOf(slider.square));
    const dr = Math.sign(rankOf(move.from) - rankOf(slider.square));
    if (!DIRS[slider.type].some(([f, r]) => f === df && r === dr)) continue;
    // `from` must lie exactly on the line.
    const fileGap = fileOf(move.from) - fileOf(slider.square);
    const rankGap = rankOf(move.from) - rankOf(slider.square);
    if (fileGap && rankGap && Math.abs(fileGap) !== Math.abs(rankGap)) continue;
    const [first] = ray(after, slider.square, [df, dr]);
    if (!first || first.color === move.color) continue;
    if (before.attackers(first.square, move.color).includes(slider.square)) continue;
    if (!after.attackers(first.square, move.color).includes(slider.square)) continue;
    result.push({ slider, target: first });
  }
  return result;
}

/** A checkmate the mover would have if it were their turn again, as SAN, or "". */
export function mateThreat(fen) {
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  let game;
  try { game = new Chess(parts.join(" ")); } catch { return ""; }
  if (game.inCheck()) return "";
  for (const move of game.moves({ verbose: true })) {
    if (move.san.endsWith("#")) return move.san;
  }
  return "";
}

const nonPawnMaterial = (game, color) =>
  pieces(game, color).reduce((sum, piece) => sum + (piece.type === "p" || piece.type === "k" ? 0 : VALUE[piece.type]), 0);

/** True when queens are off or little material remains. */
export function isEndgame(game) {
  const queens = pieces(game).filter((piece) => piece.type === "q").length;
  const w = nonPawnMaterial(game, "w");
  const b = nonPawnMaterial(game, "b");
  return (queens === 0 && w + b <= 26) || w + b <= 13;
}

function passed(game, square, color) {
  const file = fileOf(square);
  const step = color === "w" ? 1 : -1;
  for (let rank = rankOf(square) + step; rank >= 1 && rank <= 8; rank += step) {
    for (const f of [file - 1, file, file + 1]) {
      const sq = at(f, rank);
      const piece = sq && game.get(sq);
      if (piece && piece.type === "p" && piece.color !== color) return false;
    }
  }
  return true;
}

function fileState(game, file, color) {
  let own = 0;
  let theirs = 0;
  for (let rank = 1; rank <= 8; rank += 1) {
    const piece = game.get(at(file, rank));
    if (piece?.type === "p") piece.color === color ? (own += 1) : (theirs += 1);
  }
  return own ? "closed" : theirs ? "half-open" : "open";
}

const pieceAt = (game, file, rank) => { const square = at(file, rank); return square ? game.get(square) : null; };
const isPawn = (piece, color) => piece && piece.type === "p" && piece.color === color;

function outpost(game, square, color) {
  const rel = relRank(square, color);
  if (rel < 4 || rel > 6 || fileOf(square) === 0 || fileOf(square) === 7) return false;
  const back = color === "w" ? -1 : 1;
  const guarded = [-1, 1].some((df) => isPawn(pieceAt(game, fileOf(square) + df, rankOf(square) + back), color));
  if (!guarded) return false;
  // No enemy pawn on a neighbouring file can ever attack the square.
  const step = color === "w" ? 1 : -1;
  for (const df of [-1, 1]) {
    for (let rank = rankOf(square) + step; rank >= 1 && rank <= 8; rank += step) {
      if (isPawn(pieceAt(game, fileOf(square) + df, rank), other(color))) return false;
    }
  }
  return true;
}

const list = (items) => items.length > 1 ? items.slice(0, -1).join(", ") + " and " + items.at(-1) : items[0];
const named = (piece) => "the " + NAME[piece.type] + " on " + piece.square;

/**
 * The most important thing a move does, as one plain sentence, or "" when
 * nothing stands out (the caller then describes the move simply).
 * `move` is a chess.js verbose move with `before` and `after`.
 */
export function moveIdea(move) {
  const before = board(move.before);
  const after = board(move.after);
  const mover = move.color;
  const enemy = other(mover);
  const check = after.inCheck();
  const piece = NAME[move.piece];

  // 1. Tactics that hit the king or win material by force.
  const disc = discovered(before, after, move);
  const discCheck = disc.find((item) => item.target.type === "k");
  if (discCheck && check && after.attackers(after.findPiece({ type: "k", color: enemy })[0], mover).includes(move.to))
    return "Double check: the " + piece + " and the " + NAME[discCheck.slider.type] + " both attack the king, so the king must move.";
  if (discCheck)
    return "Discovered check: the " + piece + " steps aside and the " + NAME[discCheck.slider.type] + " on " +
      discCheck.slider.square + " gives check.";

  const safe = see(after, move.to, enemy) === 0;
  const forks = forkTargets(after, move.to);
  if (forks.length >= 2 && safe)
    return "Forks " + named(forks[0]) + " and " + named(forks[1]) + ": the " + piece + " attacks both, and only one can be saved.";

  const line = lineTactic(after, move.to);
  if (line?.kind === "pin" && safe)
    return "Pins " + named(line.front) + " to the " + NAME[line.back.type] + (line.back.type === "k"
      ? ": it cannot move at all." : ": if it moves, the " + NAME[line.back.type] + " falls.");
  if (line?.kind === "skewer" && safe)
    return "Skewers " + named(line.front) + ": when it moves, " + named(line.back) + " is lost.";

  const discAttack = disc.find((item) => VALUE[item.target.type] >= 3 &&
    (VALUE[item.target.type] > VALUE[item.slider.type] || see(after, item.target.square, mover) > 0));
  if (discAttack && (check || safe || VALUE[discAttack.target.type] > VALUE[move.piece]))
    return "Discovered attack: moving the " + piece + " opens the " + NAME[discAttack.slider.type] + "'s line to " +
      named(discAttack.target) + (check ? ", and the move itself gives check." : ".");

  // 2. Captures: winning, trading, or a free piece.
  if (move.captured) {
    const capturedSquare = move.flags.includes("e") ? move.to[0] + move.from[1] : move.to;
    const recapture = see(after, move.to, enemy);
    const taken = VALUE[move.captured];
    const net = taken - recapture;
    const tail = check ? " and gives check." : ".";
    const what = NAME[move.captured] + " on " + capturedSquare;
    if (recapture === 0 && !defended(before, capturedSquare, enemy)) return "Takes the undefended " + what + tail;
    if (recapture === 0) return "Wins the " + what + ": it cannot be taken back safely" + tail;
    if (net === 0 && recapture > 0 && move.piece !== "p")
      return "Trades " + (move.piece === move.captured ? "the " + piece + "s" : "the " + piece + " for the " + NAME[move.captured]) +
        " on " + capturedSquare + tail;
    if (net > 0) return "Wins material: the " + piece + " takes the " + what + tail;
    return "";
  }

  // 3. Threats for the next move.
  if (!check) {
    const mate = mateThreat(move.after);
    if (mate) return "Threatens mate with " + mate + ".";
  }
  const threats = hanging(after, enemy).filter((item) => {
    const wasHanging = hanging(before, enemy).find((old) => old.square === item.square);
    return !wasHanging || wasHanging.gain < item.gain;
  });
  if (threats.length >= 2 && !check)
    return "Creates two threats at once: " + list(threats.slice(0, 2).map((item) => "the " + NAME[item.type] + " on " + item.square)) + " are both loose.";
  if (threats.length && !check && threats[0].gain >= 2)
    return "Threatens to win the " + NAME[threats[0].type] + " on " + threats[0].square + ".";
  return "";
}

/**
 * A positional sentence for a quiet move, or "". Called when the move has no
 * tactic, capture or direct attack worth naming.
 */
export function positionalIdea(move) {
  const before = board(move.before);
  const after = board(move.after);
  const mover = move.color;
  const enemy = other(mover);
  const piece = NAME[move.piece];

  // Saving a piece that was en prise.
  if (move.piece !== "p" && move.piece !== "k" && see(before, move.from, enemy) > 0 && see(after, move.to, enemy) === 0)
    return "Moves the attacked " + piece + " to safety on " + move.to + ".";

  if (move.piece === "p") {
    if (passed(after, move.to, mover)) {
      const rel = relRank(move.to, mover);
      if (rel >= 6) return "Pushes the passed pawn to " + move.to + ". It is close to promoting and ties down the defence.";
      return "Pushes the passed pawn: no enemy pawn can stop it on its way to queen.";
    }
    // Luft: the first escape square for a king boxed in on its back rank.
    const king = after.findPiece({ type: "k", color: mover })[0];
    if (king && relRank(king, mover) === 1 && Math.abs(fileOf(move.from) - fileOf(king)) <= 1 && relRank(move.to, mover) === 3 &&
        relRank(move.from, mover) === 2) {
      const front = [-1, 0, 1].map((df) => at(fileOf(king) + df, rankOf(king) + (mover === "w" ? 1 : -1))).filter(Boolean);
      const boxed = front.every((square) => before.get(square));
      if (boxed) return "Makes luft: the king gets an escape square, so back-rank mates are off the table.";
    }
    // Pawns in front of a castled king.
    if (king && relRank(king, mover) === 1 && (fileOf(king) >= 6 || fileOf(king) <= 1) &&
        Math.abs(fileOf(move.from) - fileOf(king)) <= 1 && !isEndgame(after)) {
      return "Moves a pawn in front of the castled king. That gains space, but it also loosens the king's shelter.";
    }
  }

  if (move.piece === "r") {
    const state = fileState(after, fileOf(move.to), mover);
    if (relRank(move.to, mover) === 7 && (relRank(after.findPiece({ type: "k", color: enemy })[0] || "a1", mover) === 8 ||
        pieces(after, enemy).some((p) => p.type === "p" && relRank(p.square, mover) === 7)))
      return "Puts the rook on the seventh rank, where it attacks pawns and boxes in the king.";
    if (move.from[0] !== move.to[0] && state === "open") return "Takes the open " + move.to[0] + "-file with the rook.";
    if (move.from[0] !== move.to[0] && state === "half-open")
      return "Puts the rook on the half-open " + move.to[0] + "-file, to press the enemy pawn there.";
  }

  if (move.piece === "b" && ["b2", "g2", "b7", "g7"].includes(move.to) && relRank(move.from, mover) === 1)
    return "Fianchettoes the bishop: from " + move.to + " it controls the long diagonal.";

  if ("nb".includes(move.piece) && outpost(after, move.to, mover))
    return "Settles the " + piece + " on an outpost on " + move.to + ": a pawn guards it, and no enemy pawn can chase it away.";

  if (move.piece === "k" && isEndgame(after)) {
    const centre = (square) => Math.max(Math.abs(fileOf(square) - 3.5), Math.abs(rankOf(square) - 4.5));
    if (centre(move.to) < centre(move.from)) return "Brings the king toward the centre. In the endgame the king is a strong piece.";
  }

  // Rooks that see each other on the back rank.
  if (move.piece !== "r") {
    const rooks = after.findPiece({ type: "r", color: mover }).filter((square) => relRank(square, mover) === 1);
    if (rooks.length === 2) {
      const [a, b] = rooks.map(fileOf).sort((x, y) => x - y);
      const between = (game) => Array.from({ length: b - a - 1 }, (_, i) => game.get(at(a + 1 + i, rankOf(rooks[0])))).some(Boolean);
      if (!between(after) && between(before)) return "Connects the rooks, so they defend each other and can use any open file.";
    }
  }
  return "";
}

/** The mover's pieces newly left loose by a move: [{ square, type, gain }]. */
export function leftHanging(move) {
  const before = board(move.before);
  const after = board(move.after);
  const old = new Map(hanging(before, move.color).map((item) => [item.square, item.gain]));
  return hanging(after, move.color).filter((item) => item.square === move.to || (old.get(item.square) || 0) < item.gain);
}

export const pieceName = (type) => NAME[type];
