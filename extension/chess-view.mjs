import { Chess } from "./vendor/chess.mjs";
const pieceNames = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
const files = "abcdefgh";
export const squareList = Array.from(
  { length: 64 },
  (_, i) => files[i % 8] + (8 - Math.floor(i / 8)),
);
export function moveVisual(move, continuation = "") {
  const icon = document.createElement("img");
  icon.className = "move-piece";
  icon.src = "pieces/" + move.color + move.piece.toUpperCase() + ".svg";
  icon.alt = "";
  const copy = document.createElement("span");
  copy.className = "move-copy";
  const san = document.createElement("strong");
  san.className = "move-name";
  san.textContent = move.san;
  const route = document.createElement("span");
  route.className = "move-route";
  const name = pieceNames[move.piece];
  route.textContent = name[0].toUpperCase() + name.slice(1) + " · " + move.from + " → " + move.to;
  copy.append(san, route);
  if (continuation) {
    const line = document.createElement("span");
    line.className = "variation";
    line.textContent = continuation;
    copy.append(line);
  }
  return [icon, copy];
}
export function notation(fen, pv) {
  const board = new Chess(fen);
  return pv.map((move) => board.move(move).san);
}
export function explain(move) {
  const after = new Chess(move.after);
  const kind = pieceNames[move.piece];
  if (move.san.endsWith("#")) return "Checkmate. The king has no legal escape.";
  if (move.san.startsWith("O-O"))
    return "Castles the king on " + move.to + " and brings the rook to " + (move.to[0] === "g" ? "f" : "d") + move.to[1] + ".";
  if (move.promotion)
    return "Promotes the pawn to a " + pieceNames[move.promotion] + ".";
  if (move.captured)
    return (
      "Captures the " +
      pieceNames[move.captured] +
      " on " +
      (move.flags.includes("e") ? move.to[0] + move.from[1] : move.to) +
      (after.inCheck() ? " and gives check." : ".")
    );

  const attacks = after
    .board()
    .flat()
    .filter(
      (target) =>
        target &&
        target.color !== move.color &&
        after.attackers(target.square, move.color).includes(move.to),
    );
  attacks.sort((a, b) => "pnbrqk".indexOf(b.type) - "pnbrqk".indexOf(a.type));
  const targets = attacks.filter(target => target.type !== "p");
  if (targets.length >= 2)
    return "The " + kind + " on " + move.to + " attacks both the " +
      pieceNames[targets[0].type] + " on " + targets[0].square + " and the " +
      pieceNames[targets[1].type] + " on " + targets[1].square + ".";
  if (after.inCheck())
    return "Checks the king on " + after.findPiece({type: "k", color: after.turn()})[0] + ".";
  if (attacks.length)
    return (
      "Moves the " +
      kind +
      " to " +
      move.to +
      ", attacking the " +
      pieceNames[attacks[0].type] +
      " on " +
      attacks[0].square +
      "."
    );
  const before = new Chess(move.before);
  for (const type of ["b", "r", "q"]) {
    for (const square of after.findPiece({ type, color: move.color })) {
      if (square === move.to) continue;
      const direction = Math.sign(move.from.charCodeAt(0) - square.charCodeAt(0));
      const rankStep = Math.sign(Number(move.from[1]) - Number(square[1]));
      const beyond = files[files.indexOf(move.from[0]) + direction] +
        String(Number(move.from[1]) + rankStep);
      if (!/^[a-h][1-8]$/.test(beyond)) continue;
      if (after.attackers(beyond, move.color).includes(square) &&
          !before.attackers(beyond, move.color).includes(square))
        return "Opens the " + pieceNames[type] + "’s line from " + square + " through " + beyond + ".";
    }
  }
  if (
    "nb".includes(move.piece) &&
    move.from[1] === (move.color === "w" ? "1" : "8")
  )
    return "Develops the " + kind + " to " + move.to + ".";
  if (move.piece === "p") {
    const file = files.indexOf(move.to[0]);
    const rank = Number(move.to[1]) + (move.color === "w" ? 1 : -1);
    const controlled = [files[file - 1], files[file + 1]]
      .filter(Boolean)
      .map((neighbor) => neighbor + rank);
    const central = controlled.some((square) => /^[de][45]$/.test(square));
    return "Advances to " + move.to + " and controls " +
      controlled.join(" and ") + (central ? ", contesting the center." : ".");
  }
  const centralSquares = ["d4", "e4", "d5", "e5"].filter(square =>
    after.attackers(square, move.color).includes(move.to) &&
    !before.attackers(square, move.color).includes(move.from),
  );
  if (centralSquares.length)
    return "From " + move.to + ", the " + kind + " gains control of " + centralSquares.join(", ") + ".";
  const defended = after.board().flat().find(target =>
    target?.color === move.color && target.type !== "p" &&
    after.attackers(target.square, move.color).includes(move.to) &&
    !before.attackers(target.square, move.color).includes(move.from) &&
    after.isAttacked(target.square, after.turn()),
  );
  if (defended)
    return "Defends the attacked " + pieceNames[defended.type] + " on " + defended.square + ".";
  return "Moves the " + kind + " to " + move.to + ".";
}

