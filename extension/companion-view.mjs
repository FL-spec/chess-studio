import { moveEvidence } from "./analysis-evidence.mjs";
import { createLineOverlay } from "./board-mark.mjs";
import { drawBoard, explain, moveVisual } from "./chess-view.mjs";
import { spokenName } from "./book.mjs";
import { Chess } from "./vendor/chess.mjs";
import { score, uci } from "./engine.mjs";
import { coachLine, coachPortrait, coachSound, latestReaction } from "./coaches.mjs";
import { proLines, proMetric, proStyle } from "./pro-lines.mjs";
import { moveAccuracy } from "./gamify.mjs";
// Display preferences shared with the Studio settings (UI-only).
function applyDisplayPreferences(prefs = {}) {
  Object.assign(document.documentElement.dataset, {
    board: prefs.board || "slate", motion: prefs.motion || "full",
    badges: prefs.badges === false ? "hide" : "show", celebrate: prefs.celebrate === false ? "off" : "on",
  });
}
let coachId = "nova";
let miniOpen = true;
let guideOpen = false;
const percent = (value) => Math.round(value * 100) + "%";
// What the current analysis mode does, in a few short sentences.
function modeGuide(view, lens) {
  const ratings = view.modelRatings;
  const mover = view.fen?.split(" ")[1] === "b" ? "b" : "w";
  const self = ratings?.[mover];
  const opponent = ratings?.[mover === "w" ? "b" : "w"];
  const level = self ? " Level: " + self + (opponent && opponent !== self ? " against " + opponent : "") +
    (ratings?.source === "page" ? " (from the game)." : ".") : "";
  const outcome = lens === "pro" ? view.pro?.outcome : view.humanOutcome;
  const chances = outcome ? " Expected score: " + percent(outcome.score) + "." : "";
  if (lens === "human")
    return "The moves players at this level usually play. The % shows how often they play each one." + level + chances;
  if (lens === "pro") {
    const style = proStyle(view.proStyle);
    return "The best move a human would really play. Stockfish checks the popular moves and keeps those close to the best (within " +
      percent(style.tolerance) + "). Balance: " + style.label + "." + level + chances;
  }
  return "Stockfish's best moves. Scores are in pawns for the side to move. Depth " +
    (view.targetDepth || view.candidates?.[0]?.depth || "–") + ".";
}
if (globalThis.chrome?.storage?.local) {
  chrome.storage.local.get(["preferences", "websiteOptions"]).then(({ preferences, websiteOptions }) => {
    applyDisplayPreferences(preferences);
    coachId = websiteOptions?.coachCharacter || coachId;
    miniOpen = websiteOptions?.miniBoard !== false;
  }, () => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.preferences) applyDisplayPreferences(changes.preferences.newValue);
    if (changes.websiteOptions) {
      coachId = changes.websiteOptions.newValue?.coachCharacter || "nova";
      miniOpen = changes.websiteOptions.newValue?.miniBoard !== false;
    }
  });
}
async function setWebsiteOption(key, value) {
  const { websiteOptions = {} } = await chrome.storage.local.get("websiteOptions");
  await chrome.storage.local.set({ websiteOptions: { ...websiteOptions, [key]: value } });
}
function viewToggle(current) {
  const group = document.createElement("div");
  group.className = "segmented view-toggle";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "Panel mode");
  for (const [value, title, hint] of [["moves", "Coach", "Shows the best moves and arrows, and reacts to your moves."],
    ["reactions", "Commentator", "Hides suggestions and comments on every move you play."]]) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "radio");
    item.setAttribute("aria-checked", String(value === current));
    item.textContent = title;
    item.title = hint;
    item.onclick = () => {
      if (value === current) return;
      for (const other of group.children) other.setAttribute("aria-checked", String(other === item));
      setWebsiteOption("view", value).catch(() => {});
    };
    group.append(item);
  }
  return group;
}
// Accuracy of the user's moves this session, per tab (UI-side only).
// Commentator: one persistent element per game tab. Redraws reuse it, so
// nothing flickers; only a changed expression and new comments animate.
let commentary = null;
let currentStep = null;
let replayMemory = { key: "", cursor: 0 };
if (globalThis.document && document.body?.classList.contains("website")) {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (!currentStep) return;
    event.preventDefault();
    currentStep(event.key === "ArrowLeft" ? -1 : 1);
  });
}
let portraitReplay = 0;
const reducedMotion = () => document.documentElement.dataset.motion === "reduced" ||
  matchMedia("(prefers-reduced-motion: reduce)").matches;
