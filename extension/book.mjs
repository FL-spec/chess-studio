import { Chess } from "./vendor/chess.mjs";
import openings from "./openings.mjs";

// Opening book: named main lines (for "Book" grades, opening names and the
// repertoire you choose to learn), plus the move statistics in openings.mjs.

export const OPENINGS = [
  // As White
  { id: "italian", name: "Italian Game", side: "w", moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O" },
  { id: "ruy-lopez", name: "Ruy Lopez", side: "w", moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O" },
  { id: "scotch", name: "Scotch Game", side: "w", moves: "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5" },
  { id: "vienna", name: "Vienna Game", side: "w", moves: "e4 e5 Nc3 Nf6 Bc4 Nc6 d3 Bb4 Nf3 d6 O-O" },
  { id: "kings-gambit", name: "King's Gambit", side: "w", moves: "e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5" },
  { id: "london", name: "London System", side: "w", moves: "d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3" },
  { id: "queens-gambit", name: "Queen's Gambit", side: "w", moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6" },
  { id: "english", name: "English Opening", side: "w", moves: "c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7" },
  { id: "catalan", name: "Catalan", side: "w", moves: "d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6" },
  // As Black against 1.e4
  { id: "sicilian-najdorf", name: "Sicilian Najdorf", side: "b", moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6" },
  { id: "sicilian-dragon", name: "Sicilian Dragon", side: "b", moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6" },
  { id: "french", name: "French Defence", side: "b", moves: "e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O" },
  { id: "caro-kann", name: "Caro-Kann Defence", side: "b", moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7" },
  { id: "scandinavian", name: "Scandinavian Defence", side: "b", moves: "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5" },
  { id: "italian-black", name: "Open Game (1…e5)", side: "b", moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O" },
  { id: "petroff", name: "Petrov Defence", side: "b", moves: "e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6 O-O Be7" },
  { id: "pirc", name: "Pirc Defence", side: "b", moves: "e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6" },
  // As Black against 1.d4 and others
  { id: "qgd", name: "Queen's Gambit Declined", side: "b", moves: "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6" },
  { id: "slav", name: "Slav Defence", side: "b", moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4" },
  { id: "kings-indian", name: "King's Indian Defence", side: "b", moves: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6" },
  { id: "nimzo-indian", name: "Nimzo-Indian Defence", side: "b", moves: "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6" },
  { id: "grunfeld", name: "Grünfeld Defence", side: "b", moves: "d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5" },
  { id: "dutch", name: "Dutch Defence", side: "b", moves: "d4 f5 g3 Nf6 Bg2 e6 Nf3 Be7 O-O O-O c4 d6" },
  { id: "london-black", name: "Against the London", side: "b", moves: "d4 d5 Bf4 c5 e3 Nc6 c3 Qb6 Qb3 c4 Qc2 Bf5" },
  // More main lines, so Book grades follow common theory further.
  { id: "caro-advance", name: "Caro-Kann Advance", side: "b", moves: "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Nd7 O-O Ne7" },
  { id: "french-advance", name: "French Advance", side: "b", moves: "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4" },
  { id: "sicilian-alapin", name: "Sicilian Alapin", side: "b", moves: "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6" },
  { id: "sicilian-open-nc6", name: "Open Sicilian (2…Nc6)", side: "b", moves: "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6" },
  { id: "two-knights", name: "Two Knights Defence", side: "b", moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6" },
  { id: "berlin", name: "Ruy Lopez, Berlin", side: "b", moves: "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5" },
  { id: "qga", name: "Queen's Gambit Accepted", side: "b", moves: "d4 d5 c4 dxc4 e3 Nf6 Bxc4 e6 Nf3 c5 O-O a6" },
  { id: "kid-london", name: "King's Indian vs London", side: "b", moves: "d4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3 c5" },
  { id: "jobava", name: "Jobava London", side: "w", moves: "d4 d5 Nc3 Nf6 Bf4 e6 e3 Bd6 Nb5 Bb4+ c3 Ba5" },
  { id: "scotch-gambit", name: "Scotch Gambit", side: "w", moves: "e4 e5 Nf3 Nc6 d4 exd4 Bc4 Nf6 e5 d5 Bb5 Ne4" },
];

const key = (fen) => fen.split(" ").slice(0, 4).join(" ");

// position key → [{ san, uci, opening }] from the named lines.
const BOOK = new Map();
for (const opening of OPENINGS) {
  const game = new Chess();
  for (const san of opening.moves.split(" ")) {
    const before = key(game.fen());
    const move = game.move(san);
    const list = BOOK.get(before) || [];
    if (!list.some((item) => item.san === move.san && item.opening.id === opening.id))
      list.push({ san: move.san, uci: move.from + move.to + (move.promotion || ""), opening });
    BOOK.set(before, list);
  }
}

// Popular moves from the statistics: played by at least 8% of players,
// in positions with at least 30 games.
function popular(fen, san) {
  const buckets = openings[key(fen)];
  if (!buckets) return false;
  const counts = {};
  for (const bucket of buckets) for (const [move, count] of Object.entries(bucket)) counts[move] = (counts[move] || 0) + count;
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return total >= 30 && (counts[san] || 0) / total >= 0.08;
}

// Family names for the early positions where several lines share moves.
const FAMILIES = {
  "e4": "King's Pawn Opening", "e4 e5": "Open Game", "e4 e5 Nf3": "King's Knight Opening",
  "e4 e5 Nf3 Nc6": "Open Game", "e4 c5": "Sicilian Defence", "e4 c5 Nf3": "Sicilian Defence",
  "e4 c5 Nf3 d6": "Sicilian Defence", "e4 c5 Nf3 d6 d4": "Open Sicilian", "e4 c5 Nf3 d6 d4 cxd4": "Open Sicilian",
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4": "Open Sicilian", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6": "Open Sicilian",
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3": "Open Sicilian",
  "d4": "Queen's Pawn Opening", "d4 d5": "Queen's Pawn Game", "d4 d5 c4": "Queen's Gambit",
  "d4 Nf6": "Indian Defence", "d4 Nf6 c4": "Indian Defence", "d4 Nf6 c4 g6": "King's Indian Defence",
  "d4 Nf6 c4 g6 Nc3": "Indian Defence", "d4 Nf6 c4 e6": "Indian Defence", "d4 d5 c4 e6": "Queen's Gambit Declined",
  "d4 d5 c4 e6 Nc3": "Queen's Gambit Declined", "d4 d5 c4 e6 Nc3 Nf6": "Queen's Gambit Declined",
  "d4 d5 Bf4": "London System", "c4": "English Opening",
};
const NAMES = new Map();
{
  const family = new Map();
  for (const [moves, name] of Object.entries(FAMILIES)) {
    const game = new Chess();
    for (const san of moves.split(" ")) game.move(san);
    family.set(key(game.fen()), name);
  }
  for (const opening of OPENINGS) {
    const game = new Chess();
    for (const san of opening.moves.split(" ")) {
      game.move(san);
      const at = key(game.fen());
      if (family.has(at)) NAMES.set(at, family.get(at));
      else if (!NAMES.has(at)) NAMES.set(at, opening.name);
    }
  }
}

/** Name of the opening that reaches this position, if it is in the book. */
export function openingName(fen) {
  return NAMES.get(key(fen)) || null;
}

/** The opening a move belongs to, or null when the move is not a book move. */
export function bookMove(beforeFen, san) {
  const game = new Chess(beforeFen);
  let after;
  try { after = game.move(san).after; } catch { return null; }
  const named = BOOK.get(key(beforeFen))?.some((item) => item.san === san);
  if (named || popular(beforeFen, san))
    return { name: openingName(after) || openingName(beforeFen) || "Opening theory" };
  return null;
}

/**
 * The repertoire move for the side to move, from the openings you chose
 * (ids by side: { w: "italian", b: ["sicilian-najdorf", "qgd"] }), or null.
 */
export function repertoireMove(fen, chosen) {
  const turn = fen.split(" ")[1];
  const ids = [].concat(chosen?.[turn] || []).filter(Boolean);
  if (!ids.length) return null;
  const options = BOOK.get(key(fen)) || [];
  const found = options.find((item) => ids.includes(item.opening.id) && item.opening.side === turn);
  return found ? { san: found.san, uci: found.uci, name: found.opening.name } : null;
}