export function drawBoard(
  element,
  board,
  { flipped, selected, targets = [], last, onSquare, onDrop } = {},
) {
  const animateMove = last && last.before === element.dataset.position &&
    last.after === board.fen() && element.dataset.flipped === String(Boolean(flipped)) &&
    (window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.dataset.motion !== "reduced");
  element.dataset.position = board.fen();
  element.dataset.flipped = String(Boolean(flipped));
  const focused = document.activeElement?.dataset.square;
  element.replaceChildren();
  const order = flipped ? [...squareList].reverse() : squareList;
  for (const [index, square] of order.entries()) {
    const cell = document.createElement(onSquare ? "button" : "div");
    const piece = board.get(square);
    cell.className =
      "square " +
      ((files.indexOf(square[0]) + Number(square[1])) % 2 ? "dark" : "light");
    cell.dataset.square = square;
    cell.setAttribute(
      "aria-label",
      square +
        (piece
          ? " " +
            (piece.color === "w" ? "white " : "black ") +
            pieceNames[piece.type]
          : " empty"),
    );
    if (onSquare) {
      cell.onclick = () => onSquare(square);
      cell.tabIndex = square === (focused || selected || order[0]) ? 0 : -1;
      cell.onkeydown = (event) => {
        const delta = {
          ArrowUp: -8,
          ArrowDown: 8,
          ArrowLeft: -1,
          ArrowRight: 1,
        }[event.key];
        if (!delta) return;
        event.preventDefault();
        event.stopPropagation();
        const target = element.children[index + delta];
        if (
          !target ||
          (Math.abs(delta) === 1 &&
            Math.floor(index / 8) !== Math.floor((index + delta) / 8))
        )
          return;
        cell.tabIndex = -1;
        target.tabIndex = 0;
        target.focus();
      };
    }
    if (onDrop) {
      if (piece?.color === board.turn()) {
        cell.draggable = true;
        cell.ondragstart = (event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-chess-square", square);
        };
      }
      cell.ondragover = (event) => {
        if (event.dataTransfer.types.includes("application/x-chess-square"))
          event.preventDefault();
      };
      cell.ondrop = (event) => {
        const from = event.dataTransfer.getData("application/x-chess-square");
        if (!from) return;
        event.preventDefault();
        onDrop(from, square);
      };
    }
    if (last?.from === square || last?.to === square)
      cell.classList.add("last");
    if (selected === square) cell.classList.add("selected");
    if (targets.includes(square))
      cell.classList.add(piece ? "target-capture" : "target");
    if (piece) {
      const image = document.createElement("img");
      image.src = "./pieces/" + piece.color + piece.type.toUpperCase() + ".svg";
      image.alt = "";
      image.draggable = false;
      cell.append(image);
    }
    if (index % 8 === 0 || index >= 56) {
      if (index % 8 === 0) {
        const rank = document.createElement("span");
        rank.className = "rank";
        rank.textContent = square[1];
        cell.append(rank);
      }
      if (index >= 56) {
        const file = document.createElement("span");
        file.className = "file";
        file.textContent = square[0];
        cell.append(file);
      }
    }
    element.append(cell);
  }
  if (animateMove) {
    const from = element.querySelector('[data-square="' + last.from + '"]').getBoundingClientRect();
    const to = element.querySelector('[data-square="' + last.to + '"]');
    const target = to.getBoundingClientRect();
    if (last.captured) {
      const ghost = document.createElement("img");
      ghost.src = "./pieces/" + (last.color === "w" ? "b" : "w") + last.captured.toUpperCase() + ".svg";
      ghost.alt = "";
      ghost.className = "capture-ghost";
      to.prepend(ghost);
      ghost.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.82)" }],
        { duration: 200, easing: "ease-out", fill: "forwards" }).finished.then(() => ghost.remove(), () => ghost.remove());
    }
    to.querySelector("img:not(.capture-ghost)")?.animate([
      { transform: "translate(" + (from.left - target.left) + "px," + (from.top - target.top) + "px)" },
      { transform: "none" },
    ], { duration: 200, easing: "cubic-bezier(.2,.7,.2,1)" });
  }
  if (focused && onSquare)
    element
      .querySelector('[data-square="' + focused + '"]')
      ?.focus({ preventScroll: true });
}
