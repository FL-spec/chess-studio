// Post-game review page: game-review.html?id=<review id> (record in
// chrome.storage.local "reviews") or ?pgn=<url-encoded PGN> for development.
import { Chess } from "./vendor/chess.mjs";
import { analyze } from "./engine.mjs";
import { drawBoard } from "./chess-view.mjs";
import { createArrowOverlay } from "./board-mark.mjs";
import { GRADES } from "./gamify.mjs";
import { coachFace, coachLine, MOOD_BY_GRADE, COACHES } from "./coaches.mjs";
import {
  REVIEW_DEPTH, SUMMARY_KEYS, analysePositions, gradeReviewMove, inferReason, packLines,
  parseGame, resultText, summarise, unpackLines, whiteEval,
} from "./game-analysis.mjs";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = globalThis.chrome?.storage?.local;
const BOOK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2.5A1.5 1.5 0 0 1 4.5 1H13v11H4.5a.5.5 0 0 0 0 1H13v2H4.5A1.5 1.5 0 0 1 3 13.5z"/></svg>';

const state = {
  record: null, start: "", moves: [], lines: [], evals: [], graded: [],
  ply: 0, flipped: false, coachId: "nova", variation: null, analysing: true,
};

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function icon(key, extra = "") {
  const grade = GRADES[key];
  if (!grade) return "";
  const symbol = key === "book" ? BOOK_ICON : escapeHtml(grade.symbol);
  return '<span class="gi g-' + key + (extra ? " " + extra : "") + '" aria-hidden="true">' + symbol + "</span>";
}
const article = (label) => (/^[AEIOU]/.test(label) ? "an " : "a ");
const playerName = (color) => (color === "w" ? state.record.white : state.record.black) || (color === "w" ? "White" : "Black");
const isYou = (color) => state.record.playerColor && state.record.playerColor === color;

// ---------- Loading ----------
async function loadRecord() {
  const pgn = params.get("pgn");
  if (pgn) return { id: null, pgn, start: params.get("start") || undefined, playerColor: ["w", "b"].includes(params.get("color")) ? params.get("color") : null };
  const id = params.get("id");
  if (!id || !store) return null;
  const { reviews = [] } = await store.get("reviews");
  return reviews.find((item) => String(item.id) === id) || null;
}
async function loadPreferences() {
  if (!store) return;
  const { preferences, websiteOptions } = await store.get(["preferences", "websiteOptions"]);
  document.documentElement.dataset.theme = params.get("theme") || preferences?.theme || "system";
  state.coachId = websiteOptions?.coachCharacter || "nova";
}
let saving = Promise.resolve();
function saveAnalysis(complete) {
  if (!store || !state.record.id) return;
  const analysis = { v: 1, depth: REVIEW_DEPTH, complete, lines: state.lines.map(packLines) };
  saving = saving.then(async () => {
    const { reviews = [] } = await store.get("reviews");
    const index = reviews.findIndex((item) => item.id === state.record.id);
    if (index < 0) return;
    reviews[index] = { ...reviews[index], analysis };
    await store.set({ reviews });
  }).catch(() => {});
}

// ---------- Derived data ----------
function onPosition(index, lines) {
  state.lines[index] = lines;
  state.evals[index] = whiteEval(state.start, state.moves, state.lines, index);
  // Grade every move that now has both positions analysed, in order.
  while (state.graded.length < state.moves.length) {
    const next = state.graded.length;
    let entry = null;
    try {
      entry = gradeReviewMove({ start: state.start, moves: state.moves, lines: state.lines, index: next, previous: state.graded[next - 1], playerColor: state.record.playerColor });
    } catch { /* an unusual engine line: leave the move ungraded */ }
    if (!entry) break;
    state.graded.push(entry);
  }
  const done = index + 1;
  const total = state.moves.length + 1;
  $("progress-bar").style.width = (100 * done / total).toFixed(1) + "%";
  $("progress-text").textContent = "Analysing " + Math.min(done, total) + " / " + total;
  if (index % 10 === 9) saveAnalysis(false);
  scheduleRender();
}
let frame = 0;
function scheduleRender() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; render(); });
}

// ---------- Rendering ----------
function render() {
  renderBoard();
  renderEvalBar();
  renderControls();
  renderSummary();
  renderGraph();
  renderCoach();
  renderMoves();
}

