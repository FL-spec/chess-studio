const types = "pnbrqk";
const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 5 };
const center = (square) =>
  (7 -
    Math.abs(square.charCodeAt(0) - 100.5) -
    Math.abs(Number(square[1]) - 4.5)) /
  6;

export function features(board, move, elo, ply) {
  const { from, to, piece, color, captured, promotion, san } = move;
  const skill = (Math.max(850, Math.min(2200, elo)) - 1450) / 550;
  const early = Math.max(0, 1 - ply / 24);
  const file = to.charCodeAt(0) - 97;
  const advance = (Number(to[1]) - Number(from[1])) * (color === "w" ? 1 : -1);
  const enemy = color === "w" ? "b" : "w";
  const exposed = board.isAttacked(to, enemy);
  const supported = board
    .attackers(to, color)
    .some((square) => square !== from);
  const recapture = board.isAttacked(from, enemy);
  const material = captured ? values[captured] : 0;
  const home = from[1] === (color === "w" ? "1" : "8");
  const development = Number(home && (piece === "n" || piece === "b"));
  const squareCenter = center(to);
  const captureRisk = exposed ? Math.max(0, values[piece] - material) / 5 : 0;
  return [
    ...Array.from(types, (type) => Number(type === piece)),
    ...Array.from({ length: 8 }, (_, index) => Number(index === file) * early),
    squareCenter,
    squareCenter - center(from),
    early * development,
    piece === "p" ? advance : 0,
    Number(piece === "p" && advance === 2) * early,
    Number(san.includes("O-O")),
    Number(/[+#]/.test(san)),
    Number(san.endsWith("#")),
    material,
    captureRisk,
    Number(exposed && !supported),
    Number(recapture),
    Number(promotion === "q"),
    Number(Boolean(promotion) && promotion !== "q"),
    early * Number(piece === "q"),
    skill * material,
    skill * captureRisk,
    skill * Number(exposed && !supported),
    skill * early * development,
    Number(board.inCheck()) * material,
  ];
}
export const openingKey = (fen) => fen.split(" ").slice(0, 4).join(" ");
export const openingBand = (elo) => (elo < 1250 ? 0 : elo < 1650 ? 1 : 2);
export function rankHuman(board, elo, ply, weights, book = {}) {
  const moves = board.moves({ verbose: true });
  const logits = moves.map((move) =>
    features(board, move, elo, ply).reduce(
      (sum, value, index) => sum + value * weights[index],
      0,
    ),
  );
  const peak = Math.max(...logits);
  const mass = logits.map((logit) => Math.exp(logit - peak));
  const total = mass.reduce((sum, value) => sum + value, 0);
  const entry = ply < 12 ? book[openingKey(board.fen())] : undefined;
  const broad = entry?.[3] || {};
  const band = entry?.[openingBand(elo)] || {};
  const counts = moves.map(
    (move) => (band[move.san] || 0) + 0.25 * (broad[move.san] || 0),
  );
  const observations = counts.reduce((sum, value) => sum + value, 0);
  const priorMass = 20;
  return moves
    .map((move, index) => ({
      move,
      probability:
        ((priorMass * mass[index]) / total + counts[index]) /
        (priorMass + observations),
    }))
    .sort((a, b) => b.probability - a.probability);
}
