import { COACHES, coachSvg } from "./coaches.mjs";
import { gameAccuracy, gradeMove, toCentipawns } from "./gamify.mjs";
import { createArrowOverlay } from "./board-mark.mjs";
import { maiaLines, maiaRanks } from "./maia.mjs";
import { websiteDefaults } from "./website-preferences.mjs";
import { Chess } from "./vendor/chess.mjs";
import { analyze, score, uci } from "./engine.mjs";
import { drawBoard, explain, notation, moveVisual } from "./chess-view.mjs";
import { moveEvidence } from "./analysis-evidence.mjs";
import { evaluationMeter } from "./companion-view.mjs";
import { humanLines } from "./human-lines.mjs";
import { rankHuman } from "./policy.mjs";
import weights from "./weights.mjs";
import openings from "./openings.mjs";

const $ = (id) => document.getElementById(id);
const api = globalThis.chrome?.storage?.local;
const read = async (key) =>
  api
    ? (await api.get(key))[key]
    : JSON.parse(localStorage.getItem(key) || "null");
const write = (key, value) =>
  api
    ? api.set({ [key]: value })
    : Promise.resolve(localStorage.setItem(key, JSON.stringify(value)));
const tabId = (await globalThis.chrome?.tabs?.getCurrent())?.id;
const params = new URLSearchParams(location.search);
let session = params.get("game");
if (!session || !/^[a-f0-9-]{36}$/.test(session)) {
  session = crypto.randomUUID();
  params.set("game", session);
  history.replaceState(null, "", "?" + params);
}
const key = "game:" + session;
let settingsEntry = params.get("view") === "settings";
const defaultSettings = {
  panelEvaluation: true,
  board: "slate",
  motion: "full",
  badges: true,
  celebrate: true,
  elo: 1950,
  theme: "system",
  coach: "always",
  depth: 15,
};
let record = (await read(key)) || {};
let settings = { ...defaultSettings, ...(await read("preferences")) };
let library = (await read("library")) || [];
let mode = settingsEntry ? "settings" : record.mode || "practice";
let websiteOptions = (await read("websiteOptions")) || {};
let gameMode = record.gameMode || "practice";
const slots = record.slots || {};
let game = new Chess();
try {
  if (record.pgn) game.loadPgn(record.pgn);
} catch {
  record = {};
}
if (params.has("fen")) {
  try {
    const position = new Chess(params.get("fen"));
    const other = position.turn() === "w" ? "b" : "w";
    if (
      position.isAttacked(
        position.findPiece({ type: "k", color: other })[0],
        position.turn(),
      )
    )
      throw Error();
    game = position;
    mode = gameMode = "review";
  } catch {
    /* Invalid external position opens the regular workspace. */
  }
  params.delete("fen");
  history.replaceState(null, "", "?" + params);
}
let cursor = Math.min(
  record.cursor ?? game.history().length,
  game.history().length,
);
let show = record.show ?? true;
let flipped = record.flipped ?? false;
let side = record.side || "w";
let selected;
let preview;
let job;
let botTimer;
let botSuppressed = Boolean(record.botSuppressed);
let candidates = [];
let human = [];
let humanContinuations = [];
let humanModel = "Local model";
let analysisError = "";
let pinnedReason;
let exercise;
let noteTimer;
let analysisPending = false;
let gameScan;
let revision = 0;

function label(text, cls) {
  const element = document.createElement("span");
  if (cls) element.className = cls;
  element.textContent = text;
  return element;
}
function button(text, action, cls) {
  const element = document.createElement("button");
  element.textContent = text;
  if (cls) element.className = cls;
  element.onclick = action;
  return element;
}
function report(text) {
  $("toast").textContent = text;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => ($("toast").textContent = ""), 4000);
}
function storageFailure() {
  report("Local storage is unavailable. Export your PGN to keep the game.");
}
function bindActive() {
  if (!document.hidden && !settingsEntry)
    write("activeWorkspace", { key, tabId, url: location.href }).catch(
      storageFailure,
    );
}
document.addEventListener("visibilitychange", bindActive);
window.addEventListener("focus", bindActive);
bindActive();

