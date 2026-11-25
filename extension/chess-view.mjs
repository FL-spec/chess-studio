import { Chess } from "./vendor/chess.mjs";
import { moveIdea, positionalIdea } from "./tactics.mjs";
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
    return "Promotes the pawn to a " + pieceNames[move.promotion] + (after.inCheck() ? " with check." : ".");
  // Tactics and material first: forks, pins, discovered attacks, winning captures, threats.
  const idea = moveIdea(move);
  if (idea) return idea;
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
  // Quiet moves: a positional idea, unless the move attacks a piece.
  const quiet = !attacks.some((target) => target.type !== "p") && positionalIdea(move);
  if (quiet) return quiet;
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
  // Development and central pawns first: that is what a coach would say.
  const homeRank = move.color === "w" ? "1" : "8";
  if ("nb".includes(move.piece) && move.from[1] === homeRank) {
    const castling = (after.fen().split(" ")[2] || "").includes(move.color === "w" ? "K" : "k");
    const clear = castling && ["f", "g"].every(file => !after.get(file + homeRank));
    const wasBlocked = ["f", "g"].some(file => before.get(file + homeRank));
    return "Develops the " + kind + " to " + move.to + (clear && wasBlocked ? " and prepares to castle." : ".");
  }
  if (move.piece === "p" && /^[cde][45]$/.test(move.to)) {
    const file = files.indexOf(move.to[0]);
    const rank = Number(move.to[1]) + (move.color === "w" ? 1 : -1);
    const controlled = [files[file - 1], files[file + 1]].filter(Boolean).map((neighbor) => neighbor + rank);
    return "Takes space in the center and controls " + controlled.join(" and ") + ".";
  }
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
  { flipped, selected, targets = [], last, onSquare, onDrop, annotate, check } = {},
) {
  const skipAnimation = element.dataset.dropped === "1";
  delete element.dataset.dropped;
  const animateMove = !skipAnimation && last && last.before === element.dataset.position &&
    last.after === board.fen() && element.dataset.flipped === String(Boolean(flipped)) &&
    (window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.dataset.motion !== "reduced");
  // Display-only boards (no click or drag) redraw many times per second while
  // the engine searches: keep their squares and rebuild only those whose piece
  // or highlight changed. Other children (arrow overlays) are removed as before.
  const mode = onSquare || onDrop ? "interactive" : "static";
  const cells = mode === "static" && element.dataset.mode === "static" &&
    element.dataset.flipped === String(Boolean(flipped))
    ? [...element.children].filter((child) => child.classList.contains("square"))
    : [];
  const reuse = cells.length === 64;
  if (element.dataset.position !== board.fen()) element._marks = undefined;
  element.dataset.position = board.fen();
  element.dataset.flipped = String(Boolean(flipped));
  element.dataset.mode = mode;
  const focused = document.activeElement?.dataset.square;
  const picker = element.querySelector(":scope > .promotion-picker");
  if (reuse) {
    for (const child of [...element.children])
      if (!child.classList.contains("square")) child.remove();
  } else element.replaceChildren();
  const order = flipped ? [...squareList].reverse() : squareList;
  const checked = check && board.inCheck()
    ? board.findPiece({ type: "k", color: board.turn() })[0] : undefined;
  for (const [index, square] of order.entries()) {
    const piece = board.get(square);
    const sig = (piece ? piece.color + piece.type : "-") +
      (last?.from === square || last?.to === square ? "l" : "") +
      (selected === square ? "s" : "") + (targets.includes(square) ? "t" : "") +
      (checked === square ? "c" : "");
    if (reuse && cells[index].dataset.sig === sig) continue;
    const cell = document.createElement(onSquare ? "button" : "div");
    cell.dataset.sig = sig;
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
      // Mouse and touch go through the board's pointer handler; this click
      // only fires for keyboard activation (Enter or Space).
      cell.onclick = (event) => { if (event.detail === 0) onSquare(square); };
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
    if (onDrop && piece?.color === board.turn()) cell.classList.add("movable");
    if (last?.from === square || last?.to === square)
      cell.classList.add("last");
    if (selected === square) cell.classList.add("selected");
    if (checked === square) cell.classList.add("check");
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
    if (reuse) cells[index].replaceWith(cell);
    else element.append(cell);
  }
  const wired = Boolean(onSquare || onDrop || annotate);
  element.classList.toggle("board-interactive", wired);
  element._board = { board, order, selected, onSquare, onDrop, wired };
  if (wired) wireBoard(element);
  drawMarks(element);
  if (picker) element.append(picker);
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

// ---- Interactive board: pointer drag, click-to-move, right-click marks ----

const MARK_COLORS = { default: "#e8a23a", shift: "#3f9b4c", ctrl: "#d2453c", alt: "#2f7fd8" };
const markColor = (event) =>
  event.shiftKey ? MARK_COLORS.shift : event.ctrlKey || event.metaKey ? MARK_COLORS.ctrl
    : event.altKey ? MARK_COLORS.alt : MARK_COLORS.default;

function squareAt(element, x, y) {
  const rect = element.getBoundingClientRect();
  const col = Math.floor(((x - rect.left) / rect.width) * 8);
  const row = Math.floor(((y - rect.top) / rect.height) * 8);
  if (col < 0 || col > 7 || row < 0 || row > 7) return undefined;
  return element._board.order[row * 8 + col];
}

function cellOf(element, square) {
  return element.querySelector('.square[data-square="' + square + '"]');
}

export function clearBoardMarks(element) {
  if (!element._marks?.length) return;
  element._marks = [];
  drawMarks(element);
}

function toggleMark(element, mark) {
  const marks = element._marks || (element._marks = []);
  const index = marks.findIndex((item) => item.from === mark.from && item.to === mark.to);
  if (index >= 0 && marks[index].color === mark.color) marks.splice(index, 1);
  else if (index >= 0) marks[index] = mark;
  else marks.push(mark);
  drawMarks(element);
}

function drawMarks(element) {
  element.querySelector(":scope > .board-marks")?.remove();
  const marks = element._marks;
  if (!marks?.length) return;
  const ns = "http://www.w3.org/2000/svg";
  const make = (tag, attributes) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  };
  const flipped = element.dataset.flipped === "true";
  const center = (square) => {
    const file = files.indexOf(square[0]);
    const row = 8 - Number(square[1]);
    return [flipped ? 7.5 - file : file + 0.5, flipped ? 7.5 - row : row + 0.5];
  };
  const svg = make("svg", { class: "board-marks", viewBox: "0 0 8 8", "aria-hidden": "true" });
  for (const mark of marks.filter((item) => item.from === item.to)) {
    const [x, y] = center(mark.from);
    svg.append(make("rect", { x: x - 0.5, y: y - 0.5, width: 1, height: 1, fill: mark.color, "fill-opacity": 0.55 }));
  }
  const round = (value) => Math.round(value * 1000) / 1000;
  for (const mark of marks.filter((item) => item.from !== item.to)) {
    const [x1, y1] = center(mark.from);
    const [x2, y2] = center(mark.to);
    const dx = x2 - x1, dy = y2 - y1;
    // Knight jumps bend into an L, as on chess sites: two squares along the
    // long side, then one square to the target.
    if ((Math.abs(dx) === 2 && Math.abs(dy) === 1) || (Math.abs(dx) === 1 && Math.abs(dy) === 2)) {
      const [cx, cy] = Math.abs(dx) === 2 ? [x2, y1] : [x1, y2];
      const ux = Math.sign(x2 - cx), uy = Math.sign(y2 - cy);
      const head = 0.42, width = 0.17, half = 0.3;
      const bx = x2 - ux * head, by = y2 - uy * head;
      const lx = Math.sign(cx - x1), ly = Math.sign(cy - y1);
      const sx = x1 + lx * 0.28, sy = y1 + ly * 0.28;
      svg.append(make("path", {
        d: "M" + round(sx) + "," + round(sy) + " L" + round(cx) + "," + round(cy) + " L" + round(bx) + "," + round(by),
        fill: "none", stroke: mark.color, "stroke-width": width, "stroke-linejoin": "miter", "stroke-opacity": 0.8,
      }));
      const px = -uy, py = ux;
      const tip = [[bx + px * half, by + py * half], [x2, y2], [bx - px * half, by - py * half]]
        .map(([a, b]) => round(a) + "," + round(b)).join(" ");
      svg.append(make("polygon", { points: tip, fill: mark.color, "fill-opacity": 0.8 }));
      continue;
    }
    const length = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / length, uy = (y2 - y1) / length;
    const head = 0.42, width = 0.17, half = 0.3;
    const bx = x2 - ux * head, by = y2 - uy * head;
    const sx = x1 + ux * 0.28, sy = y1 + uy * 0.28;
    const px = -uy, py = ux;
    const points = [
      [sx + px * width / 2, sy + py * width / 2], [bx + px * width / 2, by + py * width / 2],
      [bx + px * half, by + py * half], [x2, y2], [bx - px * half, by - py * half],
      [bx - px * width / 2, by - py * width / 2], [sx - px * width / 2, sy - py * width / 2],
    ].map(([a, b]) => (Math.round(a * 1000) / 1000) + "," + (Math.round(b * 1000) / 1000)).join(" ");
    svg.append(make("polygon", { points, fill: mark.color, "fill-opacity": 0.8 }));
  }
  element.append(svg);
}

