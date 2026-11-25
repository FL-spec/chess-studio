import { Chess } from "./vendor/chess.mjs";

export function supported(url) {
  const { hostname, pathname } = new URL(url);
  if (hostname === "lichess.org") return /^\/analysis(?:\/|$)/.test(pathname);
  return (
    (hostname === "www.chess.com" || hostname === "chess.com") &&
    /^\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?(?:play\/(?:computer|coach|online)|game\/(?:live|[0-9]+)|live|analysis)(?:\/|$)/i.test(
      pathname,
    )
  );
}
export const automaticArrows = supported;

export function placement(board) {
  const squares = new Map();
  for (const element of board.querySelectorAll(".piece")) {
    const classes = (element.getAttribute("class") || "").split(/\s+/);
    const piece = classes.find((value) => /^[wb][prnbqk]$/.test(value));
    const square = classes.find((value) => /^square-[1-8][1-8]$/.test(value));
    if (!piece || !square) continue;
    const key = square.slice(-2);
    if (squares.has(key)) return;
    squares.set(key, piece[0] === "w" ? piece[1].toUpperCase() : piece[1]);
  }
  return encode(squares);
}
export function lichessPlacement(board) {
  const bounds = board.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const flipped = Boolean(board.closest(".orientation-black"));
  const squares = new Map();
  const names = {
    pawn: "p",
    knight: "n",
    bishop: "b",
    rook: "r",
    queen: "q",
    king: "k",
  };
  for (const piece of board.querySelectorAll("piece")) {
    if (
      piece.classList.contains("ghost") ||
      piece.classList.contains("dragging")
    )
      return;
    const kind = [...piece.classList].find((token) =>
      Object.hasOwn(names, token),
    );
    if (!kind) continue;
    const rect = piece.getBoundingClientRect();
    const file = Math.floor(
      ((rect.x + rect.width / 2 - bounds.x) / bounds.width) * 8,
    );
    const row = Math.floor(
      ((rect.y + rect.height / 2 - bounds.y) / bounds.height) * 8,
    );
    if (file < 0 || file > 7 || row < 0 || row > 7) return;
    const key = flipped
      ? "" + (8 - file) + (row + 1)
      : "" + (file + 1) + (8 - row);
    if (squares.has(key)) return;
    squares.set(
      key,
      piece.classList.contains("white")
        ? names[kind].toUpperCase()
        : names[kind],
    );
  }
  return encode(squares);
}
function encode(squares) {
  if (
    ![...squares.values()].includes("K") ||
    ![...squares.values()].includes("k")
  )
    return;
  return Array.from({ length: 8 }, (_, row) =>
    Array.from(
      { length: 8 },
      (_, file) => squares.get("" + (file + 1) + (8 - row)) || "1",
    )
      .join("")
      .replace(/1+/g, (run) => run.length),
  ).join("/");
}
export function reconstruct(
  pieces,
  { fen, moves = [], previous, startFen } = {},
) {
  if (!pieces) return;
  const matches = (game) => game.fen().split(" ")[0] === pieces;
  let start;
  try {
    start = new Chess(startFen);
  } catch {
    return;
  }
  if (moves.length) {
    const game = new Chess(startFen);
    // `history`: the page's moves up to the position on the board, so the
    // panel knows the whole game (repetitions, the end of the game, review).
    const start = game.fen();
    let match = matches(game) ? { fen: game.fen(), history: [], start } : undefined;
    try {
      for (const [index, san] of moves.entries()) {
        const last = game.move(san);
        if (matches(game)) match = { fen: game.fen(), last, history: moves.slice(0, index + 1), start };
      }
      if (match) return match;
    } catch {
      /* Other move lists and mid-animation snapshots can be incomplete. */
    }
  }
  if (fen) {
    try {
      const game = new Chess(fen);
      const opponent = game.turn() === "w" ? "b" : "w";
      if (
        matches(game) &&
        !game.isAttacked(
          game.findPiece({ type: "k", color: opponent })[0],
          game.turn(),
        )
      ) {
        return {
          fen: game.fen(),
          last: previous?.fen === game.fen() ? previous.last : undefined,
        };
      }
    } catch {
      /* Wait for readable move history or a legal transition. */
    }
  }
  // An empty move list and the start position: a new game, even when the
  // last game ended in the same placement.
  if (!moves.length && matches(start) && previous?.history?.length) return { fen: start.fen(), history: [], start: start.fen() };
  if (previous) {
    const game = new Chess(previous.fen);
    if (matches(game)) return previous;
    const candidates = game
      .moves({ verbose: true })
      .filter((move) => move.after.split(" ")[0] === pieces);
    if (candidates.length === 1)
      return { fen: candidates[0].after, last: candidates[0] };
  }
  if (matches(start)) return { fen: start.fen() };
  const first = start
    .moves({ verbose: true })
    .find((move) => move.after.split(" ")[0] === pieces);
  if (first) return { fen: first.after, last: first };
}