function animate(element, keyframes, options) {
  if (!reducedMotion()) element.animate?.(keyframes, options);
}
function buildCommentary(source) {
  const root = document.createElement("section");
  root.className = "commentary";
  root.setAttribute("aria-live", "polite");
  const stage = document.createElement("div");
  stage.className = "cm-stage";
  const figure = document.createElement("div");
  figure.className = "cm-figure";
  stage.append(figure);
  const more = document.createElement("button");
  more.type = "button";
  more.className = "cm-more";
  more.hidden = true;
  const feed = document.createElement("ol");
  feed.className = "cm-feed";
  const stats = describe("", "cm-stats");
  stage.append(stats);
  const status = describe("", "cm-status");
  root.append(stage, more, feed, status);
  const state = { source, root, figure, feed, status, stats, more, mood: "", coach: "", keys: new Map(), expanded: false };
  more.onclick = () => { state.expanded = !state.expanded; layoutFeed(state); };
  return state;
}
async function setMood(state, mood, moveKey) {
  const animated = !reducedMotion();
  if (state.mood === mood && state.coach === coachId &&
      state.moveKey === moveKey && state.animated === animated) return;
  Object.assign(state, { mood, coach: coachId, moveKey, animated });

  const face = document.createElement("div");
  face.className = "cm-face";
  const replay = animated && mood !== "idle" ? ++portraitReplay : 0;
  face.innerHTML = coachPortrait(coachId, mood, { animated, replay });
  state.pendingFace = face;
  try {
    await face.firstElementChild.decode();
  } catch {
    return;
  }
  if (state.pendingFace !== face) return;

  state.figure.replaceChildren(face);
  state.root.dataset.mood = mood;
}
// Reactions: only moves that matter, after a short, slightly random pause
// (as if the coach watched the move), held for a few seconds, then back to
// idle. Each move reacts once; redraws never replay it.
const REACTION_HOLD = 4200;
function react(state, found, onShow) {
  const key = found ? found.entry.move.after + "|" + found.mood : "";
  if (state.reactKey === key) {
    // Same move: only refresh the portrait if the motion preference changed.
    if (state.mood) setMood(state, state.mood, state.moveKey);
    return;
  }
  state.reactKey = key;
  clearTimeout(state.reactTimer);
  if (!found) {
    setMood(state, "idle", "");
    onShow?.(null);
    return;
  }
  const delay = reducedMotion() ? 0 : 600 + Math.random() * 500;
  state.reactTimer = setTimeout(() => {
    setMood(state, found.mood, key);
    onShow?.(found.entry);
    state.reactTimer = setTimeout(() => setMood(state, "idle", key), REACTION_HOLD);
  }, delay);
}
function commentItem(entry) {
  const { grade, move, mine, commentary } = entry;
  const item = document.createElement("li");
  item.className = "cm-item";
  item.dataset.tone = grade.tone;
  if (!mine) item.dataset.opponent = "";
  const head = document.createElement("div");
  head.className = "cm-head";
  const who = describe(mine ? "You" : "Opponent", "cm-who", "span");
  const badge = document.createElement("span");
  badge.className = "grade-badge";
  badge.dataset.tone = grade.tone;
  badge.append(describe(grade.symbol, "grade-symbol", "span"), describe(move.san + " · " + grade.label, "", "span"));
  head.append(who, badge);
  const line = coachLine(entry, coachId);
  item.append(head, describe(line.quiet ? "A main-line move in the " + (spokenName(entry.grade.opening) || "opening") + "." : line.text, "cm-say"));
  if (line.extra) item.append(describe(line.extra, "cm-example"));
  return item;
}
const VISIBLE = 3;
function layoutFeed(state) {
  const items = [...state.feed.children];
  const hidden = state.expanded ? 0 : Math.max(0, items.length - VISIBLE);
  items.forEach((node, index) => { node.hidden = index < hidden; });
  state.feed.toggleAttribute("data-faded", hidden > 0);
  const earlier = Math.max(0, items.length - VISIBLE);
  state.more.hidden = earlier === 0;
  const label = state.expanded ? "Show fewer" : "Show " + earlier + " earlier " + (earlier === 1 ? "move" : "moves");
  if (state.more.textContent !== label) state.more.textContent = label;
}
function reactionCard(view) {
  if (!commentary || commentary.source !== view.source) commentary = buildCommentary(view.source);
  const state = commentary;
  const history = view.gradeHistory || [];
  if (!state.reactKey && !state.mood) setMood(state, "idle", "");
  react(state, latestReaction(history));
  // Drop comments for moves no longer on the board (takebacks, new game).
  const live = new Set(history.map((entry) => entry.move.after));
  for (const [key, node] of state.keys) if (!live.has(key)) { node.remove(); state.keys.delete(key); }
  for (const entry of history) {
    const key = entry.move.after;
    if (state.keys.has(key)) continue;
    const item = commentItem(entry);
    state.keys.set(key, item);
    state.feed.append(item);
    // A short pause makes the commentator feel like it watched the move.
    animate(item, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }],
      { duration: 320, delay: entry.mine ? 350 : 550, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
    if (entry.celebrate && document.documentElement.dataset.celebrate !== "off")
      item.dataset.celebrate = "";
  }
  layoutFeed(state);
  const mine = history.filter((entry) => entry.mine);
  const statsText = mine.length
    ? "Accuracy " + Math.round(mine.reduce((sum, entry) => sum + moveAccuracy(entry.grade.loss), 0) / mine.length) + "%" +
      (view.streak >= 2 ? " · " + view.streak + " in a row" : "")
    : "";
  if (state.stats.textContent !== statsText) state.stats.textContent = statsText;
  const yourTurn = !view.playerColor || view.playerColor === new Chess(view.fen).turn();
  const text = !history.length ? (yourTurn ? "Play a move and I’ll react." : "Waiting for your opponent…")
    : yourTurn ? "Your move." : "Waiting for your opponent…";
  if (state.status.textContent !== text) state.status.textContent = text;
  return state.root;
}
// Coach mode: the same coach and words as Commentator, in a compact strip.
// The face reacts only to moves that matter; the bubble always says something
// short: a comment on your move, the opening name for book moves, or a sound.
let coachStrip = null;
function coachReaction(view) {
  const history = view.gradeHistory || [];
  if (!coachStrip || coachStrip.source !== view.source) {
    const root = document.createElement("section");
    root.className = "coach-react";
    root.setAttribute("aria-live", "polite");
    const figure = document.createElement("div");
    figure.className = "cm-figure coach-react-figure";
    const bubble = document.createElement("div");
    bubble.className = "coach-react-bubble";
    root.append(figure, bubble);
    coachStrip = { source: view.source, root, figure, bubble, mood: "", coach: "", say: "" };
    setMood(coachStrip, "idle", "");
  }
  const state = coachStrip;
  react(state, latestReaction(history));
  // What to say: the latest reaction, else your latest move (within the last 2 plies).
  const lastPly = history.at(-1)?.ply ?? -1;
  const latest = history.at(-1);
  const found = latestReaction(history)?.entry ||
    [...history].reverse().find((entry) => entry.mine && lastPly - entry.ply < 2 && entry.grade.key !== "book") ||
    (latest?.grade.key === "book" ? latest : null);
  const line = found ? coachLine(found, coachId) : null;
  const sound = !line || line.quiet;
  const say = (line ? line.label + "|" + line.text : "") + "|" + lastPly + "|" + coachId;
  if (state.say !== say) {
    state.say = say;
    const parts = [];
    if (sound) {
      state.sound = line?.text || (lastPly < 0 ? "…" : coachSound(coachId, lastPly, state.sound));
      const text = describe(state.sound, "coach-react-idle");
      text.setAttribute("aria-hidden", "true");
      parts.push(text);
    } else {
      parts.push(describe(line.text, "coach-react-say"));
      if (line.extra) parts.push(describe(line.extra, "coach-react-extra"));
    }
    state.root.toggleAttribute("data-speaking", !sound);
    state.bubble.replaceChildren(...parts);
    animate(state.bubble, [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }],
      { duration: 260, delay: 450 + Math.random() * 450, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
  }
  return state.root;
}
export function describe(text, cls, tag = "p") {
  const element = document.createElement(tag);
  element.textContent = text;
  if (cls) element.className = cls;
  return element;
}
export function evaluationMeter(board, leading) {
  const whiteScore = leading.value * (board.turn() === "w" ? 1 : -1);
  const outcomes = leading.wdl;
  const whiteWin = outcomes?.[board.turn() === "w" ? 0 : 2];
  // Encode pawn advantage directly. Engine self-play WDL saturates much earlier.
  const percentage = leading.type === "mate"
    ? (whiteScore > 0 ? 100 : 0)
    : 50 + 49 * whiteScore / (Math.abs(whiteScore) + 300);
  const evaluation = document.createElement("div");
  evaluation.className = "eval";
  const meter = document.createElement("meter");
  meter.min = 0;
  meter.max = 100;
  meter.value = percentage;
  meter.setAttribute(
    "aria-label",
    "Stockfish evaluation balance from White’s perspective",
  );
  meter.setAttribute("aria-valuetext", score({ ...leading, value: whiteScore }) + " for White");
  if (outcomes) meter.title = "White: " + (whiteWin / 10) + "% win · " + (outcomes[1] / 10) + "% draw · " +
    ((1000 - whiteWin - outcomes[1]) / 10) + "% loss";
  const whiteLine = { ...leading, value: whiteScore };
  evaluation.append(
    describe("White evaluation", "muted", "span"),
    meter,
    describe(score(whiteLine), "score", "span"),
  );
  return evaluation;
}
export function renderScanning(container, title, detail) {
  const box = document.createElement("section");
  box.className = "scanning";
  box.setAttribute("role", "status");
  const motif = document.createElement("div");
  motif.className = "scan-board";
  motif.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 9; index += 1) motif.append(document.createElement("i"));
  const knight = document.createElement("img");
  knight.src = "pieces/wN.svg";
  knight.alt = "";
  knight.className = "scan-knight";
  motif.append(knight);
  box.append(motif, describe(title, "scan-title", "h2"), describe(detail, "scan-detail"));
  container.replaceChildren(box);
  return box;
}
function gradeBadge(view) {
  const grade = (view.myGrade || view.oppGrade)?.grade || view.grade;
  const badge = document.createElement("span");
  badge.className = "grade-badge";
  badge.dataset.grade = grade.key;
  badge.dataset.tone = grade.tone;
  badge.setAttribute("role", "status");
  const entry = view.myGrade || view.oppGrade;
  const san = entry?.move.san || view.last?.san || "";
  badge.title = grade.key === "book" ? san + " is a book move" + (grade.opening ? " in the " + grade.opening : "") + "."
    : san + " was " + grade.label.toLowerCase() + ".";
  const who = view.playerColor ? (view.myGrade ? "Your " : "Their ") : "";
  badge.append(describe(grade.symbol, "grade-symbol", "span"), describe(who + san + " · " + grade.label, "", "span"));
  if (view.gradeCelebrate && view.myGrade && view.gradeMove?.after === view.myGrade.move.after) badge.dataset.celebrate = "";
  return badge;
}
// "Premove Nxd4 · safe against all 23 replies": shown while the opponent thinks.
function premoveChip(view) {
  const found = view.premove;
  if (!found || view.reactionsOnly) return null;
  const chip = document.createElement("div");
  chip.className = "premove-chip";
  chip.setAttribute("role", "status");
  chip.title = "Stockfish checked this premove against every legal reply. It is the best move after " +
    percent(found.coverage) + " of the likely replies and never loses more than " + percent(found.worstLoss || 0) +
    " of the winning chances." + (found.cancelled ? " After " + found.cancelled + " other replies it is illegal, so the site cancels it." : "");
  chip.append(describe("", "premove-icon", "span"), describe("Premove " + found.san, "premove-move", "strong"),
    describe("Checked against all " + found.replies + " replies", "premove-detail", "span"));
  return chip;
}
function action(text, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.onclick = handler;
  return button;
}
function playerLabel(view, color, toMove, onClick) {
  const side = color === "w" ? "White" : "Black";
  const role = view.playerColor ? (color === view.playerColor ? "You" : "Opponent") : side;
  const name = view.names?.[color];
  const player = onClick ? action("", onClick) : document.createElement("div");
  player.className = "board-player";
  player.dataset.color = color;
  if (color === toMove) player.dataset.active = "";
  player.title = (name || role) + " · " + (role !== side ? role + " · " : "") + side;
  player.append(describe("", "board-player-chip", "span"), describe(name || role, "board-player-name", "strong"));
  if (name || role !== side)
    player.append(describe(name && role !== side ? role + " · " + side : side, "board-player-role", "span"));
  return player;
}