function wireBoard(element) {
  if (element._wired) return;
  element._wired = true;
  let press;
  const endDrag = () => {
    if (!press) return;
    press.ghost?.remove();
    element.querySelector(".drag-origin")?.classList.remove("drag-origin");
    element.querySelector(".drag-over")?.classList.remove("drag-over");
    element.classList.remove("board-dragging");
    try { element.releasePointerCapture(press.pointerId); } catch { /* already released */ }
    press = undefined;
  };
  element.addEventListener("contextmenu", (event) => {
    if (element._board?.wired) event.preventDefault();
  });
  element.addEventListener("pointerdown", (event) => {
    const state = element._board;
    if (!state?.wired || press || event.target.closest(".promotion-picker")) return;
    const square = squareAt(element, event.clientX, event.clientY);
    if (!square) return;
    if (event.button === 2) {
      press = { kind: "mark", from: square, pointerId: event.pointerId };
      element.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0 || !event.isPrimary) return;
    clearBoardMarks(element);
    if (!state.onSquare && !state.onDrop) return;
    event.preventDefault();
    const piece = state.board.get(square);
    const movable = Boolean(state.onDrop) && piece?.color === state.board.turn();
    press = {
      kind: "piece", from: square, movable, pointerId: event.pointerId,
      wasSelected: state.selected === square, x: event.clientX, y: event.clientY,
    };
    element.setPointerCapture(event.pointerId);
    if (movable && state.selected !== square) state.onSquare?.(square);
  });
  element.addEventListener("pointermove", (event) => {
    if (!press || press.kind !== "piece" || !press.movable || event.pointerId !== press.pointerId) return;
    if (!press.ghost) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < 4) return;
      const cell = cellOf(element, press.from);
      const image = cell?.querySelector("img:not(.capture-ghost)");
      if (!image) return;
      const size = image.getBoundingClientRect().width;
      const ghost = image.cloneNode();
      ghost.className = "drag-piece";
      ghost.style.width = ghost.style.height = size + "px";
      document.body.append(ghost);
      press.ghost = ghost;
      press.size = size;
      cell.classList.add("drag-origin");
      element.classList.add("board-dragging");
    }
    press.ghost.style.transform = "translate(" + (event.clientX - press.size / 2) + "px," +
      (event.clientY - press.size / 2) + "px)";
    const over = squareAt(element, event.clientX, event.clientY);
    const current = element.querySelector(".drag-over");
    if (current?.dataset.square !== over) {
      current?.classList.remove("drag-over");
      if (over) cellOf(element, over)?.classList.add("drag-over");
    }
  });
  element.addEventListener("pointerup", (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const current = press;
    const state = element._board;
    const square = squareAt(element, event.clientX, event.clientY);
    endDrag();
    if (current.kind === "mark") {
      if (square) toggleMark(element, { from: current.from, to: square, color: markColor(event) });
      return;
    }
    if (current.ghost) {
      if (square && square !== current.from) {
        element.dataset.dropped = "1";
        state.onDrop?.(current.from, square);
        // An illegal drop leaves the position unchanged: no redraw, no flag.
        if (element.dataset.position === state.board.fen() && element._board === state)
          delete element.dataset.dropped;
      }
      return;
    }
    if (square !== current.from) return;
    if (!current.movable || current.wasSelected) state.onSquare?.(square);
  });
  element.addEventListener("pointercancel", endDrag);
  element.addEventListener("lostpointercapture", (event) => {
    if (press && event.pointerId === press.pointerId) endDrag();
  });
}

