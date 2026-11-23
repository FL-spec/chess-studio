import { moveEvidence } from "./analysis-evidence.mjs";
import { createLineOverlay } from "./board-mark.mjs";
import { drawBoard, moveVisual } from "./chess-view.mjs";
import { Chess } from "./vendor/chess.mjs";
import { score, uci } from "./engine.mjs";
import { MOOD_BY_GRADE, coachSvg, opponentLine, reactionLine } from "./coaches.mjs";
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
  for (const [value, title, hint] of [["moves", "Coach", "Shows the best moves and arrows."],
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
const accuracyLogs = new Map();
let lastCardSignature = "";
function reactionCard(view) {
  const card = document.createElement("section");
  card.className = "coach-card";
  card.setAttribute("aria-live", "polite");
  const avatar = document.createElement("div");
  avatar.className = "coach-avatar";
  const bubble = document.createElement("div");
  bubble.className = "coach-bubble";
  const mineEntry = view.myGrade;
  const oppEntry = view.oppGrade;
  const yourTurn = !view.playerColor || view.playerColor === new Chess(view.fen).turn();
  if (!mineEntry) {
    avatar.innerHTML = coachSvg(coachId, "idle");
    card.dataset.mood = "idle";
    bubble.append(describe(yourTurn ? "Play a move and I’ll react." : "Waiting for your opponent…", "coach-say"));
    if (oppEntry) bubble.append(describe(opponentLine(oppEntry.grade.key, oppEntry.move.san), "coach-hint"));
    card.append(avatar, bubble);
    return card;
  }
  const { grade, move } = mineEntry;
  const key = String(view.source) + ":" + move.color;
  const log = accuracyLogs.get(key) || new Map();
  log.set(move.after, grade.loss);
  accuracyLogs.set(key, log);
  const mood = MOOD_BY_GRADE[grade.key] || "happy";
  avatar.innerHTML = coachSvg(coachId, mood);
  card.dataset.mood = mood;
  card.dataset.grade = grade.key;
  card.dataset.key = move.after;
  const badge = document.createElement("span");
  badge.className = "grade-badge";
  badge.dataset.tone = grade.tone;
  badge.append(describe(grade.symbol, "grade-symbol", "span"), describe(move.san + " · " + grade.label, "", "span"));
  if (view.gradeCelebrate && view.gradeMove?.after === move.after) badge.dataset.celebrate = "";
  const stats = document.createElement("div");
  stats.className = "coach-stats";
  stats.append(badge);
  if (view.streak >= 2) stats.append(describe(view.streak + " in a row", "streak", "span"));
  const losses = [...log.values()];
  const accuracy = losses.reduce((sum, loss) => sum + moveAccuracy(loss), 0) / losses.length;
  stats.append(describe("Accuracy " + Math.round(accuracy) + "%", "coach-accuracy", "span"));
  bubble.append(describe(reactionLine(grade.key, move.after + move.san, coachId, move.san), "coach-say"), stats);
  // The opponent's reply, if it came after the user's move.
  if (oppEntry && oppEntry.move.before === move.after)
    bubble.append(describe(opponentLine(oppEntry.grade.key, oppEntry.move.san), "coach-hint"));
  else if (!yourTurn) bubble.append(describe("Waiting for your opponent…", "coach-hint"));
  card.append(avatar, bubble);
  // Redraws (engine progress, grading) must not replay the entrance animation.
  const signature = (card.dataset.key || "idle") + "|" + bubble.textContent;
  if (signature === lastCardSignature) card.dataset.static = "";
  lastCardSignature = signature;
  return card;
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
  const percentage = outcomes
    ? (whiteWin + outcomes[1] / 2) / 10
    : leading.type === "mate" ? (whiteScore > 0 ? 100 : 0) : 100 / (1 + Math.exp(-whiteScore / 170));
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
  badge.title = san + " was " + grade.label.toLowerCase();
  const who = view.playerColor ? (view.myGrade ? "Your " : "Their ") : "";
  badge.append(describe(grade.symbol, "grade-symbol", "span"), describe(who + san + " · " + grade.label, "", "span"));
  if (view.gradeCelebrate && view.myGrade && view.gradeMove?.after === view.myGrade.move.after) badge.dataset.celebrate = "";
  return badge;
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
  const source = document.createElement("p");
  source.className = "position-source";
  if (isWebsite) {
    source.dataset.live = "";
    const status = view.analysis ? "Analysis" : "Live";
    source.title = view.analysis ? "Following an analysis board" : "Following a live game";
    if (view.analysis) source.dataset.analysis = "";
    source.append(describe("", "live-dot", "span"), describe(status, "live-label", "span"));
  }
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
  header.append(turnRow, source);
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
  if (studio && actions.back) {
    const back = action("Back to game", actions.back);
    back.className = "studio-back";
    header.append(back);
  }
  if (!studio && isWebsite) container.prepend(viewToggle(view.reactionsOnly ? "reactions" : "moves"));
  container.append(header);
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
  replay.addEventListener("keydown", event => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    step(event.key === "ArrowLeft" ? -1 : 1);
  });
  counter.setAttribute("role", "status");
  replay.append(previous, counter, next);
  const top = view.flipped ? "w" : "b";
  let mini = null;
  if (studio) {
    const frame = document.createElement("section");
    frame.className = "position-board";
    frame.append(player(top), boardElement, player(top === "w" ? "b" : "w"), legend, replay);
    container.append(frame);
  } else if (isWebsite) {
    players.append(player("w"), player("b"));
    header.append(players);
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
    controls.append(group("Analysis mode", engine, human));
    controls.append(group("Board arrows", single, all));
    if (!view.followTurn) {
      showOther.classList.add("arrow-switch");
      controls.append(showOther);
    }
  }
  analysis.append(controls);
  const info = describe("", "muted", "p");
  const list = document.createElement("div");
  list.className = "companion-lines";
  const details = document.createElement("div");
  details.className = "why-slot";
  const depthBar = document.createElement("div");
  depthBar.className = "depth-bar";
  depthBar.setAttribute("aria-hidden", "true");
  depthBar.hidden = true;
  analysis.append(info, depthBar, list, details);

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
    return state.lens === "human"
      ? (view.human || []).map(item => ({ pv: item.line, metric: Math.round(item.probability * 100) + "%" }))
      : view.candidates.map(item => ({ pv: item.pv, metric: score(item) }));
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
      button.append(...moveVisual(row.sequence[actionPly()]), describe(row.metric, "score", "span"));
      list.append(button);
    }
    if (choices.length) stable.rows = choices.length;
    const searching = view.show && state.lens === "engine" && (view.pending || view.searching);
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
      cursor = 0;
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
    if (!studio && selected && openStudio && view.coachVisible !== false) {
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
    const overlay = createLineOverlay(document, active, view.flipped);
    overlay.classList.add("board-arrows");
    boardElement.append(overlay);
    const selected = visibleChoice();
    legend.replaceChildren();
    if (!cursor && active.some(line => line.move))
      legend.append(describe("Move", "legend-candidate", "span"));
    if (!cursor && active.some(line => line.reply))
      legend.append(describe("Reply", "legend-reply", "span"));
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
    drawPosition(arrows());
  }
  async function paint(send) {
    const version = ++selectionRevision;
    if (state.lens === "human") actions.loadHuman?.();
    setPressed(engine, state.lens === "engine");
    setPressed(human, state.lens === "human");
    for (const player of container.querySelectorAll("button.board-player"))
      setPressed(player, player.dataset.color === (view.replyFocus ? other : turn));
    list.classList.toggle("reply-choices", Boolean(view.replyFocus));
    const secondaryColor = view.replyFocus ? turn : other;
    showOther.textContent = view.playerColor
      ? secondaryColor === view.playerColor ? "Show your arrows" : "Show opponent arrows"
      : view.replyFocus ? "Include setup move" : "Include replies";
    let rows = view.show ? roots() : [];
    info.textContent = !view.show ? "Turn on Show lines or Live analysis to see moves."
      : state.lens === "engine" && view.pending ? "Calculating with Stockfish…"
      : state.lens === "engine" && view.error ? view.error
      : state.lens === "human" ? (view.humanPending ? "Calculating with Maia-3…" : (view.humanModel || "Local model") + " · Likely moves")
      : view.candidates.length ? "Stockfish 19 · Depth " + view.candidates[0].depth : "";
    depthBar.hidden = !(state.lens === "engine" && view.searching && view.targetDepth);
    if (!depthBar.hidden) {
      info.textContent = "Stockfish 19 · Depth " + (view.depth || 0) + " / " + view.targetDepth;
      depthBar.style.setProperty("--depth", Math.min(1, (view.depth || 0) / view.targetDepth));
    }
    info.classList.toggle("analysis-progress", Boolean(state.lens === "human" ? view.humanPending : view.pending));
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