function renderPlayers() {
  const top = state.flipped ? "w" : "b";
  const strip = (color) => {
    const you = isYou(color) ? '<span class="gr-you">You</span>' : "";
    return '<span class="gr-dot gr-dot-' + color + '" aria-hidden="true"></span><span class="gr-player-name">' +
      escapeHtml(playerName(color)) + "</span>" + you;
  };
  $("player-top").innerHTML = strip(top);
  $("player-bottom").innerHTML = strip(top === "w" ? "b" : "w");
}

function renderBoard() {
  const board = $("board");
  const variation = state.variation;
  let position;
  let last;
  let arrow = "";
  let badge = null;
  if (variation) {
    last = variation.moves[variation.step - 1];
    position = new Chess(last ? last.after : variation.fen);
    const upcoming = variation.moves[variation.step];
    if (upcoming) arrow = upcoming.from + upcoming.to;
  } else {
    last = state.moves[state.ply - 1];
    position = new Chess(last ? last.after : state.start);
    const entry = state.graded[state.ply - 1];
    if (entry) {
      badge = { square: last.to, key: entry.grade.key };
      if (!entry.wasBest && entry.grade.key !== "book" && entry.grade.tone !== "best") arrow = entry.best;
    }
  }
  drawBoard(board, position, { flipped: state.flipped, last, check: true });
  board.querySelectorAll(".gr-badge").forEach((node) => node.remove());
  if (badge) {
    const cell = board.querySelector('[data-square="' + badge.square + '"]');
    if (cell) cell.insertAdjacentHTML("beforeend", icon(badge.key, "gr-badge" + (reduceMotion ? "" : " gr-pop")));
  }
  if (arrow) {
    const overlay = createArrowOverlay(document, arrow, "", state.flipped);
    overlay.classList.add("board-arrows");
    board.append(overlay);
  }
}

function evalText(index) {
  const value = state.evals[index];
  if (value == null) return "";
  const board = state.lines[index]?.[0];
  if (Math.abs(value) >= 9000) {
    if (!board) return value > 0 ? "1-0" : "0-1";
    return "M" + Math.abs(board.value);
  }
  return (value > 0 ? "+" : value < 0 ? "−" : "") + (Math.abs(value) / 100).toFixed(1);
}
// Share of the bar for White (0..1) from a White-side evaluation.
const whiteShare = (cp) => (cp == null ? 0.5 : Math.abs(cp) >= 9000 ? (cp > 0 ? 1 : 0) : 1 / (1 + Math.exp(-0.004 * cp)));

function renderEvalBar() {
  const index = state.variation ? state.ply : state.ply;
  const share = whiteShare(state.evals[index]);
  const fill = $("evalbar-fill");
  fill.style.height = (share * 100).toFixed(1) + "%";
  $("evalbar").classList.toggle("flipped", state.flipped);
  const label = $("evalbar-label");
  const text = evalText(index);
  label.textContent = text;
  label.classList.toggle("on-white", share >= 0.5);
  $("evalbar").setAttribute("aria-label", text ? "Evaluation " + text : "Evaluation pending");
}

function renderControls() {
  const n = state.moves.length;
  $("first").disabled = $("prev").disabled = !state.variation && state.ply === 0;
  $("next").disabled = $("last").disabled = state.variation
    ? state.variation.step >= state.variation.moves.length : state.ply >= n;
  if (state.variation) {
    $("step").textContent = "Best line · " + state.variation.step + " / " + state.variation.moves.length;
    return;
  }
  const move = state.moves[state.ply - 1];
  $("step").textContent = move
    ? Math.ceil(state.ply / 2) + (move.color === "w" ? ". " : "… ") + move.san
    : "Start";
}

function renderSummary() {
  const summary = summarise(state.graded);
  const accuracy = (color) => {
    const value = summary[color].accuracy;
    return '<div class="gr-acc gr-acc-' + color + '"><span class="gr-acc-name">' + escapeHtml(playerName(color)) +
      (isYou(color) ? ' <span class="gr-you">You</span>' : "") + "</span>" +
      '<span class="gr-acc-value">' + (value == null ? "–" : value.toFixed(1)) + "</span>" +
      '<span class="gr-acc-caption">Accuracy</span></div>';
  };
  const rows = SUMMARY_KEYS.filter((key) => summary.w.counts[key] || summary.b.counts[key]).map((key) =>
    '<div class="gr-count-row"><span class="gr-count gr-count-w">' + (summary.w.counts[key] || "") + "</span>" +
    '<span class="gr-count-label">' + icon(key) + GRADES[key].label + "</span>" +
    '<span class="gr-count gr-count-b">' + (summary.b.counts[key] || "") + "</span></div>").join("");
  $("summary").innerHTML = '<div class="gr-accs">' + accuracy("w") + accuracy("b") + "</div>" +
    (rows ? '<div class="gr-counts">' + rows + "</div>" : '<p class="gr-muted gr-small">Move grades appear as the analysis runs.</p>');
}

