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
  { id: "london-black", name: "London System with …c5", side: "b", moves: "d4 d5 Bf4 c5 e3 Nc6 c3 Qb6 Qb3 c4 Qc2 Bf5" },
  // More main lines, so Book grades follow common theory further.
  { id: "caro-advance", name: "Caro-Kann Advance", side: "b", moves: "e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Nd7 O-O Ne7" },
  { id: "french-advance", name: "French Advance", side: "b", moves: "e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4" },
  { id: "sicilian-alapin", name: "Sicilian Alapin", side: "b", moves: "e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6" },
  { id: "sicilian-open-nc6", name: "Open Sicilian (2…Nc6)", side: "b", moves: "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6" },
  { id: "two-knights", name: "Two Knights Defence", side: "b", moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6" },
  { id: "berlin", name: "Ruy Lopez, Berlin", side: "b", moves: "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5" },
  { id: "qga", name: "Queen's Gambit Accepted", side: "b", moves: "d4 d5 c4 dxc4 e3 Nf6 Bxc4 e6 Nf3 c5 O-O a6" },
  { id: "kid-london", name: "London vs King's Indian setup", side: "b", moves: "d4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3 c5" },
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
  "e4 c5 Nf3 Nc6": "Sicilian Defence", "e4 c5 Nf3 Nc6 d4": "Open Sicilian", "e4 c5 Nf3 Nc6 d4 cxd4": "Open Sicilian",
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4": "Open Sicilian", "e4 c5 c3": "Sicilian Alapin", "e4 e5 Nf3 Nc6 Bc4": "Italian Game",
  "e4 e5 Nf3 Nc6 Bc4 Nf6": "Two Knights Defence", "e4 e5 Nf3 Nc6 Bb5": "Ruy Lopez", "e4 e5 Nf3 Nc6 Bb5 Nf6": "Ruy Lopez, Berlin",
  "e4 e5 Nf3 Nc6 d4": "Scotch Game", "e4 e5 Nf3 Nc6 d4 exd4": "Scotch Game",
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

// The main idea of each opening, in one plain sentence, for the coach.
const IDEAS = {
  "King's Pawn Opening": "1.e4 takes the center and opens lines for the queen and the bishop.",
  "Queen's Pawn Opening": "1.d4 takes the center with a pawn the queen already protects.",
  "Open Game": "Both sides claim the center with a pawn on e4 and e5.",
  "King's Knight Opening": "The knight develops and attacks the e5 pawn at once.",
  "Queen's Pawn Game": "Both sides hold the center with pawns on d4 and d5.",
  "Queen's Gambit": "White offers the c-pawn to pull Black's d-pawn away from the center.",
  "Queen's Gambit Declined": "Black keeps a solid pawn on d5 and develops calmly behind it.",
  "Queen's Gambit Accepted": "Black takes the pawn, then gives it back to develop freely.",
  "Indian Defence": "Black develops the knight first and keeps the pawns flexible.",
  "King's Indian Defence": "Black lets White build a big center, then hits it with …e5 or …c5.",
  "Nimzo-Indian Defence": "The bishop pins the c3 knight to stop White from playing e4.",
  "Grünfeld Defence": "Black gives White the center, then attacks it with pieces and …c5.",
  "Slav Defence": "Black supports d5 with the c-pawn and keeps the light bishop free.",
  "Catalan": "White puts the bishop on g2 to press on the long diagonal.",
  "Dutch Defence": "Black fights for e4 with the f-pawn and often attacks on the kingside.",
  "London System": "White sets up d4, Bf4 and e3: a solid plan against almost anything.",
  "London System with …c5": "Black hits d4 at once and often aims the queen at b2.",
  "London vs King's Indian setup": "Black puts the bishop on g7 and prepares …c5 or …e5.",
  "Jobava London": "White adds Nc3 to the London and looks at Nb5 against c7.",
  "English Opening": "1.c4 controls d5 from the side and keeps White's plans flexible.",
  "Italian Game": "The bishop on c4 aims at f7, Black's weakest square.",
  "Ruy Lopez": "The bishop pressures the knight that defends e5.",
  "Ruy Lopez, Berlin": "Black counterattacks e4 and heads for a solid, simple game.",
  "Scotch Game": "White opens the center at once with d4.",
  "Scotch Gambit": "White gives a pawn for fast development and attacking chances.",
  "Vienna Game": "White develops the queen's knight first and keeps f4 in reserve.",
  "King's Gambit": "White gives the f-pawn to open the f-file and take the center.",
  "Two Knights Defence": "Black develops fast and counterattacks the e4 pawn.",
  "Petrov Defence": "Black copies White and attacks e4 instead of defending e5.",
  "Sicilian Defence": "Black fights for d4 from the side and plays for an unbalanced game.",
  "Open Sicilian": "White opens the center; Black gets the half-open c-file in return.",
  "Sicilian Najdorf": "…a6 keeps White's pieces off b5 and prepares …e5 or …b5.",
  "Sicilian Dragon": "Black puts the bishop on g7 to rule the long diagonal.",
  "Sicilian Alapin": "White plays c3 to support d4 and build a full pawn center.",
  "French Defence": "Black builds a solid pawn chain with …e6 and …d5 and hits White's center.",
  "French Advance": "White gains space with e5; Black attacks the pawn chain with …c5.",
  "Caro-Kann Defence": "Black supports …d5 with the c-pawn for a solid, sound position.",
  "Caro-Kann Advance": "White gains space; Black develops the bishop to f5 before …e6.",
  "Scandinavian Defence": "Black hits e4 at once, and the queen comes out early.",
  "Pirc Defence": "Black lets White take the center, then strikes back with pieces.",
};

/** The opening's short name for speech ("Open Game (1…e5)" → "Open Game"). */
export const spokenName = (name) => String(name || "").replace(/ \(.*\)$/, "");

/** One plain sentence on the opening's main idea, or "". */
export function openingIdea(name) {
  return IDEAS[spokenName(name)] || "";
}
