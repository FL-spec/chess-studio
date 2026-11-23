import { Chess } from "./vendor/chess.mjs";
import { analyze, score, uci } from "./engine.mjs";
import { drawBoard, moveVisual } from "./chess-view.mjs";
import { createArrowOverlay } from "./board-mark.mjs";

const params = new URLSearchParams(location.search);
const element = (id) => document.getElementById(id);
const boardElement = element("review-board");
const linesElement = element("review-lines");
const status = element("review-status");
const previous = element("previous-ply");
const next = element("next-ply");
const flipped = params.get("flipped") === "1";
const source = Number(params.get("source"));
const requestedDepth = Number(params.get("depth"));
const depth = [9, 12, 16].includes(requestedDepth) ? requestedDepth : 12;
const count = Number(params.get("lines")) === 5 ? 5 : 3;
const moves = [];
let selected = 0;
let ply = 0;

element("return-game").onclick = async () => {
  try {
    if (!source) throw Error();
    const tab = await chrome.tabs.update(source, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    status.textContent = "The original game tab is closed.";
  }
};

const { preferences } = await chrome.storage.local.get("preferences");
document.documentElement.dataset.theme = preferences?.theme || "system";
try {
  const game = new Chess(params.get("fen") || "");
  const fen = game.fen();

  function render() {
    const line = moves[selected] || [];
    const position = ply ? new Chess(line[ply - 1].after) : new Chess(fen);
    drawBoard(boardElement, position, { flipped, last: line[ply - 1] });
    if (line[ply]) {
      const arrow = createArrowOverlay(document, uci(line[ply]), "", flipped);
      arrow.classList.add("board-arrows");
      boardElement.append(arrow);
    }
    previous.disabled = ply === 0;
    next.disabled = ply >= line.length;
    const turn = position.turn() === "w" ? "White to move" : "Black to move";
    element("review-step").textContent = ply
      ? line[ply - 1].san + " · " + ply + " / " + line.length + " · " + turn
      : turn;
    [...linesElement.children].forEach((row, index) => {
      row.setAttribute("aria-pressed", String(index === selected));
    });
  }
  function step(delta) {
    const target = ply + delta;
    if (target < 0 || target > (moves[selected]?.length || 0)) return;
    ply = target;
    render();
  }
  previous.onclick = () => step(-1);
  next.onclick = () => step(1);
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      step(event.key === "ArrowLeft" ? -1 : 1);
    }
  });
  render();
  status.classList.add("analysis-progress");
  status.textContent = "Calculating continuations…";
  const lines = await analyze(game, { depth, count });
  for (const line of lines) {
    const position = new Chess(fen);
    const sequence = line.pv.slice(0, 8).map((move) => position.move(move));
    if (!sequence.length) continue;
    const index = moves.push(sequence) - 1;
    const button = document.createElement("button");
    button.className = "candidate-choice review-choice";
    button.type = "button";
    const evaluation = document.createElement("span");
    evaluation.className = "score";
    evaluation.textContent = score(line);
    button.append(...moveVisual(sequence[0], sequence.slice(1).map(move => move.san).join(" ")), evaluation);
    button.onclick = () => {
      selected = index;
      ply = 0;
      render();
    };
    linesElement.append(button);
  }
  const preferred = moves.findIndex(line => uci(line[0]) === params.get("move"));
  if (preferred >= 0) selected = preferred;
  status.classList.remove("analysis-progress");
  status.textContent = moves.length ? "" : "No continuation from this position.";
  render();
} catch {
  status.classList.remove("analysis-progress");
  status.textContent = "This position could not be reviewed.";
}