function renderGraph() {
  const n = state.moves.length;
  const width = 600;
  const height = 96;
  const x = (index) => (n ? (index / n) * width : 0);
  const y = (cp) => height / 2 - (Math.max(-1000, Math.min(1000, cp >= 9000 ? 1000 : cp <= -9000 ? -1000 : cp)) / 1000) * (height / 2);
  const points = [];
  for (let index = 0; index <= n; index += 1) {
    if (state.evals[index] == null) break;
    points.push(x(index).toFixed(1) + "," + y(state.evals[index]).toFixed(1));
  }
  const known = points.length;
  const area = known ? "M0," + height + " L" + points.join(" L") + " L" + x(known - 1).toFixed(1) + "," + height + " Z" : "";
  const line = known ? "M" + points.join(" L") : "";
  const cursor = x(state.ply);
  const pending = known <= n ? '<rect class="gr-graph-pending" x="' + x(Math.max(0, known - 1)).toFixed(1) + '" y="0" width="' + (width - x(Math.max(0, known - 1))).toFixed(1) + '" height="' + height + '"/>' : "";
  const svg = '<svg viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<rect class="gr-graph-black" x="0" y="0" width="' + width + '" height="' + height + '"/>' +
    (area ? '<path class="gr-graph-white" d="' + area + '"/>' : "") +
    pending +
    '<line class="gr-graph-mid" x1="0" x2="' + width + '" y1="' + height / 2 + '" y2="' + height / 2 + '"/>' +
    (line ? '<path class="gr-graph-line" d="' + line + '"/>' : "") +
    '<line class="gr-graph-cursor" x1="' + cursor + '" x2="' + cursor + '" y1="0" y2="' + height + '"/></svg>';
  // Dots in HTML so they stay round when the graph stretches.
  const dots = state.graded.filter((entry) => ["blunder", "mistake", "miss"].includes(entry.grade.key)).map((entry) => {
    const value = state.evals[entry.ply];
    if (value == null) return "";
    return '<button type="button" class="gr-graph-dot g-' + entry.grade.key + '" data-ply="' + entry.ply + '" style="left:' +
      (100 * entry.ply / n).toFixed(2) + "%;top:" + (100 * y(value) / height).toFixed(2) + '%" aria-label="' +
      escapeHtml(entry.move.san + ", " + entry.grade.label) + '" title="' + escapeHtml(entry.move.san + " · " + entry.grade.label) + '"></button>';
  }).join("");
  $("graph").innerHTML = svg + dots;
}

function moodFor(entry) {
  if (!entry) return "idle";
  if (entry.grade.key === "book") return "idle";
  if (state.record.playerColor && !entry.mine)
    return entry.grade.key === "blunder" ? "delighted" : entry.grade.key === "brilliant" ? "shocked" : "idle";
  return MOOD_BY_GRADE[entry.grade.key] || "idle";
}

function bestSan(entry) {
  try { return new Chess(entry.move.before).move(entry.best).san; } catch { return entry.best; }
}