function snapshot() {
  return { pgn: game.pgn(), cursor, flipped, side, botSuppressed };
}
function persist() {
  if (exercise) return Promise.resolve();
  slots[gameMode] = snapshot();
  return write(key, { ...slots[gameMode], mode, gameMode, show, slots }).catch(
    storageFailure,
  );
}
function publish(position) {
  const details = {
    fen: position.fen(),
    mode: gameMode,
    show,
    depth: settings.depth,
    terminal: position.isGameOver() ? gameStatus(position) : "",
    coachVisible:
      mode === "review" ||
      settings.coach === "always" ||
      pinnedReason === cursor,
    last: cursor ? game.history({ verbose: true })[cursor - 1] : null,
    candidates: show ? candidates : [],
    pending: show && analysisPending,
    error: show ? analysisError : "",
    humanModel,
    human: show ? humanContinuations : [],
  };
  write("analysis:" + session, details).catch(storageFailure);
}
function atCursor() {
  const history = game.history({ verbose: true });
  if (cursor === history.length) return game;
  const start = new Chess(history[0].before);
  history.slice(0, cursor).forEach((move) => start.move(uci(move)));
  return start;
}
function shownBoard() {
  if (!preview) return atCursor();
  const board = new Chess(preview.fen);
  preview.line.slice(0, preview.index + 1).forEach((move) => board.move(move));
  return board;
}
function gameStatus(board) {
  if (board.isCheckmate())
    return (board.turn() === "w" ? "Black" : "White") + " wins · Checkmate";
  if (board.isStalemate()) return "Draw · Stalemate";
  if (board.isThreefoldRepetition()) return "Draw · Threefold repetition";
  if (board.isInsufficientMaterial()) return "Draw · Insufficient material";
  if (board.isDrawByFiftyMoves()) return "Draw · Fifty-move rule";
  if (preview) return "Variation";
  if (cursor < game.history().length) return "Replaying game";
  if (gameMode === "practice") {
    if (board.turn() !== side)
      return botSuppressed ? "Opponent paused" : "Opponent to move";
    return "Your turn" + (board.inCheck() ? " · Check" : "");
  }
  return (
    (board.turn() === "w" ? "White" : "Black") +
    " to move" +
    (board.inCheck() ? " · Check" : "")
  );
}

