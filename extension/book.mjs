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
  // Wider coverage: gambits, sidelines and the main systems players meet online.
  { id: "evans-gambit", name: "Evans Gambit", side: "w", moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O" },
  { id: "fried-liver", name: "Fried Liver Attack", side: "w", moves: "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3" },
  { id: "ruy-exchange", name: "Ruy Lopez, Exchange Variation", side: "w", moves: "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4" },
  { id: "ruy-marshall", name: "Ruy Lopez, Marshall Attack", side: "b", moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5 Nxe5 Nxe5 Rxe5 c6" },
  { id: "ponziani", name: "Ponziani Opening", side: "w", moves: "e4 e5 Nf3 Nc6 c3 Nf6 d4 Nxe4 d5 Ne7 Nxe5" },
  { id: "center-game", name: "Centre Game", side: "w", moves: "e4 e5 d4 exd4 Qxd4 Nc6 Qe3 Nf6 Nc3" },
  { id: "danish", name: "Danish Gambit", side: "w", moves: "e4 e5 d4 exd4 c3 dxc3 Bc4 cxb2 Bxb2" },
  { id: "bishops-opening", name: "Bishop's Opening", side: "w", moves: "e4 e5 Bc4 Nf6 d3 c6 Nf3 d5 Bb3" },
  { id: "four-knights", name: "Four Knights Game", side: "w", moves: "e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4 O-O O-O d3 d6" },
  { id: "vienna-gambit", name: "Vienna Gambit", side: "w", moves: "e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7" },
  { id: "kings-gambit-declined", name: "King's Gambit Declined", side: "b", moves: "e4 e5 f4 Bc5 Nf3 d6 c3 Nf6 d4 exd4 cxd4 Bb4+" },
  { id: "philidor", name: "Philidor Defence", side: "b", moves: "e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 O-O O-O" },
  { id: "stafford", name: "Stafford Gambit", side: "b", moves: "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5" },
  { id: "smith-morra", name: "Smith-Morra Gambit", side: "w", moves: "e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4 e6 O-O Nf6 Qe2" },
  { id: "grand-prix", name: "Grand Prix Attack", side: "w", moves: "e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bc4 e6 f5" },
  { id: "closed-sicilian", name: "Closed Sicilian", side: "w", moves: "e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 f4" },
  { id: "rossolimo", name: "Sicilian Rossolimo", side: "w", moves: "e4 c5 Nf3 Nc6 Bb5 g6 O-O Bg7 Re1 Nf6 c3 O-O" },
  { id: "sicilian-moscow", name: "Sicilian, Moscow Variation", side: "w", moves: "e4 c5 Nf3 d6 Bb5+ Bd7 Bxd7+ Qxd7 O-O Nc6 c3 Nf6 Re1" },
  { id: "najdorf-bg5", name: "Najdorf, 6.Bg5", side: "b", moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Be7 Qf3 Qc7 O-O-O Nbd7" },
  { id: "sicilian-scheveningen", name: "Sicilian Scheveningen", side: "b", moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6 Be2 Be7 O-O O-O f4 Nc6" },
  { id: "sicilian-classical", name: "Sicilian Classical", side: "b", moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6 Bg5 e6 Qd2 Be7 O-O-O O-O" },
  { id: "sicilian-sveshnikov", name: "Sicilian Sveshnikov", side: "b", moves: "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5" },
  { id: "accelerated-dragon", name: "Accelerated Dragon", side: "b", moves: "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 Bc4 O-O" },
  { id: "sicilian-taimanov", name: "Sicilian Taimanov", side: "b", moves: "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 Bd3 Nf6 O-O" },
  { id: "sicilian-kan", name: "Sicilian Kan", side: "b", moves: "e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6 Bd3 Nf6 O-O Qc7" },
  { id: "french-tarrasch", name: "French Tarrasch", side: "w", moves: "e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2" },
  { id: "french-winawer", name: "French Winawer", side: "b", moves: "e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4" },
  { id: "french-rubinstein", name: "French Rubinstein", side: "b", moves: "e4 e6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Nf3 Ngf6 Nxf6+ Nxf6" },
  { id: "caro-panov", name: "Caro-Kann Panov Attack", side: "w", moves: "e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Bb4" },
  { id: "scandinavian-modern", name: "Scandinavian, 2…Nf6", side: "b", moves: "e4 d5 exd5 Nf6 d4 Nxd5 Nf3 g6 c4 Nb6" },
  { id: "alekhine", name: "Alekhine's Defence", side: "b", moves: "e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O Be7" },
  { id: "modern", name: "Modern Defence", side: "b", moves: "e4 g6 d4 Bg7 Nc3 d6 Be3 a6 Qd2 b5" },
  { id: "benoni", name: "Modern Benoni", side: "b", moves: "d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7 Be2 O-O O-O" },
  { id: "benko", name: "Benko Gambit", side: "b", moves: "d4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6 Nc3 d6 e4 Bxf1 Kxf1 g6" },
  { id: "queens-indian", name: "Queen's Indian Defence", side: "b", moves: "d4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7" },
  { id: "bogo-indian", name: "Bogo-Indian Defence", side: "b", moves: "d4 Nf6 c4 e6 Nf3 Bb4+ Bd2 Qe7 g3 Nc6 Bg2 Bxd2+ Nbxd2 d6" },
  { id: "nimzo-classical", name: "Nimzo-Indian, Classical", side: "b", moves: "d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7" },
  { id: "semi-slav", name: "Semi-Slav Defence", side: "b", moves: "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3" },
  { id: "tarrasch", name: "Tarrasch Defence", side: "b", moves: "d4 d5 c4 e6 Nc3 c5 cxd5 exd5 Nf3 Nc6 g3 Nf6 Bg2 Be7 O-O O-O" },
  { id: "albin", name: "Albin Countergambit", side: "b", moves: "d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3 Be6 Nbd2 Qd7" },
  { id: "dutch-leningrad", name: "Dutch Leningrad", side: "b", moves: "d4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6 Nc3 Qe8" },
  { id: "englund", name: "Englund Gambit", side: "b", moves: "d4 e5 dxe5 Nc6 Nf3 Qe7" },
  { id: "qgd-exchange", name: "QGD Exchange Variation", side: "w", moves: "d4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 Be7 e3 O-O Bd3 Nbd7 Qc2" },
  { id: "colle", name: "Colle System", side: "w", moves: "d4 d5 Nf3 Nf6 e3 e6 Bd3 c5 c3 Nc6 Nbd2 Bd6 O-O O-O" },
  { id: "trompowsky", name: "Trompowsky Attack", side: "w", moves: "d4 Nf6 Bg5 Ne4 Bf4 c5 f3 Qa5+ c3 Nf6" },
  { id: "blackmar-diemer", name: "Blackmar-Diemer Gambit", side: "w", moves: "d4 d5 e4 dxe4 Nc3 Nf6 f3 exf3 Nxf3" },
  { id: "english-symmetrical", name: "English, Symmetrical", side: "w", moves: "c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 Nf6 O-O O-O" },
  { id: "kings-indian-attack", name: "King's Indian Attack", side: "w", moves: "Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5 e4" },
  { id: "reti", name: "Réti Opening", side: "w", moves: "Nf3 d5 c4 e6 g3 Nf6 Bg2 Be7 O-O O-O b3" },
  { id: "bird", name: "Bird's Opening", side: "w", moves: "f4 d5 Nf3 Nf6 e3 g6 b3 Bg7 Bb2 O-O Be2" },
  { id: "larsen", name: "Nimzo-Larsen Attack", side: "w", moves: "b3 e5 Bb2 Nc6 e3 d5 Bb5 Bd6" },
  { id: "polish", name: "Polish Opening", side: "w", moves: "b4 e5 Bb2 Bxb4 Bxe5 Nf6 c4 O-O Nf3" },
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
  "e4 e6": "French Defence", "e4 c6": "Caro-Kann Defence", "e4 d5": "Scandinavian Defence", "e4 Nf6": "Alekhine's Defence",
  "e4 g6": "Modern Defence", "e4 d6": "Pirc Defence", "d4 f5": "Dutch Defence", "Nf3": "Réti Opening", "Nf3 d5": "Réti Opening",
  "f4": "Bird's Opening", "b3": "Nimzo-Larsen Attack", "b4": "Polish Opening", "e4 e5 Nc3": "Vienna Game",
  "e4 e5 f4": "King's Gambit", "e4 e5 Bc4": "Bishop's Opening", "e4 e5 d4": "Centre Game", "e4 e5 d4 exd4": "Centre Game",
  "e4 e5 Nf3 d6": "Philidor Defence", "e4 e5 Nf3 Nf6": "Petrov Defence", "e4 e5 Nf3 Nc6 Nc3": "Three Knights Game",
  "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5": "Two Knights, Knight Attack", "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5": "Two Knights, Knight Attack",
  "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5": "Two Knights, Knight Attack", "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5": "Two Knights, Knight Attack",
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O": "Ruy Lopez", "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3": "Ruy Lopez",
  "e4 c5 Nf3 e6": "Sicilian Defence", "e4 c5 Nf3 e6 d4": "Open Sicilian", "e4 c5 Nf3 e6 d4 cxd4": "Open Sicilian",
  "e4 c5 Nf3 e6 d4 cxd4 Nxd4": "Open Sicilian", "e4 c5 Nc3": "Closed Sicilian", "e4 c5 Nc3 Nc6": "Closed Sicilian",
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5": "Sicilian Sveshnikov", "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5": "Sicilian Sveshnikov",
  "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6": "Sicilian Sveshnikov",
  "e4 c6 d4 d5 exd5": "Caro-Kann Exchange", "e4 c6 d4 d5 exd5 cxd5": "Caro-Kann Exchange",
  "d4 Nf6 c4 c5": "Benoni Defence", "d4 Nf6 c4 c5 d5": "Benoni Defence", "d4 Nf6 c4 e6 Nf3": "Indian Defence",
  "d4 Nf6 c4 e6 Nc3 Bb4": "Nimzo-Indian Defence", "d4 d5 c4 c6": "Slav Defence", "d4 d5 c4 dxc4": "Queen's Gambit Accepted",
  "d4 Nf6 c4 g6 Nc3 d5": "Grünfeld Defence", "d4 d5 Nf3": "Queen's Pawn Game", "d4 d5 Nf3 Nf6": "Queen's Pawn Game",
  "d4 Nf6 Bg5": "Trompowsky Attack", "c4 c5": "English, Symmetrical",
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
  "Evans Gambit": "White gives the b-pawn to gain time for c3 and d4 and a fast attack.",
  "Fried Liver Attack": "White sacrifices the knight on f7 to drag Black's king into the open.",
  "Two Knights, Knight Attack": "White's knight hits f7 at once. Black must defend or counterattack with …d5.",
  "Ruy Lopez, Exchange Variation": "White trades on c6 to damage Black's pawns and aims for a better endgame.",
  "Ruy Lopez, Marshall Attack": "Black gives a pawn for a fast, dangerous attack on White's king.",
  "Ponziani Opening": "White plays c3 to prepare d4 and build a big pawn center.",
  "Centre Game": "White opens the center early, but the queen comes out and can be chased.",
  "Danish Gambit": "White gives two pawns for two bishops aimed straight at Black's king.",
  "Bishop's Opening": "The bishop aims at f7 first and keeps White's other plans open.",
  "Three Knights Game": "Both sides develop knights first and keep the center flexible.",
  "Four Knights Game": "Both sides develop all four knights: simple, classical chess.",
  "Vienna Gambit": "White offers the f-pawn to open lines and gain space in the center.",
  "King's Gambit Declined": "Black ignores the gift and develops the bishop to c5 to stop White castling.",
  "Philidor Defence": "Black defends e5 with the d-pawn: solid, but a little passive.",
  "Stafford Gambit": "Black gives a pawn for quick piece play and many traps.",
  "Smith-Morra Gambit": "White gives a pawn for fast development and open lines against the Sicilian.",
  "Grand Prix Attack": "White plays f4 and aims for a quick kingside attack.",
  "Closed Sicilian": "White keeps the center closed and slowly prepares a kingside attack.",
  "Sicilian Rossolimo": "White pins the knight with Bb5 and is happy to double Black's pawns.",
  "Sicilian, Moscow Variation": "White checks with the bishop and trades it off for a calm game.",
  "Najdorf, 6.Bg5": "White pins the knight and prepares f4 and long castling for a sharp fight.",
  "Sicilian Scheveningen": "Black builds a small pawn center on d6 and e6, solid and flexible.",
  "Sicilian Classical": "Black develops the knight to c6 and keeps all options in the center.",
  "Sicilian Sveshnikov": "Black plays …e5 to gain space, and accepts a hole on d5.",
  "Accelerated Dragon": "Black fianchettoes early and keeps the option of …d5 in one move.",
  "Sicilian Taimanov": "Black keeps the d-pawn back and develops flexibly with …Nc6 and …Qc7.",
  "Sicilian Kan": "Black plays …a6 early to control b5 and keep the position flexible.",
  "French Tarrasch": "White's knight goes to d2 so the c-pawn can support d4.",
  "French Winawer": "Black pins the knight and gives the bishop to double White's pawns.",
  "French Rubinstein": "Black gives up the center to free the pieces and play solid chess.",
  "Caro-Kann Exchange": "The pawns trade on d5. The structure is symmetrical and calm.",
  "Caro-Kann Panov Attack": "White plays c4 for an isolated d-pawn and active pieces.",
  "Scandinavian, 2…Nf6": "Black wins back the pawn with the knight instead of the queen.",
  "Alekhine's Defence": "Black invites White's pawns forward, then attacks them.",
  "Modern Defence": "Black fianchettoes the bishop and lets White take the center.",
  "Benoni Defence": "Black hits d4 with the c-pawn and plays for an unbalanced game.",
  "Modern Benoni": "Black gets a queenside pawn majority and active pieces for less space.",
  "Benko Gambit": "Black gives a pawn for long-term pressure on the a- and b-files.",
  "Queen's Indian Defence": "Black fianchettoes the queen's bishop to control e4.",
  "Bogo-Indian Defence": "Black checks with the bishop and trades it to develop quickly.",
  "Nimzo-Indian, Classical": "White plays Qc2 so a capture on c3 does not double the pawns.",
  "Semi-Slav Defence": "Black combines …c6 and …e6: very solid, with sharp lines.",
  "Tarrasch Defence": "Black accepts an isolated d-pawn for free, active pieces.",
  "Albin Countergambit": "Black gives a pawn for a cramping pawn on d4.",
  "Dutch Leningrad": "Black combines …f5 with a fianchetto, like a King's Indian.",
  "Englund Gambit": "Black gives a pawn and sets traps. It is risky against good defence.",
  "QGD Exchange Variation": "White trades on d5 and plans a minority attack with b4 and b5.",
  "Colle System": "White builds a solid setup with d4, e3 and Bd3, then breaks with e4.",
  "Trompowsky Attack": "White's bishop goes to g5 at once to unbalance the game.",
  "Blackmar-Diemer Gambit": "White gives a pawn for open lines and a fast kingside attack.",
  "English, Symmetrical": "Both sides play c-pawn first and fight for d4 and d5 from the side.",
  "King's Indian Attack": "White sets up the same plan against almost anything: Nf3, g3, Bg2, d3, e4.",
  "Réti Opening": "White controls the center from a distance with pieces first.",
  "Bird's Opening": "1.f4 controls e5 and often leads to a kingside attack.",
  "Nimzo-Larsen Attack": "White fianchettoes the queen's bishop to aim at the long diagonal.",
  "Polish Opening": "White plays b4 to gain space on the queenside and fianchetto.",
};

/** The opening's short name for speech ("Open Game (1…e5)" → "Open Game"). */
export const spokenName = (name) => String(name || "").replace(/ \(.*\)$/, "");

/** One plain sentence on the opening's main idea, or "". */
export function openingIdea(name) {
  return IDEAS[spokenName(name)] || "";
}

// Well-known opening traps. `at` is the index of the losing move in `moves`;
// the rest of the line shows the punishment.
export const TRAPS = [
  { name: "Légal Trap", moves: "e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#", at: 9,
    idea: "Taking the queen walks into Bxf7+ and Nd5#: the minor pieces mate the king." },
  { name: "Scholar's Mate", moves: "e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#", at: 5,
    idea: "The knight attacks the queen, but f7 is left alone: Qxf7 is mate." },
  { name: "Fishing Pole Trap", moves: "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Ng4 h3 h5 hxg4 hxg4 Ne1 Qh4", at: 10,
    idea: "Taking the knight opens the h-file, and the queen comes to h4 with mate on h2 or h1." },
  { name: "Noah's Ark Trap", moves: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 d4 b5 Bb3 Nxd4 Nxd4 exd4 Qxd4 c5 Qd5 Be6 Qc6+ Bd7 Qd5 c4", at: 14,
    idea: "After Qxd4, …c5 and …c4 trap White's bishop on b3 behind the pawns." },
  { name: "Blackburne Shilling Trap", moves: "e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#", at: 6,
    idea: "Taking on e5 lets …Qg5 hit both the knight and g2, and the attack ends in mate." },
  { name: "Englund Gambit Trap", moves: "d4 e5 dxe5 Nc6 Nf3 Qe7 Bf4 Qb4+ Bd2 Qxb2 Bc3 Bb4 Qd2 Bxc3 Qxc3 Qc1#", at: 10,
    idea: "Bc3 looks active, but …Bb4 pins it and the queen ends with mate on c1." },
  { name: "Lasker Trap", moves: "d4 d5 c4 e5 dxe5 d4 e3 Bb4+ Bd2 dxe3 Bxb4 exf2+ Ke2 fxg1=N+", at: 6,
    idea: "e3 lets Black's pawn run to f2 and promote to a knight with check." },
  { name: "Stafford Trap", moves: "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Bg5 Nxe4 Bxd8 Bxf2+ Ke2 Bg4#", at: 10,
    idea: "Bg5 pins nothing: …Nxe4 gives the queen, and the bishops mate the king." },
  { name: "Siberian Trap", moves: "e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 e6 Bc4 Qc7 O-O Nf6 Qe2 Ng4 h3 Nd4 Nxd4 Qh2#", at: 16,
    idea: "h3 chases the knight, but …Nd4 hits the queen and …Qh2 is mate." },
  { name: "Caro-Kann Smothered Mate", moves: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 Ngf6 Nd6#", at: 9,
    idea: "With the queen on e2, the e7 pawn is pinned and Nd6 is a smothered mate." },
  { name: "Petrov Trap", moves: "e4 e5 Nf3 Nf6 Nxe5 Nxe4 Qe2 Nf6 Nc6+", at: 5,
    idea: "Copying with …Nxe4 runs into Qe2: the knight moves and Nc6+ wins the queen." },
  { name: "Queen's Gambit Accepted Trap", moves: "d4 d5 c4 dxc4 e3 b5 a4 c6 axb5 cxb5 Qf3", at: 5,
    idea: "Holding the pawn with …b5 fails: after axb5 and Qf3 the rook on a8 falls." },
];

const TRAP_AFTER = new Map(); // position after the losing move → trap
const TRAP_BEFORE = new Map(); // position before it → trap (the losing move is available)
for (const trap of TRAPS) {
  const game = new Chess();
  const moves = trap.moves.split(" ");
  moves.forEach((san, index) => {
    if (index === trap.at) TRAP_BEFORE.set(key(game.fen()), { ...trap, bait: san, victim: game.turn() });
    game.move(san);
    if (index === trap.at) TRAP_AFTER.set(key(game.fen()), { ...trap, bait: san, victim: index % 2 ? "b" : "w", punish: moves[index + 1] });
  });
}

/** The trap a move just fell into: { name, idea, bait, victim, punish }, or null. */
export function trapAfter(fen) {
  return TRAP_AFTER.get(key(fen)) || null;
}

/** A trap the side to move can fall into here: { name, idea, bait, victim }, or null. */
export function trapAhead(fen) {
  return TRAP_BEFORE.get(key(fen)) || null;
}
