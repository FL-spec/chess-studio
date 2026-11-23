export function isFlipped(board) {
  const bounds = board.getBoundingClientRect();
  return (
    board.matches('.flipped, [flipped], [orientation="black"]') ||
    Boolean(board.closest(".orientation-black, .board-flipped")) ||
    (bounds.width > 0 && orientationFromPieces(board, bounds))
  );
}

export function createArrowOverlay(document, move, reply, flipped) {
  return createLineOverlay(document, [{ move, reply }], flipped);
}

const MOVE_COLOR = "#2375ed";
const REPLY_COLOR = "#e89b26";
const SHADOW = "#0b1220";

export function createLineOverlay(document, lines, flipped) {
  const center = (square) => {
    const file = square.charCodeAt(0) - 97;
    const row = 8 - Number(square[1]);
    return [flipped ? 7.5 - file : file + 0.5, flipped ? 7.5 - row : row + 0.5];
  };
  const ns = "http://www.w3.org/2000/svg";
  const overlay = document.createElementNS(ns, "svg");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("viewBox", "0 0 8 8");
  const make = (tag, attributes) => {
    const element = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  };
  const fixed = (value) => Math.round(value * 1000) / 1000;
  const animate = Boolean(document.defaultView?.matchMedia("(prefers-reduced-motion: no-preference)").matches);
  const at = ([x, y]) => fixed(x) + " " + fixed(y);
  // One arrow = subtle origin square, a soft under-shape for contrast on any board, then the arrow.
  function appendArrow(move, kind, rank) {
    const color = kind === "reply" ? REPLY_COLOR : MOVE_COLOR;
    const [x1, y1] = center(move.slice(0, 2));
    const [x2, y2] = center(move.slice(2, 4));
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const dx = (x2 - x1) / length;
    const dy = (y2 - y1) / length;
    const nx = -dy;
    const ny = dx;
    const scale = Math.max(0.62, 1 - rank * 0.14) * (kind === "reply" ? 0.84 : 1);
    const along = (base, distance, side = 0) => [
      base[0] + dx * distance + nx * side,
      base[1] + dy * distance + ny * side,
    ];
    const start = along([x1, y1], 0.2);
    const tip = along([x2, y2], -0.08);
    const headLength = 0.4 * scale;
    const headWidth = 0.29 * scale;
    const base = along(tip, -headLength);
    const tail = 0.065 * scale;
    const neck = 0.1 * scale;
    const body =
      "M" + at(along(start, 0, tail)) + "L" + at(along(base, 0.05, neck)) +
        "L" + at(along(base, 0, headWidth)) + "L" + at(tip) + "L" + at(along(base, 0, -headWidth)) +
        "L" + at(along(base, 0.05, -neck)) + "L" + at(along(start, 0, -tail)) +
        "A" + fixed(tail) + " " + fixed(tail) + " 0 0 0 " + at(along(start, 0, tail)) + "Z";
    const arrow = make("g", { opacity: fixed(Math.max(0.45, 0.96 - rank * 0.17) * (kind === "reply" ? 0.88 : 1)) });
    arrow.dataset.move = move;
    arrow.dataset.kind = kind;
    arrow.dataset.rank = String(rank);
    if (rank === 0 && kind === "move") {
      arrow.append(make("rect", {
        x: fixed(x1 - 0.5), y: fixed(y1 - 0.5), width: 1, height: 1,
        fill: color, "fill-opacity": "0.2",
      }));
    }
    const shadow = make("g", { transform: "translate(0 0.03)", fill: SHADOW, stroke: SHADOW,
      opacity: "0.26", "stroke-linejoin": "round", "stroke-linecap": "round" });
    shadow.append(make("path", { d: body, "stroke-width": "0.07" }));
    arrow.append(shadow);
    arrow.append(make("path", { d: body, fill: color, stroke: color, "stroke-width": "0.02",
      "stroke-linejoin": "round" }));
    overlay.append(arrow);
    if (animate)
      arrow.animate?.([
        { transform: "translate(" + fixed(x1 - tip[0]) * 0.6 + "px," + fixed(y1 - tip[1]) * 0.6 + "px)", opacity: 0 },
        { transform: "none", opacity: 1 },
      ], { duration: 220, delay: rank * 40, easing: "cubic-bezier(.2,.7,.2,1)", fill: "backwards" });
  }
  for (const kind of ["reply", "move"]) {
    const drawn = new Map();
    for (const line of lines) {
      const move = line[kind];
      const path = move?.slice(0, 4);
      if (path && !drawn.has(path)) drawn.set(path, move);
    }
    // Lower ranks first so the best line sits on top.
    const ranked = Array.from(drawn.values());
    for (let rank = ranked.length - 1; rank >= 0; rank -= 1) appendArrow(ranked[rank], kind, rank);
  }
  return overlay;
}

export function drawMark(board, lines) {
  const document = board.ownerDocument;
  const bounds = board.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const flipped = isFlipped(board);
  const overlay = createLineOverlay(document, lines, flipped);
  overlay.setAttribute("data-chess-studio-mark", "");
  Object.assign(overlay.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483000",
  });
  function position() {
    const rect = board.getBoundingClientRect();
    Object.assign(overlay.style, {
      left: rect.left + "px",
      top: rect.top + "px",
      width: rect.width + "px",
      height: rect.height + "px",
    });
  }
  position();
  document.body.append(overlay);
  return { overlay, position, flipped };
}
function orientationFromPieces(board, bounds) {
  for (const piece of board.querySelectorAll(".piece")) {
    const coordinate = Array.from(piece.classList).find((token) =>
      /^square-[1-8][1-8]$/.test(token),
    );
    if (!coordinate) continue;
    const rect = piece.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.width > bounds.width / 4) continue;
    const file = Math.floor(
      ((rect.left + rect.width / 2 - bounds.left) / bounds.width) * 8,
    );
    if (file === 8 - Number(coordinate.at(-2))) return true;
    if (file === Number(coordinate.at(-2)) - 1) return false;
  }
  return false;
}