// On-board promotion picker: a column of four pieces over the promotion file.
// Resolves to "q", "n", "r", "b", or undefined when cancelled.
export function choosePromotion(element, square, color, flipped) {
  element.querySelector(".promotion-picker")?.remove();
  return new Promise((resolve) => {
    const picker = document.createElement("div");
    picker.className = "promotion-picker";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Promote pawn");
    const column = document.createElement("div");
    column.className = "promotion-column";
    const file = files.indexOf(square[0]);
    const atTop = (square[1] === "8") !== Boolean(flipped);
    column.style.left = ((flipped ? 7 - file : file) * 12.5) + "%";
    column.style[atTop ? "top" : "bottom"] = "0";
    if (!atTop) column.style.flexDirection = "column-reverse";
    const finish = (value) => {
      picker.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(undefined); }
    };
    const names = { q: "Queen", n: "Knight", r: "Rook", b: "Bishop" };
    for (const type of ["q", "n", "r", "b"]) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "promotion-choice";
      choice.setAttribute("aria-label", names[type]);
      const image = document.createElement("img");
      image.src = "./pieces/" + color + type.toUpperCase() + ".svg";
      image.alt = "";
      image.draggable = false;
      choice.append(image);
      choice.onclick = (event) => { event.stopPropagation(); finish(type); };
      column.append(choice);
    }
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "promotion-cancel";
    cancel.textContent = "Cancel";
    cancel.onclick = (event) => { event.stopPropagation(); finish(undefined); };
    column.append(cancel);
    picker.onpointerdown = (event) => {
      event.stopPropagation();
      if (event.target === picker) finish(undefined);
    };
    picker.append(column);
    element.append(picker);
    document.addEventListener("keydown", onKey, true);
    column.querySelector("button").focus({ preventScroll: true });
  });
}