function renderBoard() {
  const board = shownBoard();
  const interactive =
    !preview &&
    cursor === game.history().length &&
    !board.isGameOver() &&
    (gameMode === "review" || board.turn() === side);
  drawBoard($("board"), board, {
    flipped,
    selected,
    targets:
      selected && interactive
        ? board
            .moves({ square: selected, verbose: true })
            .map((move) => move.to)
        : [],
    last: board.history({ verbose: true }).at(-1),
    onSquare: interactive ? selectSquare : undefined,
    onDrop: interactive ? dropMove : undefined,
  });
  const nextMove = preview?.line[preview.index + 1];
  if (nextMove) {
    const overlay = createArrowOverlay(document, nextMove, "", flipped);
    overlay.classList.add("board-arrows");
    $("board").append(overlay);
  }
  $("status").textContent = gameStatus(board);
  $("counter").textContent = preview
    ? "Line " + (preview.index + 1) + " / " + preview.line.length
    : cursor + " / " + game.history().length;
  $("first").disabled = $("previous").disabled = preview
    ? preview.index < 0
    : cursor === 0;
  $("next").disabled = $("latest").disabled = preview
    ? preview.index >= preview.line.length - 1
    : cursor === game.history().length;
  $("undo").disabled = !game.history().length;
  $("review-game").hidden = gameMode !== "practice" || !game.history().length;
  $("retry-position").hidden =
    mode !== "review" || Boolean(exercise) || !cursor;
  $("end-exercise").hidden = !exercise;
  $("resume").hidden =
    !botSuppressed || gameMode !== "practice" || board.turn() === side;
  $("board-label").textContent =
    gameMode === "practice"
      ? "Human-like opponent · " + settings.elo + " target"
      : "Analysis board";
}
function renderMoves() {
  const history = game.history({ verbose: true });
  const element = $("moves");
  element.replaceChildren();
  $("find-turning").hidden =
    mode !== "review" || Boolean(exercise) || history.length < 2;
  if (!history.length) {
    element.append(label("Moves will appear here.", "muted"));
    return;
  }
  const turn = Number(history[0].before.split(" ")[5]);
  const offset = history[0].color === "b" ? 1 : 0;
  for (let slot = 0; slot < history.length + offset; slot += 2) {
    const row = document.createElement("div");
    row.className = "move-row";
    row.append(label(turn + slot / 2 + ".", "muted"));
    for (let color = 0; color < 2; color++) {
      const index = slot + color - offset;
      const move = history[index];
      if (!move) {
        row.append(label(""));
        continue;
      }
      const choice = button(
        move.san,
        () => {
          preview = null;
          navigate(index + 1);
        },
        index + 1 === cursor ? "chosen" : "",
      );
      if (index + 1 === cursor) choice.setAttribute("aria-current", "step");
      row.append(choice);
    }
    element.append(row);
  }
  element
    .querySelector('[aria-current="step"]')
    ?.scrollIntoView({ block: "nearest", container: "nearest" });
}
function renderAnalysis() {
  const last = cursor ? game.history({ verbose: true })[cursor - 1] : null;
  const reason = $("reason");
  reason.replaceChildren();
  if (
    last &&
    (mode === "review" ||
      settings.coach === "always" ||
      pinnedReason === cursor)
  ) {
    const title = document.createElement("h3");
    title.textContent = "Why " + last.san + "?";
    reason.append(title, label(explain(last)));
    if (!preview)
      reason.append(
        button("Show on board", () => {
          selected = null;
          preview = { fen: last.before, line: [uci(last)], index: 0 };
          render();
        }),
      );
  } else if (last) {
    reason.append(
      button("Explain " + last.san, () => {
        pinnedReason = cursor;
        renderAnalysis();
        publish(atCursor());
      }),
    );
  } else {
    reason.append(label("Play a move to see what changed.", "muted"));
  }
  const output = $("candidates");
  output.replaceChildren();
  if (!show) {
    output.append(label("Engine lines are hidden.", "muted"));
  } else if (analysisError) {
    output.append(
      label(analysisError, "muted"),
      button("Retry analysis", refresh),
    );
  } else if (analysisPending) {
    output.append(label("Calculating with Stockfish…", "muted analysis-progress"));
  } else if (candidates.length) {
    const heading = document.createElement("h3");
    heading.textContent = "Best by engine";
    output.append(heading);
    const board = atCursor();
    output.append(evaluationMeter(board, candidates[0]));
    for (const [i, line] of candidates.entries()) {
      const pick = button(
        "",
        () => {
          preview = { fen: board.fen(), line: line.pv, index: 0 };
          selected = null;
          render();
        },
        "candidate",
      );
      const readable = notation(board.fen(), line.pv.slice(0, 5));
      pick.append(
        ...moveVisual(new Chess(board.fen()).move(line.pv[0]), readable.slice(1).join(" ")),
        label(score(line), "score"),
      );
      pick.setAttribute(
        "aria-label",
        (i === 0 ? "Best move " : "Alternative ") +
          readable[0] +
          ", " +
          score(line) +
          ". Replay line",
      );
      output.append(pick);
    }
    if (last && mode === "review" && !exercise)
      output.append(button("Compare played move", comparePlayed));
    if (humanContinuations.length) {
      const heading = document.createElement("h3");
      heading.textContent = "Human";
      output.append(heading);
      if (humanModel !== "Maia-3")
        output.append(
          label(
            humanModel.includes("unavailable")
              ? "Maia unavailable · showing the local model"
              : humanModel,
            "muted human-model-note",
          ),
        );
      for (const choice of humanContinuations) {
        const pick = button(
          "",
          () => {
            const lineBoard = new Chess(board.fen());
            const line = choice.line.map((san) => uci(lineBoard.move(san)));
            preview = { fen: board.fen(), line, index: 0 };
            selected = null;
            render();
          },
          "candidate",
        );
        pick.append(
          ...moveVisual(new Chess(board.fen()).move(choice.san), choice.line.slice(1).join(" ")),
          label(Math.round(choice.probability * 100) + "%", "score"),
        );
        output.append(pick);
      }
    }
  } else {
    output.append(label("No continuation from this position.", "muted"));
  }
  $("replay").hidden = !preview;
  if (preview) {
    const evidence = moveEvidence(preview.fen, preview.line);
    $("replay").replaceChildren(
      label(
        "Variation · " +
          notation(preview.fen, preview.line.slice(0, 8)).join(" "),
      ),
      label(evidence.effect),
      ...(evidence.reply ? [label("Reply " + evidence.reply, "muted")] : []),
      ...(evidence.continuation
        ? [label("Then " + evidence.continuation, "muted")]
        : []),
      button("Back to game", () => {
        preview = null;
        render();
      }),
    );
  }
}
async function comparePlayed() {
  const last = game.history({ verbose: true })[cursor - 1];
  const version = revision;
  const controller = job;
  if (!last || !controller) return;
  const output = $("candidates");
  const result = label("Comparing the played move…", "muted analysis-progress");
  output.append(result);
  try {
    const before = new Chess(last.before);
    const [best, played] = await Promise.all([
      analyze(before, {
        depth: settings.depth,
        count: 1,
        signal: controller.signal,
      }),
      analyze(before, {
        depth: settings.depth,
        count: 1,
        signal: controller.signal,
        only: uci(last),
      }),
    ]);
    if (version === revision && best.length && played.length) {
      result.textContent =
        "Before " +
        last.san +
        " · Best " +
        notation(last.before, best[0].pv.slice(0, 1))[0] +
        " " +
        score(best[0]) +
        " · Played " +
        score(played[0]);
      result.append(
        button("Replay best line", () => {
          preview = { fen: last.before, line: best[0].pv, index: 0 };
          render();
        }),
      );
    }
  } catch (error) {
    if (error.name !== "AbortError") result.textContent = error.message;
  }
}
function render() {
  const gameView = mode === "practice" || mode === "review";
  $("game-view").hidden = $("top-actions").hidden = !gameView;
  $("extra").hidden = gameView;
  $("title").textContent = mode[0].toUpperCase() + mode.slice(1);
  $("eyebrow").textContent = {
    practice: "Training board",
    review: "Game analysis",
    library: "Saved games",
    settings: "Preferences",
  }[mode];
  for (const element of document.querySelectorAll("[data-mode]")) {
    if (element.dataset.mode === mode)
      element.setAttribute("aria-current", "page");
    else element.removeAttribute("aria-current");
  }
  $("new-game").textContent = mode === "review" ? "Load position" : "New game";
  $("show-analysis").checked = show;
  document.documentElement.dataset.theme = settings.theme;
  Object.assign(document.documentElement.dataset, {
    board: settings.board, motion: settings.motion,
    badges: settings.badges ? "show" : "hide", celebrate: settings.celebrate ? "on" : "off",
  });
  if (gameView) {
    renderBoard();
    renderMoves();
    renderAnalysis();
  } else if (mode === "library") renderLibrary();
  else renderSettings();
}
function refresh() {
  gameScan?.abort();
  $("scan-results").replaceChildren();
  $("find-turning").disabled = false;
  revision++;
  const version = revision;
  job?.abort();
  job = new AbortController();
  clearTimeout(botTimer);
  if (settingsEntry) {
    render();
    return;
  }
  const position = atCursor();
  candidates = [];
  human = [];
  humanContinuations = [];
  analysisError = "";
  analysisPending = show && !position.isGameOver();
  if (!position.isGameOver() && show)
    human = rankHuman(position, settings.elo, cursor, weights, openings);
  humanModel = "Local model";
  if (websiteOptions.maia !== false && human.length) {
    humanModel = "Maia-3";
    maiaLines(position.fen(), settings.elo, 3, job.signal).then(lines => {
      if (version !== revision) return;
      humanContinuations = lines;
      renderAnalysis();
      publish(position);
    }).catch(() => {
      if (version !== revision) return;
      humanModel = "Local model · Maia unavailable";
      humanContinuations = humanLines(position.fen(), settings.elo, 3, human);
      renderAnalysis();
      publish(position);
    });
  } else if (human.length)
    humanContinuations = humanLines(position.fen(), settings.elo, 3, human);
  render();
  persist();
  publish(position);
  if (analysisPending) {
    analyze(position, { depth: settings.depth, signal: job.signal })
      .then((lines) => {
        if (version !== revision) return;
        candidates = lines;
        analysisPending = false;
        if (mode === "practice" || mode === "review") renderAnalysis();
        publish(position);
      })
      .catch((error) => {
        if (version !== revision || error.name === "AbortError") return;
        analysisError = error.message;
        analysisPending = false;
        if (mode === "practice" || mode === "review") renderAnalysis();
        publish(position);
      });
  }
  if (
    mode === "practice" &&
    gameMode === "practice" &&
    !botSuppressed &&
    cursor === game.history().length &&
    !game.isGameOver() &&
    game.turn() !== side
  ) {
    botTimer = setTimeout(async () => {
      if (version !== revision) return;
      let choices = human.length
        ? human
        : rankHuman(game, settings.elo, cursor, weights, openings);
      if (websiteOptions.maia !== false) {
        try { [choices] = await maiaRanks([new Chess(game.fen())], [settings.elo]); }
        catch { /* The local policy can play while Maia is unavailable. */ }
        if (version !== revision) return;
      }
      let sample = Math.random();
      const choice =
        choices.find(({ probability }) => (sample -= probability) <= 0) ||
        choices.at(-1);
      if (choice) play(uci(choice.move));
    }, 420);
  }
}