function renderCoach() {
  const coach = COACHES.find((item) => item.id === state.coachId) || COACHES[0];
  const entry = state.graded[state.ply - 1];
  const move = state.moves[state.ply - 1];
  const { src, alt } = coachFace(coach.id, moodFor(entry));
  let head;
  let body;
  let actions = "";
  if (!move) {
    head = '<p class="gr-coach-title">Let’s look at your game</p>';
    body = state.analysing
      ? "I am going through every move. Step through the game while I work, or jump to a red dot on the graph."
      : keyMomentText();
  } else if (!entry) {
    head = '<p class="gr-coach-title">' + escapeHtml(move.san) + "</p>";
    body = "Still thinking about this move…";
  } else {
    const grade = entry.grade;
    const label = grade.label.toLowerCase();
    const title = escapeHtml(move.san) + (grade.key === "best" ? " is the best move"
      : grade.tone === "bad" || grade.tone === "warn" ? " is " + article(grade.label) + label
      : " is " + article(grade.label) + label + " move");
    head = '<p class="gr-coach-who">' + (isYou(move.color) ? "You" : escapeHtml(playerName(move.color))) +
      " · " + (move.color === "w" ? "White" : "Black") + "</p>" +
      '<p class="gr-coach-title">' + icon(grade.key) + "<span>" + title + "</span></p>";
    const line = coachLine(entry, coach.id);
    body = grade.key === "book"
      ? (line.quiet ? "Known opening theory: " + escapeHtml(grade.opening || "Opening theory") + "." : escapeHtml(line.text))
      : escapeHtml(line.text || entry.commentary?.reason || "");
    const notBest = !entry.wasBest && grade.key !== "book" && grade.tone !== "best";
    if (notBest) {
      const showing = state.variation?.from === state.ply;
      actions = '<div class="gr-best"><span>Best was <strong>' + escapeHtml(bestSan(entry)) + "</strong></span>" +
        (showing
          ? '<button type="button" class="gr-btn" id="back-line">Back</button>'
          : '<button type="button" class="gr-btn gr-btn-primary" id="show-line">Show</button>') + "</div>";
      if (showing) actions += '<p class="gr-line">' + state.variation.moves.map((item, index) =>
        '<span class="' + (index === state.variation.step - 1 ? "on" : "") + '">' + escapeHtml(item.san) + "</span>").join(" ") + "</p>";
    }
  }
  $("coach").innerHTML = '<img class="gr-face" src="' + src + '" alt="' + escapeHtml(alt) + '" width="64" height="64" draggable="false">' +
    '<div class="gr-coach-body">' + head + '<p class="gr-coach-text">' + body + "</p>" + actions + "</div>";
  $("show-line")?.addEventListener("click", showLine);
  $("back-line")?.addEventListener("click", closeLine);
}

function keyMomentText() {
  const worst = state.graded.filter((entry) => entry.grade.tone === "bad" && (state.record.playerColor ? entry.mine : true));
  if (!worst.length) return "A clean game: no mistakes or blunders. Use the arrows to walk through it.";
  const first = worst[0];
  const number = Math.ceil(first.ply / 2) + (first.move.color === "w" ? "." : "…");
  return "The key moment was " + number + " " + first.move.san + ". Press → to step through, or click a red dot on the graph.";
}

let lastMovesPly = -1;
function renderMoves() {
  const rows = [];
  for (let index = 0; index < state.moves.length; index += 2) {
    const cell = (offset) => {
      const move = state.moves[index + offset];
      if (!move) return '<span class="gr-move gr-move-empty"></span>';
      const ply = index + offset + 1;
      const entry = state.graded[ply - 1];
      return '<button type="button" class="gr-move' + (ply === state.ply ? " on" : "") + '" data-ply="' + ply + '" aria-current="' +
        (ply === state.ply ? "step" : "false") + '" aria-label="' + escapeHtml(move.san + (entry ? ", " + entry.grade.label : "")) + '">' +
        '<span class="gr-move-icon">' + (entry ? icon(entry.grade.key) : "") + "</span>" + escapeHtml(move.san) + "</button>";
    };
    rows.push('<div class="gr-move-row" role="listitem"><span class="gr-move-no">' + (index / 2 + 1) + ".</span>" + cell(0) + cell(1) + "</div>");
  }
  const container = $("moves");
  container.innerHTML = rows.join("");
  if (lastMovesPly !== state.ply) {
    lastMovesPly = state.ply;
    const active = container.querySelector(".gr-move.on");
    if (active) {
      const top = active.offsetTop - container.offsetTop;
      if (top < container.scrollTop || top > container.scrollTop + container.clientHeight - active.offsetHeight)
        container.scrollTo({ top: Math.max(0, top - container.clientHeight / 2), behavior: "auto" });
    }
  }
}

// ---------- Navigation ----------
function go(ply) {
  closeLine(false);
  state.ply = Math.max(0, Math.min(state.moves.length, ply));
  render();
}
function step(delta) {
  if (state.variation) {
    const target = state.variation.step + delta;
    if (target < 0) return closeLine();
    if (target > state.variation.moves.length) return;
    stopAutoplay();
    state.variation.step = target;
    render();
    return;
  }
  go(state.ply + delta);
}
let autoplay = 0;
function stopAutoplay() {
  clearInterval(autoplay);
  autoplay = 0;
}
function showLine() {
  const entry = state.graded[state.ply - 1];
  if (!entry) return;
  const game = new Chess(entry.move.before);
  const moves = [];
  for (const uci of entry.bestLine) {
    try { moves.push(game.move(uci)); } catch { break; }
  }
  if (!moves.length) return;
  state.variation = { from: state.ply, fen: entry.move.before, moves, step: 1 };
  render();
  stopAutoplay();
  if (!reduceMotion) autoplay = setInterval(() => {
    if (!state.variation || state.variation.step >= state.variation.moves.length) return stopAutoplay();
    state.variation.step += 1;
    render();
  }, 1100);
}
function closeLine(redraw = true) {
  stopAutoplay();
  if (!state.variation) return;
  state.variation = null;
  if (redraw) render();
}