// Redraw memory: companion.mjs rebuilds the DOM on every engine depth, so the
// view remembers what it last showed and only animates real changes.
const stable = { badge: "", choice: "", mini: "", rows: 3 };
function markStatic(element, slot, signature) {
  if (stable[slot] === signature) element.dataset.static = "";
  stable[slot] = signature;
}

export function renderCompanion(container, board, view, actions = {}) {
  // Looping indicators keep their phase across redraws instead of restarting.
  document.documentElement.style.setProperty("--now", String(Math.round(performance.now())));
  const studio = document.body.classList.contains("website");
  const isWebsite = view.mode === "website";
  const state = view.controls;
  const turn = board.turn();
  const other = turn === "w" ? "b" : "w";
  const sideToMove = turn === "w" ? "White to move" : "Black to move";
  const header = document.createElement("header");
  header.className = "position-heading";
  const title = describe(view.terminal || sideToMove, "companion-heading", "h1");
  if (!view.terminal) title.dataset.turn = turn;
  const turnRow = document.createElement("div");
  turnRow.className = "turn-row";
  turnRow.append(title);
  if (isWebsite && view.playerColor && !view.terminal) {
    const mine = turn === view.playerColor;
    const owner = describe(mine ? "Your turn" : "Opponent’s turn", "turn-owner", "span");
    if (mine) owner.dataset.mine = "";
    turnRow.append(owner);
  }
  header.append(turnRow);
  if (view.myGrade || view.oppGrade) {
    const progress = document.createElement("div");
    progress.className = "game-progress";
    const badge = gradeBadge(view);
    markStatic(badge, "badge", badge.dataset.grade + "|" + badge.textContent);
    progress.append(badge);
    if (view.streak >= 2) {
      const streak = describe(view.streak + " in a row", "streak", "span");
      streak.title = "Best or excellent moves in a row";
      progress.append(streak);
    }
    header.append(progress);
  }
  const premove = premoveChip(view);
  if (premove) header.append(premove);
  if (studio && actions.back) {
    const back = action("Back to game", actions.back);
    back.className = "studio-back";
    header.append(back);
  }
  if (!studio && isWebsite && !view.bullet) container.prepend(viewToggle(view.reactionsOnly ? "reactions" : "moves"));
  container.append(header);
  // The footer's Open Studio button is quieter in Commentator mode.
  if (!studio && isWebsite) document.body.toggleAttribute("data-commentator", Boolean(view.reactionsOnly));
  if (!studio && isWebsite && view.reactionsOnly) document.body.removeAttribute("data-why");
  if (isWebsite && view.reactionsOnly) {
    header.querySelector(".game-progress")?.remove();
    container.append(reactionCard(view));
    actions.showArrows?.([], false);
    return;
  }
  const analysis = document.createElement("section");
  analysis.className = "position-analysis";
  const players = document.createElement("div");
  players.className = "position-players";
  const boardElement = document.createElement("div");
  boardElement.className = "board";
  boardElement.setAttribute("role", "group");
  boardElement.setAttribute("aria-label", "Current board position");
  const legend = document.createElement("div");
  legend.className = "board-arrow-legend";
  const replay = document.createElement("div");
  replay.className = "board-controls studio-replay";
  const previous = action("‹", () => step(-1));
  const next = action("›", () => step(1));
  previous.setAttribute("aria-label", "Previous move");
  next.setAttribute("aria-label", "Next move");
  const counter = describe("", "", "span");
  // Arrow keys step through the line from anywhere on the page, even after
  // redraws replace the buttons (the handler always uses the latest view).
  if (studio) currentStep = step;
  counter.setAttribute("role", "status");
  replay.append(previous, counter, next);
  const top = view.flipped ? "w" : "b";
  let mini = null;
  if (studio) {
    // Click the board (its arrows) to play the next move of the line.
    boardElement.classList.add("line-board");
    boardElement.title = "Click to play the next move";
    boardElement.addEventListener("click", () => { if (!next.disabled) step(1); });
    previous.classList.add("line-step");
    next.classList.add("line-step", "line-step-next");
    const frame = document.createElement("section");
    frame.className = "position-board";
    frame.append(player(top), boardElement, player(top === "w" ? "b" : "w"), legend, replay);
    container.append(frame);
  } else if (isWebsite) {
    // You are always on the left; without a known player, White is on the left.
    const left = view.playerColor || (view.flipped ? "b" : "w");
    players.append(player(left), player(left === "w" ? "b" : "w"));
    header.append(players);
    // The last-move grade sits under the players it belongs to.
    const progress = header.querySelector(".game-progress");
    if (progress) header.append(progress);
    if (premove) header.append(premove);
    const reaction = view.bullet ? null : coachReaction(view);
    if (reaction) header.append(reaction);
    mini = document.createElement("div");
    mini.className = "board mini-board";
    mini.setAttribute("role", "img");
    mini.setAttribute("aria-label", "Preview of the selected move");
    mini.title = "Click to replay";
    mini.onclick = () => playMini();
  }
  container.append(analysis);
  const stage = document.createElement("div");
  stage.className = "mini-stage";
  if (mini) {
    const disclosure = document.createElement("div");
    disclosure.className = "mini-disclosure";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "mini-toggle";
    const drawer = document.createElement("div");
    drawer.className = "mini-drawer";
    drawer.id = "mini-drawer";
    toggle.setAttribute("aria-controls", drawer.id);
    const inner = document.createElement("div");
    inner.className = "mini-drawer-inner";
    inner.append(mini);
    drawer.append(inner);
    const setOpen = open => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Hide board" : "Show board";
      drawer.dataset.open = String(open);
      drawer.inert = !open;
    };
    setOpen(miniOpen);
    toggle.onclick = () => {
      miniOpen = !miniOpen;
      setOpen(miniOpen);
      if (miniOpen) setTimeout(playMini, 280);
      // Save after the height transition so the panel re-render does not cut it short.
      setTimeout(() => setWebsiteOption("miniBoard", miniOpen).catch(() => {}), 320);
    };
    disclosure.append(toggle, drawer);
    stage.append(disclosure);
    analysis.append(stage);
  }
  const evaluationHost = mini ? stage : analysis;

  if (!studio && view.show) {
    const topLine = view.candidates?.[0];
    if (topLine) {
      const evaluation = evaluationMeter(board, topLine);
      evaluation.classList.add("panel-evaluation");
      evaluationHost.append(evaluation);
    } else if (view.pending) {
      // Same structure as the meter so the layout does not move when it arrives.
      const waiting = document.createElement("div");
      waiting.className = "eval panel-evaluation eval-waiting";
      const progress = document.createElement("progress");
      progress.setAttribute("aria-label", "Calculating White evaluation");
      waiting.append(describe("White evaluation", "muted", "span"), progress, describe("…", "score", "span"));
      evaluationHost.append(waiting);
    } else if (board.isGameOver()) {
      const winner = board.turn() === "w" ? "Black" : "White";
      evaluationHost.append(describe(board.isCheckmate() ? winner + " wins by checkmate" : "Draw", "panel-evaluation"));
    }
  }

  const controls = document.createElement("div");
  controls.className = "move-controls";
  const engine = action("Engine", () => chooseMode("engine"));
  const human = action("Human", () => chooseMode("human"));
  const pro = action("Pro", () => chooseMode("pro"));
  engine.title = "Stockfish's strongest moves";
  human.title = "The moves players at this level choose most";
  pro.title = "The most natural move that Stockfish approves";
  // Mode guide: an info icon at the end of the status line opens a short
  // explanation of the current mode, with the numbers it uses.
  const guideCard = describe("", "mode-guide", "p");
  guideCard.id = "mode-guide";
  const guideButton = action("", () => {
    guideOpen = !guideOpen;
    showGuide();
  });
  guideButton.className = "info-button";
  guideButton.dataset.focusKey = "mode-guide";
  guideButton.setAttribute("aria-controls", guideCard.id);
  guideButton.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="10" cy="10" r="7.25"/><path d="M10 9v4.5"/><circle cx="10" cy="6.4" r=".4" fill="currentColor"/></svg>';
  function showGuide() {
    const names = { engine: "Engine", human: "Human", pro: "Pro" };
    guideButton.setAttribute("aria-label", "How " + names[state.lens] + " works");
    guideButton.title = guideButton.getAttribute("aria-label");
    guideButton.setAttribute("aria-expanded", String(guideOpen));
    guideCard.hidden = !guideOpen;
    guideCard.textContent = modeGuide(view, state.lens);
    levelSelect.hidden = state.lens === "engine";
  }
  const single = action("Selected move", () => chooseArrowMode(false));
  const all = action("All moves", () => chooseArrowMode(true));
  const showOther = action("", () => {
    currentOptions().other = !currentOptions().other;
    paint(true);
  });
  function group(name, ...items) {
    const group = document.createElement("div");
    group.className = "move-control-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", name);
    group.append(...items);
    return group;
  }
  if (view.show) {
    controls.append(group("Analysis mode", engine, human, pro));
    controls.append(group("Board arrows", single, all));
    if (!view.followTurn) {
      showOther.classList.add("arrow-switch");
      controls.append(showOther);
    }
  }
  analysis.append(controls);
  const info = describe("", "muted", "p");
  const status = document.createElement("div");
  status.className = "status-row";
  status.append(info);
  // Level: the rating the human model plays at. Changing it here changes it
  // everywhere (Settings, Human, Pro, premoves and bullet).
  const levelSelect = document.createElement("select");
  levelSelect.className = "level-select";
  levelSelect.setAttribute("aria-label", "Level");
  levelSelect.title = "The rating the human moves are based on";
  const pageLevel = view.levelSource === "page";
  levelSelect.add(new Option("Level: from the game", "page", false, pageLevel));
  for (let rating = 800; rating <= 2600; rating += 100)
    levelSelect.add(new Option("Level: " + rating, String(rating), false, !pageLevel && Number(view.level) === rating));
  if (!pageLevel && ![...levelSelect.options].some(option => option.selected))
    levelSelect.add(new Option("Level: " + view.level, String(view.level), true, true), 1);
  levelSelect.onchange = () => actions.setLevel?.(levelSelect.value);
  if (view.show && actions.setLevel) status.append(levelSelect);
  if (view.show) status.append(guideButton);
  const list = document.createElement("div");
  list.className = "companion-lines";
  const details = document.createElement("div");
  details.className = "why-slot";
  const depthBar = document.createElement("div");
  depthBar.className = "depth-bar";
  depthBar.setAttribute("aria-hidden", "true");
  depthBar.hidden = true;
  const trapNote = describe("", "trap-note", "p");
  trapNote.hidden = true;
  analysis.append(status, guideCard, depthBar, list, trapNote, details);
  showGuide();

  let choices = [];
  let plies = [];
  let cursor = 0;
  let renderedSequence = "";
  let selectionRevision = 0;

  function player(color) {
    return playerLabel(view, color, turn, actions.replies && view.show
      ? () => chooseSide(color === other)
      : null);
  }
  function currentOptions() {
    return state.modes[state.lens][view.replyFocus ? "reply" : "turn"];
  }
  function roots() {
    return view.bullet ? allRoots().slice(0, 1) : allRoots();
  }
  function allRoots() {
    return state.lens === "human"
      ? (view.human || []).map(item => ({ pv: item.line, metric: Math.round(item.probability * 100) + "%" }))
      : state.lens === "pro"
        ? (view.pro?.lines || view.candidates).slice(0, Math.max(view.candidates.length, 1))
          .map(item => ({ pv: item.pv, metric: view.pro ? proMetric(item) : score(item), book: item.book }))
        : view.candidates.map(item => ({ pv: item.pv, metric: score(item), book: item.book }));
  }
  function selectedRoot() {
    const moves = roots();
    return moves.find(item => item.pv[0] === view.selectedRoots?.[state.lens]) || moves[0];
  }
  function visibleChoice() {
    return choices.find(row => row.key === (view.replyFocus
      ? view.selectedReply : view.selectedRoots?.[state.lens])) || choices[0];
  }
  function chooseMode(lens) {
    if (state.lens === lens) return;
    state.lens = lens;
    view.selectedReply = null;
    showGuide();
    paint(true);
  }
  function chooseSide(reply) {
    actions.selectPlayer?.(reply ? other : turn);
    const wasPreviewing = view.previewSide;
    view.previewSide = true;
    if (view.replyFocus === reply && wasPreviewing) return;
    view.replyFocus = reply;
    view.selectedReply = null;
    paint(true);
  }
  function chooseArrowMode(showAll) {
    view.previewSide = true;
    currentOptions().all = showAll;
    updateBoard(true);
  }
  function setPressed(element, value) {
    element.setAttribute("aria-pressed", String(Boolean(value)));
  }
  function synchronizeChoices(rows) {
    choices = rows.filter(row => row.pv?.length).map(row => {
      const game = new Chess(view.fen);
      const sequence = row.pv.slice(0, 8).map(move => game.move(move));
      return {
        ...row,
        sequence,
        key: row.pv[actionPly()],
        san: sequence[actionPly()].san,
        move: uci(sequence[0]),
        reply: sequence[1] && uci(sequence[1]),
      };
    });
    list.replaceChildren();
    for (const row of choices) {
      const button = action("", () => {
        view.previewSide = true;
        if (view.replyFocus) view.selectedReply = row.key;
        else (view.selectedRoots ??= {})[state.lens] = row.key;
        currentOptions().all = false;
        updateBoard(true);
      });
      button.className = "candidate-choice move-row-choice";
      button.dataset.choice = row.key;
      button.dataset.focusKey = state.lens + ":" + row.key;
      const visual = moveVisual(row.sequence[actionPly()]);
      // Your repertoire move: name the opening instead of the route.
      const route = row.book && !view.replyFocus ? visual[1]?.querySelector?.(".move-route") : null;
      if (route) {
        route.textContent = "Your opening · " + spokenName(row.book);
        button.dataset.book = "";
      } else if (!studio && !view.replyFocus && row === choices[0]) {
        // Coach-first: the top move says in plain words what it does.
        const gloss = visual[1]?.querySelector?.(".move-route");
        if (gloss) {
          gloss.textContent = explain(row.sequence[0]);
          gloss.classList.add("move-gloss");
        }
      }
      button.append(...visual, describe(row.metric, "score", "span"));
      list.append(button);
    }
    if (choices.length) stable.rows = choices.length;
    const searching = view.show && state.lens !== "human" && (view.pending || view.searching);
    for (let index = choices.length; searching && index < stable.rows; index += 1) {
      const skeleton = document.createElement("div");
      skeleton.className = "move-row-skeleton";
      skeleton.setAttribute("aria-hidden", "true");
      skeleton.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
      list.append(skeleton);
    }
  }
  function actionPly() {
    return view.replyFocus ? 1 : 0;
  }
  function arrows() {
    const selected = visibleChoice();
    const options = currentOptions();
    if (view.followTurn && !(view.previewOnClick && view.previewSide && view.replyFocus)) {
      const candidates = options.all ? roots() : [selectedRoot()].filter(Boolean);
      const position = new Chess(view.fen);
      return candidates.map(row => {
        const move = position.move(row.pv[0]);
        position.undo();
        return { move: uci(move), showMove: true };
      });
    }
    return (options.all ? choices : selected ? [selected] : []).map(row => ({
      move: row.move,
      reply: row.reply,
      showMove: !view.replyFocus || (!view.followTurn && options.other),
      showReply: Boolean(row.reply) && (view.replyFocus || options.other),
    }));
  }
  function updateBoard(send) {
    const selected = visibleChoice();
    const sequenceKey = JSON.stringify(selected?.pv || []);
    if (sequenceKey !== renderedSequence) {
      plies = selected?.sequence || [];
      // Redraws keep the replay position for the same line and position.
      const lineKey = view.fen + "|" + sequenceKey;
      cursor = studio && replayMemory.key === lineKey ? Math.min(replayMemory.cursor, plies.length) : 0;
      renderedSequence = sequenceKey;
    }
    setPressed(single, !currentOptions().all);
    setPressed(all, currentOptions().all);
    setPressed(showOther, currentOptions().other);
    for (const row of list.querySelectorAll("button"))
      setPressed(row, row.dataset.choice === selected?.key && !currentOptions().all);
    markStatic(list, "choice", view.fen + "|" + state.lens + "|" + Boolean(view.replyFocus) + "|" + (selected?.key || ""));
    details.replaceChildren();
    // One compact link replaces the long explanation: Studio replays the line.
    const openStudio = document.getElementById("open");
    const hasWhy = Boolean(!studio && selected && openStudio && view.coachVisible !== false);
    // The Why link is the way into Studio, so the footer button hides.
    if (!studio && isWebsite) document.body.toggleAttribute("data-why", hasWhy);
    if (hasWhy) {
      const why = action("", () => openStudio.click());
      why.className = "why-link";
      why.dataset.focusKey = "why";
      why.title = "Open this line in Studio and step through it";
      why.append(describe("Why " + selected.san + "?", "", "span"), describe("→", "why-arrow", "span"));
      details.append(why);
    }
    const boardArrows = arrows();
    if (studio || boardElement.isConnected) drawPosition(boardArrows);
    if (mini) drawMini(selected);
    actions.showArrows?.(boardArrows, send);
  }
  function drawPosition(boardArrows) {
    const position = cursor ? new Chess(plies[cursor - 1].after) : board;
    drawBoard(boardElement, position, { flipped: view.flipped, last: cursor ? plies[cursor - 1] : view.last });
    const active = cursor
      ? plies[cursor] ? [{ move: uci(plies[cursor]) }] : []
      : boardArrows.map(line => ({
          move: line.showMove ? line.move : "",
          reply: line.showReply ? line.reply : "",
        }));
    if (!cursor && view.premove) active.push({ premove: view.premove.move });
    const overlay = createLineOverlay(document, active, view.flipped);
    overlay.classList.add("board-arrows");
    boardElement.append(overlay);
    const selected = visibleChoice();
    legend.replaceChildren();
    if (!cursor && active.some(line => line.move))
      legend.append(describe("Move", "legend-candidate", "span"));
    if (!cursor && active.some(line => line.reply))
      legend.append(describe("Reply", "legend-reply", "span"));
    if (!cursor && view.premove)
      legend.append(describe("Premove", "legend-premove", "span"));
    previous.disabled = cursor === 0;
    next.disabled = cursor >= plies.length;
    counter.textContent = cursor
      ? plies[cursor - 1].san + " · " + cursor + " / " + plies.length
      : selected ? selected.sequence[0].san + " · 0 / " + plies.length : sideToMove;
  }
  function drawMini(selected) {
    const key = view.fen + "|" + (selected?.move || "") + "|" + (selected?.reply || "") + "|" + Boolean(view.replyFocus);
    // Animate a line once, after the search settles; redraws show it still.
    const same = key === stable.mini || Boolean(view.searching || view.pending);
    if (!same) stable.mini = key;
    mini.dataset.position = "";
    const start = view.replyFocus && selected ? new Chess(selected.sequence[0].after) : board;
    drawBoard(mini, start, { flipped: view.flipped, last: view.replyFocus ? selected?.sequence[0] : view.last });
    mini.plan = selected ? (view.replyFocus ? [selected.sequence[1]] : [selected.sequence[0], selected.sequence[1]]).filter(Boolean) : [];
    // Same line as the last draw: show its end state without replaying it.
    playMini(same);
  }
  function playMini(still = false) {
    if (!mini?.plan?.length || mini.playing) return;
    const reduce = still || !(window.matchMedia("(prefers-reduced-motion: no-preference)").matches && document.documentElement.dataset.motion !== "reduced");
    const square = name => mini.querySelector('[data-square="' + name + '"]');
    const cell = mini.querySelector(".square")?.getBoundingClientRect();
    if (!cell?.width) return;
    mini.anims?.forEach(item => item.cancel());
    if (!still) mini.querySelectorAll("img").forEach(image => { image.style.opacity = ""; });
    mini.querySelectorAll(".mini-ghost").forEach(node => node.remove());
    let delay = reduce ? 0 : 250;
    const animations = [];
    for (const [index, move] of mini.plan.entries()) {
      const from = square(move.from).getBoundingClientRect();
      const to = square(move.to).getBoundingClientRect();
      const image = square(move.from).querySelector("img");
      if (!image) break;
      const ghost = image.cloneNode();
      ghost.className = "mini-ghost" + (index ? " reply" : "");
      const box = mini.getBoundingClientRect();
      Object.assign(ghost.style, { left: from.left - box.left + "px", top: from.top - box.top + "px",
        width: from.width + "px", height: from.height + "px" });
      mini.append(ghost);
      const dx = to.left - from.left, dy = to.top - from.top;
      if (reduce) {
        ghost.style.transform = "translate(" + dx + "px," + dy + "px)";
        image.style.opacity = ".25";
        const captured = square(move.to).querySelector("img");
        if (captured && captured !== image) captured.style.opacity = "0";
        continue;
      }
      const hide = image.animate([{ opacity: 1 }, { opacity: 0.25 }], { duration: 1, delay, fill: "forwards" });
      const slide = ghost.animate([
        { transform: "none", opacity: 0 },
        { transform: "none", opacity: 1, offset: 0.15 },
        { transform: "translate(" + dx + "px," + dy + "px)", opacity: 1 },
      ], { duration: 520, delay, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" });
      const captured = square(move.to).querySelector("img");
      if (captured) animations.push(captured.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, delay: delay + 400, fill: "forwards" }));
      animations.push(hide, slide);
      delay += 760;
    }
    if (!animations.length) return;
    mini.anims = animations;
    mini.playing = true;
    Promise.all(animations.map(item => item.finished)).catch(() => {}).finally(() => { mini.playing = false; });
  }
  function step(delta) {
    const next = cursor + delta;
    if (next < 0 || next > plies.length) return;
    cursor = next;
    replayMemory = { key: view.fen + "|" + renderedSequence, cursor };
    drawPosition(arrows());
  }
  async function paint(send) {
    const version = ++selectionRevision;
    if (state.lens === "human") actions.loadHuman?.();
    if (state.lens === "pro") view.loadPro?.();
    setPressed(engine, state.lens === "engine");
    setPressed(human, state.lens === "human");
    setPressed(pro, state.lens === "pro");
    for (const player of container.querySelectorAll("button.board-player"))
      setPressed(player, player.dataset.color === (view.replyFocus ? other : turn));
    list.classList.toggle("reply-choices", Boolean(view.replyFocus));
    const secondaryColor = view.replyFocus ? turn : other;
    showOther.textContent = view.playerColor
      ? secondaryColor === view.playerColor ? "Show your arrows" : "Show opponent arrows"
      : view.replyFocus ? "Include setup move" : "Include replies";
    let rows = view.show ? roots() : [];
    info.textContent = !view.show ? "Turn on Show lines or Live analysis to see moves."
      : state.lens !== "human" && view.pending ? "Calculating with Stockfish…"
      : state.lens !== "human" && view.error ? view.error
      : state.lens === "human" ? (view.humanPending ? "Calculating with Maia-3…" : (view.humanModel || "Local model") + " · Likely moves")
      : view.bullet && state.lens === "pro" ? (view.pro ? "Bullet · Human move" : "Bullet · Checking…")
      : view.bullet ? "Bullet · Engine move"
      : state.lens === "pro" ? (view.proPending || !view.pro ? "Checking human moves with Stockfish…"
        : "Pro · " + proStyle(view.proStyle).label + " · " + (view.pro.model || "Human model"))
      : view.candidates.length ? "Stockfish 19 · Depth " + view.candidates[0].depth : "";
    depthBar.hidden = !(state.lens !== "human" && view.searching && view.targetDepth);
    if (!depthBar.hidden) {
      info.textContent = "Stockfish 19 · Depth " + (view.depth || 0) + " / " + view.targetDepth;
      depthBar.style.setProperty("--depth", Math.min(1, (view.depth || 0) / view.targetDepth));
    }
    info.classList.toggle("analysis-progress", Boolean(state.lens === "human" ? view.humanPending : view.pending || (state.lens === "pro" && view.proPending)));
    const trap = state.lens === "pro" && !view.replyFocus ? view.pro?.trap : null;
    trapNote.hidden = !trap;
    if (trap) {
      const position = new Chess(view.fen);
      const san = position.move(trap.pv[0]).san;
      trapNote.textContent = "Common mistake: " + percent(trap.probability) + " of players here choose " + san +
        ", which gives up " + percent(trap.loss) + " of the winning chances.";
    }
    if (view.replyFocus && rows.length) {
      const setup = selectedRoot();
      const key = state.lens + ":" + setup.pv[0];
      const cache = (view.replyCache ??= new Map());
      if (!cache.has(key)) {
        info.classList.add("analysis-progress");
        info.textContent = "Finding replies after " + moveEvidence(view.fen, setup.pv).san + "…";
        synchronizeChoices([]);
        updateBoard(send);
        cache.set(key, actions.replies(state.lens, setup.pv[0]).catch(() => []));
      }
      rows = await cache.get(key);
      if (version !== selectionRevision || !analysis.isConnected) return;
      info.classList.remove("analysis-progress");
      const san = moveEvidence(view.fen, setup.pv).san;
      info.textContent = rows.length ? "Replies after " + san : "No reply after " + san;
    }
    synchronizeChoices(rows);
    updateBoard(send);
  }
  paint(false);
}