function play(move) {
  try {
    game.move(move);
  } catch {
    report("That move is illegal in this position.");
    return;
  }
  selected = null;
  cursor = game.history().length;
  preview = null;
  refresh();
}
function dropMove(from, to) {
  if (from === to || game.get(from)?.color !== game.turn()) return;
  const valid = game
    .moves({ square: from, verbose: true })
    .some((move) => move.to === to);
  if (!valid) return;
  selected = from;
  selectSquare(to);
}
function selectSquare(square) {
  const piece = game.get(square);
  if (selected && selected !== square) {
    const options = game
      .moves({ square: selected, verbose: true })
      .filter((move) => move.to === square);
    if (options.length === 1) {
      play(uci(options[0]));
      return;
    }
    if (options.length) {
      const dialog = $("dialog");
      dialog.replaceChildren(label("Promote pawn", "dialog-title"));
      for (const move of options) {
        const names = { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" };
        dialog.append(
          button(names[move.promotion], () => {
            dialog.close();
            play(uci(move));
          }),
        );
      }
      dialog.append(button("Cancel", () => dialog.close()));
      dialog.showModal();
      return;
    }
  }
  selected =
    selected !== square && piece?.color === game.turn() ? square : undefined;
  renderBoard();
}
function navigate(index) {
  if (preview) {
    preview.index = Math.min(preview.line.length - 1, Math.max(-1, index));
    renderBoard();
    return;
  }
  cursor = Math.min(game.history().length, Math.max(0, index));
  selected = null;
  refresh();
}
function endExercise() {
  if (!exercise) return;
  const saved = exercise;
  exercise = null;
  game = saved.game;
  cursor = saved.cursor;
  show = saved.show;
  preview = selected = null;
}
function showMode(next) {
  endExercise();
  if (settingsEntry && next !== "settings") {
    settingsEntry = false;
    params.delete("view");
    history.replaceState(null, "", "?" + params);
    bindActive();
  }
  if ((next === "practice" || next === "review") && next !== gameMode) {
    slots[gameMode] = snapshot();
    const target = slots[next] || (next === "review" ? slots[gameMode] : {});
    game = new Chess();
    if (target.pgn) game.loadPgn(target.pgn);
    cursor = target.cursor ?? game.history().length;
    side = target.side || "w";
    flipped = target.flipped ?? false;
    botSuppressed = next === "practice" && Boolean(target.botSuppressed);
    gameMode = next;
  }
  mode = next;
  clearTimeout(noteTimer);
  $("toast").textContent = "";
  preview = null;
  selected = null;
  refresh();
}
async function savePreferences() {
  try {
    await write("preferences", settings);
  } catch {
    storageFailure();
  }
  refresh();
}
const SETTING_ICONS = {
  analysis: "M3 15l4-5 3 3 5-7M3 3v14h14",
  arrows: "M4 16L15 5M15 5H9M15 5v6",
  coaching: "M4 5h12v8H9l-4 3v-3H4z",
  appearance: "M10 3a7 7 0 1 0 0 14c1 0 1.5-.8 1-1.6-.6-.9 0-2.4 1.4-2.4H15a2 2 0 0 0 2-2 7 7 0 0 0-7-8z",
  practice: "M7 17h6M8 14h4l1-6H7zM10 3v2M8 5h4",
};
function renderSettings() {
  const box = $("extra");
  box.replaceChildren();
  const siteValues = { ...websiteDefaults, ...websiteOptions };
  if (siteValues.lens === "compare") siteValues.lens = "engine";
  const saveSite = (key) => async () => {
    websiteOptions = { ...websiteOptions, [key]: siteValues[key] };
    try {
      await write("websiteOptions", websiteOptions);
    } catch {
      storageFailure();
    }
  };
  const recommended = (options, value) => Object.assign([...options], { recommended: value });
  function group(title, icon, intro) {
    const section = document.createElement("section");
    section.className = "settings-group";
    const heading = document.createElement("h2");
    heading.innerHTML = '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' + SETTING_ICONS[icon] + '"/></svg>';
    heading.append(title);
    section.append(heading);
    if (intro) section.append(label(intro, "settings-intro"));
    box.append(section);
    return section;
  }
  const LONG = new Set(["depth", "elo", "arrowSide"]);
  function control(section, caption, help, key, options, current, save) {
    const row = document.createElement("div");
    row.className = "setting-row";
    const id = "setting-" + key + "-" + section.childElementCount;
    const text = document.createElement("div");
    text.className = "setting-text";
    const name = document.createElement("label");
    name.htmlFor = id;
    name.textContent = caption;
    text.append(name, label(help, "setting-help"));
    const best = options.recommended;
    const choose = (value) => {
      current[key] = value;
      save();
    };
    let input;
    const values = options.map(([value]) => value);
    if (values.length === 2 && values.includes(true) && values.includes(false)) {
      input = document.createElement("button");
      input.type = "button";
      input.className = "setting-switch";
      input.setAttribute("role", "switch");
      input.setAttribute("aria-checked", String(Boolean(current[key])));
      input.onclick = () => {
        input.setAttribute("aria-checked", String(!current[key]));
        choose(!current[key]);
      };
    } else if (!LONG.has(key) && options.length <= 5) {
      input = document.createElement("div");
      input.className = "segmented" + (key === "board" ? " swatches" : "");
      input.setAttribute("role", "radiogroup");
      for (const [value, title] of options) {
        const item = document.createElement("button");
        item.type = "button";
        item.setAttribute("role", "radio");
        item.setAttribute("aria-checked", String(value === current[key]));
        item.dataset.value = String(value);
        if (key === "board") item.append(label("", "swatch"));
        item.append(title);
        if (value === best) {
          item.dataset.recommended = "";
          item.title = "Recommended";
        }
        item.onclick = () => {
          for (const other of input.children) other.setAttribute("aria-checked", String(other === item));
          choose(value);
        };
        input.append(item);
      }
    } else {
      input = document.createElement("select");
      for (const [value, title] of options)
        input.add(new Option(value === best ? title + " (recommended)" : title, value, false, value === current[key]));
      input.onchange = () => choose(options.find(([value]) => String(value) === input.value)[0]);
    }
    input.id = id;
    input.setAttribute("aria-label", caption);
    row.append(text, input);
    section.append(row);
  }
  const prefs = () => [settings, savePreferences];
  const levels = Array.from({ length: 21 }, (_, index) => [1000 + index * 50, String(1000 + index * 50)]);

  const analysis = group("Analysis", "analysis", "Stockfish 19 runs on your computer. Nothing leaves your browser.");
  control(analysis, "Live analysis", "Analyse the game on Chess.com or Lichess as you play.",
    "enabled", [[true, "On"], [false, "Off"]], siteValues, saveSite("enabled"));
  control(analysis, "Website search depth", "Higher depth is stronger but slower.",
    "depth", recommended([[9, "Fast"], [12, "Balanced"], [16, "Deep"]], 16), siteValues, saveSite("depth"));
  control(analysis, "Candidate moves", "How many moves to list for each position.",
    "lines", recommended([1, 2, 3, 4, 5].map((count) => [count, String(count)]), 5), siteValues, saveSite("lines"));
  control(analysis, "Default analysis mode", "Engine shows the strongest moves. Human shows the moves people play.",
    "lens", recommended([["engine", "Engine"], ["human", "Human"]], "engine"), siteValues, saveSite("lens"));
  const modelSettings = { maia: websiteOptions.maia !== false };
  control(analysis, "Human predictions", "Maia-3 downloads 46 MB once, then works offline.",
    "maia", recommended([[true, "Maia-3"], [false, "Lightweight"]], true), modelSettings, async () => {
      websiteOptions = { ...websiteOptions, ...modelSettings };
      await write("websiteOptions", websiteOptions);
    });
  control(analysis, "Human model level", "The rating of the players the human model imitates.",
    "elo", recommended(levels, 2000), siteValues, saveSite("elo"));

  const arrows = group("Board & arrows", "arrows");
  control(arrows, "Automatic board arrows", "Draw the suggested move on the website board.",
    "arrows", recommended([[true, "On"], [false, "Off"]], true), siteValues, saveSite("arrows"));
  control(arrows, "Board arrows follow", "Choose whose moves the arrows show.",
    "arrowSide", recommended([["preview", "Turn with player previews"], ["turn", "Player to move only"], ["selection", "Selected player"]], "preview"),
    siteValues, saveSite("arrowSide"));
  control(arrows, "Board colours", "Colours of the Studio and preview boards.",
    "board", recommended([["slate", "Slate"], ["green", "Green"], ["wood", "Wood"]], "slate"), ...prefs());

  const coaching = group("Coaching", "coaching");
  control(coaching, "Panel mode", "Coach shows the best moves and arrows. Commentator hides suggestions and comments on every move you play.",
    "view", recommended([["moves", "Coach"], ["reactions", "Commentator"]], "moves"), siteValues, saveSite("view"));
  {
    const row = document.createElement("div");
    row.className = "setting-row coach-row";
    const text = document.createElement("div");
    text.className = "setting-text";
    text.append(label("Commentator", "setting-name"), label("Who comments on your moves.", "setting-help"));
    const picker = document.createElement("div");
    picker.className = "coach-picker";
    picker.setAttribute("role", "radiogroup");
    picker.setAttribute("aria-label", "Commentator");
    const current = siteValues.coachCharacter || "nova";
    for (const coach of COACHES) {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "radio");
      item.setAttribute("aria-checked", String(coach.id === current));
      item.setAttribute("aria-label", coach.persona + ", " + coach.name);
      item.title = coach.tagline;
      item.innerHTML = coachSvg(coach.id, "happy");
      item.append(label(coach.persona, "coach-name"), label(coach.tagline, "coach-tagline"));
      item.onclick = () => {
        for (const other of picker.children) other.setAttribute("aria-checked", String(other === item));
        siteValues.coachCharacter = coach.id;
        saveSite("coachCharacter")();
      };
      picker.append(item);
    }
    row.append(text, picker);
    coaching.append(row);
  }
  control(coaching, "Website move explanations", "Explain the selected move in plain words.",
    "coach", recommended([["always", "Show"], ["off", "Hide"]], "always"), siteValues, saveSite("coach"));
  control(coaching, "Move-quality badges", "Rate each move: Best, Good, Mistake and more.",
    "badges", recommended([[true, "Show"], [false, "Hide"]], true), ...prefs());
  control(coaching, "Celebrations", "A small burst when you find the best move.",
    "celebrate", recommended([[true, "On"], [false, "Off"]], true), ...prefs());

  const appearance = group("Appearance", "appearance");
  control(appearance, "Appearance", "Follow your system, or pick light or dark.",
    "theme", recommended([["system", "System"], ["light", "Light"], ["dark", "Dark"]], "system"), ...prefs());
  control(appearance, "Pop-out and pinned evaluation bar", "Show who is better as a bar above the moves.",
    "panelEvaluation", recommended([[true, "Show"], [false, "Hide"]], true), ...prefs());
  control(appearance, "Animations", "Slide pieces and draw arrows smoothly.",
    "motion", recommended([["full", "On"], ["reduced", "Reduced"]], "full"), ...prefs());

  const local = group("Practice board", "practice");
  control(local, "Opponent skill target", "How strong the practice opponent plays.",
    "elo", recommended([[1000, "1000 · Beginner"], [1250, "1250 · Developing"], [1450, "1450 · Club"], [1700, "1700 · Advanced"], [1950, "1950 · Expert"]], 1950), ...prefs());
  control(local, "Practice explanations", "When to explain moves while you practise.",
    "coach", recommended([["always", "After every move"], ["demand", "On demand"]], "always"), ...prefs());
  control(local, "Engine depth", "Higher depth is stronger but slower.",
    "depth", recommended([[9, "Fast"], [12, "Balanced"], [15, "Deeper"]], 15), ...prefs());

  const reset = button("Reset to recommended", async () => {
    settings = { ...defaultSettings };
    websiteOptions = { ...websiteDefaults };
    try {
      await write("websiteOptions", websiteOptions);
    } catch {
      storageFailure();
    }
    await savePreferences();
  }, "reset-settings");
  box.append(reset);
}
function renderLibrary() {
  const box = $("extra");
  box.replaceChildren(button("Import PGN or FEN", loadDialog, "primary"));
  if (!library.length)
    box.append(
      label("Saved games and positions will appear here.", "empty muted"),
    );
  for (const item of library) {
    const row = document.createElement("div");
    row.className = "setting-row";
    row.append(
      label(item.title),
      button("Open", () => {
        const incoming = new Chess();
        incoming.loadPgn(item.pgn);
        useGame(incoming, "review");
      }),
    );
    box.append(row);
  }
}
function useGame(incoming, nextMode) {
  endExercise();
  slots[gameMode] = snapshot();
  game = incoming;
  mode = gameMode = nextMode;
  cursor = game.history().length;
  selected = preview = null;
  botSuppressed = false;
  refresh();
}
function loadDialog() {
  const dialog = $("dialog");
  const field = document.createElement("textarea");
  field.setAttribute("aria-label", "PGN or FEN");
  field.placeholder = "Paste PGN or FEN";
  const feedback = label("", "error");
  feedback.setAttribute("role", "alert");
  const load = () => {
    const value = field.value.trim();
    if (!value) {
      feedback.textContent = "Enter a PGN or FEN first.";
      return;
    }
    try {
      const incoming = new Chess();
      if (/^\S+\s+[wb]\s+\S+\s+\S+\s+\d+\s+\d+$/.test(value)) {
        incoming.load(value);
        const other = incoming.turn() === "w" ? "b" : "w";
        const king = incoming.findPiece({ type: "k", color: other })[0];
        if (incoming.isAttacked(king, incoming.turn())) throw Error();
      } else {
        incoming.loadPgn(value);
        if (!incoming.history().length && !incoming.getHeaders().FEN)
          throw Error();
      }
      dialog.close();
      useGame(incoming, "review");
    } catch {
      feedback.textContent =
        "This position could not be loaded. Check the PGN or FEN and try again.";
    }
  };
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".pgn,.fen,.txt";
  file.setAttribute("aria-label", "Choose PGN or FEN file");
  file.onchange = async () => {
    if (file.files[0]?.size > 1024 * 1024) {
      feedback.textContent = "Use a game file under 1 MB.";
      return;
    }
    try {
      if (file.files[0]) field.value = await file.files[0].text();
    } catch {
      feedback.textContent = "The game file could not be read.";
    }
  };
  dialog.replaceChildren(
    label("Load a game or position", "dialog-title"),
    field,
    file,
    feedback,
    button("Load", load, "primary"),
    button("Cancel", () => dialog.close()),
  );
  dialog.showModal();
}
function newDialog() {
  const dialog = $("dialog");
  const choose = document.createElement("select");
  choose.setAttribute("aria-label", "Your color");
  choose.add(new Option("Play as White", "w"));
  choose.add(new Option("Play as Black", "b"));
  dialog.replaceChildren(
    label("New practice game", "dialog-title"),
    choose,
    button(
      "Start game",
      () => {
        side = choose.value;
        flipped = side === "b";
        dialog.close();
        useGame(new Chess(), "practice");
      },
      "primary",
    ),
    button("Cancel", () => dialog.close()),
  );
  dialog.showModal();
}