function wire() {
  $("first").onclick = () => (state.variation ? closeLine() : go(0));
  $("prev").onclick = () => step(-1);
  $("next").onclick = () => step(1);
  $("last").onclick = () => (state.variation ? step(state.variation.moves.length - state.variation.step) : go(state.moves.length));
  $("flip").onclick = () => {
    state.flipped = !state.flipped;
    renderPlayers();
    render();
  };
  $("moves").addEventListener("click", (event) => {
    const button = event.target.closest("[data-ply]");
    if (button) go(Number(button.dataset.ply));
  });
  $("graph").addEventListener("click", (event) => {
    const dot = event.target.closest("[data-ply]");
    if (dot) return go(Number(dot.dataset.ply));
    const rect = $("graph").getBoundingClientRect();
    go(Math.round(((event.clientX - rect.left) / rect.width) * state.moves.length));
  });
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.("input, textarea, select")) return;
    const action = { ArrowLeft: () => step(-1), ArrowRight: () => step(1), Home: () => go(0), End: () => go(state.moves.length), Escape: () => closeLine() }[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  });
}

function fail(message) {
  $("main").hidden = true;
  const error = $("error");
  error.hidden = false;
  error.textContent = message;
}

async function main() {
  await loadPreferences().catch(() => {});
  const record = await loadRecord().catch(() => null);
  if (!record) return fail("This game could not be found. Open the review again from the panel.");
  let parsed;
  try { parsed = parseGame(record.pgn, record.start); } catch { return fail("This game could not be read."); }
  const headers = parsed.headers || {};
  const clean = (value) => (value && value !== "?" ? value : "");
  state.record = {
    ...record,
    white: record.white || clean(headers.White) || "White",
    black: record.black || clean(headers.Black) || "Black",
    result: record.result || headers.Result || "*",
    playerColor: ["w", "b"].includes(record.playerColor) ? record.playerColor : null,
  };
  state.start = parsed.start;
  state.moves = parsed.moves;
  state.flipped = state.record.playerColor === "b";
  const reason = record.reason || inferReason(parsed.start, parsed.moves);
  $("title").innerHTML = "<span>" + escapeHtml(state.record.white) + '</span><span class="gr-vs">vs</span><span>' + escapeHtml(state.record.black) + "</span>";
  const result = resultText(state.record.result, reason, state.record.playerColor);
  $("result").textContent = result;
  $("result").dataset.outcome = /You won/.test(result) ? "win" : /You lost/.test(result) ? "loss" : "neutral";
  const date = record.date ? new Date(record.date) : null;
  $("meta").textContent = [
    state.moves.length ? Math.ceil(state.moves.length / 2) + " moves" : "",
    record.site ? String(record.site).replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : "",
    date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "",
  ].filter(Boolean).join(" · ");
  document.title = state.record.white + " vs " + state.record.black + " · Game review";
  $("main").hidden = false;
  wire();
  renderPlayers();
  state.ply = 0;
  render();

  const controller = new AbortController();
  addEventListener("pagehide", () => controller.abort());
  const cached = record.analysis?.v === 1 && record.analysis.depth >= REVIEW_DEPTH ? record.analysis.lines.map(unpackLines) : [];
  // Empty cached lists are searched again (terminal positions are skipped anyway).
  const known = cached.map((lines) => (lines.length ? lines : undefined));
  try {
    await analysePositions({ start: state.start, moves: state.moves, analyze, depth: REVIEW_DEPTH, signal: controller.signal, known, onPosition });
    state.analysing = false;
    $("progress").classList.add("done");
    $("progress-text").textContent = "Analysis complete";
    if (!record.analysis?.complete) saveAnalysis(true);
    render();
  } catch (error) {
    if (controller.signal.aborted) return;
    state.analysing = false;
    $("progress-text").textContent = "The analysis stopped. Reload the page to try again.";
    render();
  }
}

main();