for (const element of document.querySelectorAll("[data-mode]"))
  element.onclick = () => showMode(element.dataset.mode);
$("new-game").onclick = () => (mode === "review" ? loadDialog() : newDialog());
$("find-turning").onclick = async () => {
  gameScan?.abort();
  const controller = new AbortController();
  gameScan = controller;
  const { signal } = controller;
  const moves = game.history({ verbose: true }).slice(0, 100);
  const results = $("scan-results");
  $("find-turning").disabled = true;
  const progress = label("Scanning moves…", "muted");
  const bar = document.createElement("div");
  bar.className = "depth-bar scan-bar";
  bar.setAttribute("aria-hidden", "true");
  const skeleton = document.createElement("div");
  skeleton.className = "skeleton-rows";
  skeleton.setAttribute("aria-hidden", "true");
  for (let row = 0; row < 3; row += 1) skeleton.append(document.createElement("i"));
  results.replaceChildren(progress, bar, skeleton);
  const losses = [];
  const grades = { w: [], b: [] };
  const normalize = (line) =>
    line.type === "cp" ? line.value : Math.sign(line.value) * 10000;
  try {
    for (const [index, move] of moves.entries()) {
      if (signal.aborted) return;
      progress.textContent =
        "Scanning " + (index + 1) + " / " + moves.length + " moves…";
      bar.style.setProperty("--depth", index / moves.length);
      const position = new Chess(move.before);
      const [best] = await analyze(position, { depth: 8, count: 1, signal });
      if (!best) continue;
      if (best.pv[0] === uci(move)) {
        grades[move.color].push(gradeMove(toCentipawns(best), toCentipawns(best), true));
        continue;
      }
      const [played] = await analyze(position, {
        depth: 8,
        count: 1,
        signal,
        only: uci(move),
      });
      if (played) {
        grades[move.color].push(gradeMove(toCentipawns(best), toCentipawns(played)));
        const loss = normalize(best) - normalize(played);
        if (loss >= 60) losses.push({ index, move, loss, best, played });
      }
    }
    if (signal.aborted) return;
    bar.remove();
    skeleton.remove();
    const rings = document.createElement("div");
    rings.className = "accuracy-rings";
    for (const color of ["w", "b"]) {
      const value = gameAccuracy(grades[color]);
      if (value === null) continue;
      const ring = document.createElement("div");
      ring.className = "accuracy-ring";
      ring.style.setProperty("--value", value.toFixed(1));
      ring.setAttribute("role", "img");
      ring.setAttribute("aria-label", (color === "w" ? "White" : "Black") + " accuracy " + Math.round(value) + "%");
      ring.append(label(String(Math.round(value)), "accuracy-value"), label(color === "w" ? "White" : "Black", "accuracy-side"));
      rings.append(ring);
    }
    results.append(rings);
    progress.textContent =
      "Largest evaluation changes" +
      (game.history().length > 100 ? " · First 100 moves" : "");
    if (!losses.length)
      progress.textContent =
        "No large evaluation changes found at this search depth.";
    for (const entry of losses.sort((a, b) => b.loss - a.loss).slice(0, 5)) {
      results.append(
        button(
          entry.index +
            1 +
            " · " +
            entry.move.san +
            "  (" +
            score(entry.played) +
            " vs " +
            score(entry.best) +
            ")",
          () => {
            preview = null;
            navigate(entry.index + 1);
          },
        ),
      );
    }
  } catch (error) {
    if (!signal.aborted) {
      progress.textContent = error.message;
      bar.remove();
      skeleton.remove();
    }
  } finally {
    if (gameScan === controller) $("find-turning").disabled = false;
  }
};
$("flip").onclick = () => {
  flipped = !flipped;
  renderBoard();
  persist();
};
$("show-analysis").onchange = () => {
  show = $("show-analysis").checked;
  refresh();
};
$("first").onclick = () => navigate(preview ? -1 : 0);
$("previous").onclick = () =>
  navigate(preview ? preview.index - 1 : cursor - 1);
$("next").onclick = () => navigate(preview ? preview.index + 1 : cursor + 1);
$("latest").onclick = () =>
  navigate(preview ? preview.line.length - 1 : game.history().length);
$("retry-position").onclick = () => {
  const original = game;
  const originalCursor = cursor;
  preview = selected = null;
  cursor--;
  const position = new Chess(atCursor().fen());
  exercise = { game: original, cursor: originalCursor, show };
  game = position;
  cursor = 0;
  show = false;
  refresh();
  report("Try a move. Turn on Show lines when you’re ready to compare.");
};
$("end-exercise").onclick = () => {
  endExercise();
  refresh();
};
$("resume").onclick = () => {
  botSuppressed = false;
  refresh();
};
$("review-game").onclick = () => {
  const incoming = new Chess();
  incoming.loadPgn(game.pgn());
  useGame(incoming, "review");
};
$("undo").onclick = () => {
  const undone = game.undo();
  if (
    gameMode === "practice" &&
    undone?.color !== side &&
    game.history().length
  )
    game.undo();
  botSuppressed = gameMode === "practice" && game.turn() !== side;
  cursor = game.history().length;
  preview = selected = null;
  refresh();
  if (botSuppressed)
    report("Opponent paused. Select Resume opponent to continue.");
};
$("save").onclick = async () => {
  const pgn = game.pgn();
  if (!pgn) {
    report("Play a move before saving.");
    return;
  }
  const latest = (await read("library")) || [];
  if (latest.some((item) => item.pgn === pgn)) {
    report("Already saved.");
    return;
  }
  const headers = game.getHeaders();
  const title =
    headers.White && headers.Black && headers.White !== "?"
      ? headers.White + " vs " + headers.Black
      : "Saved position · " + game.history().length + " moves";
  library = [{ pgn, title }, ...latest].slice(0, 100);
  try {
    await write("library", library);
    report("Saved to Library.");
  } catch {
    storageFailure();
  }
};
$("export").onclick = () => {
  const link = document.createElement("a");
  link.download = "chess-studio.pgn";
  link.href = URL.createObjectURL(
    new Blob([game.pgn()], { type: "application/x-chess-pgn" }),
  );
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
document.addEventListener("keydown", (event) => {
  if (
    $("game-view").hidden ||
    $("dialog").open ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)
  )
    return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    $(event.key === "ArrowLeft" ? "previous" : "next").click();
  }
  if (event.key === "Escape" && preview) {
    preview = null;
    render();
  }
});
if (api)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.websiteOptions) {
      const next = changes.websiteOptions.newValue || {};
      const changed = JSON.stringify(next) !== JSON.stringify(websiteOptions);
      websiteOptions = next;
      if (changed && mode === "settings") renderSettings();
      else if (changes.websiteOptions.oldValue?.maia !== next.maia) refresh();
    }
    if (!changes.preferences) return;
    const next = { ...defaultSettings, ...changes.preferences.newValue };
    if (Object.keys(next).every((key) => next[key] === settings[key])) return;
    settings = next;
    refresh();
  });
refresh();
