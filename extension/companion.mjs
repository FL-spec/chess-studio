import { moveCommentary } from "./analysis-evidence.mjs";
import { analysisLens, websiteSearchOptions } from "./website-preferences.mjs";
import { Chess } from "./vendor/chess.mjs";
import { describe, renderCompanion, renderScanning } from "./companion-view.mjs";
import { analyze, score } from "./engine.mjs";
import { maiaLines, maiaPredict } from "./maia.mjs";
import { humanLines, humanRanks } from "./human-lines.mjs";
import { humanCandidates, proMetric, rankPro } from "./pro-lines.mjs";
import { findSafePremove, uciOf } from "./premove.mjs";
import { moverRatings, playerRatings } from "./ratings.mjs";
import { supported } from "./detect.mjs";
import { gradedTactic, gradeMove, streak, toCentipawns } from "./gamify.mjs";
const api = chrome.storage.local;
const root = document.getElementById("companion-content");
const isWebsiteWindow = document.body.classList.contains("website");
const params = new URLSearchParams(location.search);
let sourceOverride = Number(params.get("source") || params.get("tab")) || null;
const floating = params.get("window") === "1";
if (floating) document.body.classList.add("floating");
const [initialTab] = await chrome.tabs.query({
  active: true,
  currentWindow: true,
});
let active = initialTab;
const currentTab = await chrome.tabs.getCurrent();
if (
  (isWebsiteWindow && !sourceOverride) ||
  (currentTab && currentTab.id === initialTab?.id) ||
  initialTab?.url?.startsWith(chrome.runtime.getURL(""))
) {
  const matching = (
    await chrome.tabs.query({
      currentWindow: true,
      url: [
        "https://www.chess.com/*",
        "https://chess.com/*",
        "https://lichess.org/*",
      ],
    })
  )
    .filter((tab) => tab.url && supported(tab.url))
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  if (isWebsiteWindow) sourceOverride ??= matching[0]?.id;
  else if (matching.length) active = matching[0];
}
const stored = await api.get([
  "websiteOptions",
  "activeWorkspace",
  "preferences",
]);
// The pop-out, pinned panel and Studio always follow the website board.
const mode = "website";
let websiteOptions = websiteSearchOptions(stored.websiteOptions);
const arrows = () => ({ all: false, other: true });
const controls = {
  lens: analysisLens(params.get("lens") || websiteOptions.lens),
  modes: {
    engine: { turn: arrows(), reply: arrows() },
    human: { turn: arrows(), reply: arrows() },
    pro: { turn: arrows(), reply: arrows() },
  },
};
const selectedPlayers = new Map();
let opening = params.has("line");
let prefs = {
  elo: 1950,
  depth: 15,
  coach: "always",
  theme: "system",
  ...stored.preferences,
};
let workspace = stored.activeWorkspace;
let revision = 0;
let positionKey;
let controller;
let timer;
let renderedSite;
let arrowPort;
let arrowTab;

function show(text, className = "muted") {
  root.replaceChildren(describe(text, className));
}
function reset() {
  revision++;
  positionKey = undefined;
  renderedSite = undefined;
  controller?.abort();
  disconnectArrows();
  clearTimeout(timer);
}
function applyTheme() {
  document.documentElement.dataset.theme = prefs.theme;
  document.documentElement.dataset.motion = prefs.motion || "full";
  document.documentElement.dataset.panelEvaluation = prefs.panelEvaluation === false ? "hide" : "show";
}
function disconnectArrows() {
  arrowPort?.disconnect();
  arrowPort = arrowTab = undefined;
}
function showSourceLines(view, lines) {
  if (!view.automaticArrows || renderedSite !== view) return;
  if (arrowTab !== view.source) disconnectArrows();
  try {
    if (!arrowPort) {
      const port = chrome.tabs.connect(view.source, { name: "chess-studio-live-arrows" });
      arrowPort = port;
      arrowTab = view.source;
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        if (arrowPort === port) arrowPort = arrowTab = undefined;
      });
    }
    arrowPort.postMessage({
      type: "chess-studio-mark",
      fen: view.fen,
      lines,
      premove: view.premove?.move,
    });
  } catch {
    disconnectArrows();
  }
}
function draw(view) {
  view.controls = controls;
  const focusKey = document.activeElement?.dataset.focusKey;
  root.replaceChildren();
  const source = view.source;
  const signal = controller?.signal;
  const send = (lines, interaction) => {
    // Board arrows wait for the completed search so they never jump between
    // shallow candidates while the engine is still deepening.
    // In Pro, they also wait for the human check so the arrow does not jump.
    // A safe premove is time-critical, so it is drawn on its own meanwhile.
    if (view.automaticArrows) {
      const settled = (view.bullet || !view.searching) && !(controls.lens === "pro" && !view.pro && !view.replyFocus);
      if (settled) showSourceLines(view, lines);
      else if (view.premove) showSourceLines(view, []);
    }
    else if (source && !view.generic && interaction) {
      chrome.tabs.sendMessage(source, {
        type: "chess-studio-mark",
        fen: view.fen,
        lines,
        premove: view.premove?.move,
      }).catch(() => {});
    }
  };
  renderCompanion(root, new Chess(view.fen), view, {
    showArrows: send,
    loadHuman: view.loadHuman,
    selectPlayer(color) {
      const role = view.playerColor ? (color === view.playerColor ? "you" : "opponent") : color;
      selectedPlayers.set(source, role);
    },
    replies: source ? async (lens, setup) => {
      const board = new Chess(view.fen);
      board.move(setup);
      if (board.isGameOver()) return [];
      const count = websiteOptions.lines;
      const [self, opponent] = moverRatings(view.modelRatings, board.fen());
      if (lens === "human")
        return (websiteOptions.maia && !view.maiaError
          ? await maiaLines(board.fen(), self, count, signal, websiteOptions.humanPlies || 2, opponent)
          : humanLines(board.fen(), self, count)).map(item => ({
          pv: [setup, ...item.line],
          metric: Math.round(item.probability * 100) + "%",
        }));
      const options = websiteOptions;
      const engineLines = await analyze(board, { depth: options.depth, count, signal });
      if (lens !== "pro") return engineLines.map(line => ({ pv: [setup, ...line.pv], metric: score(line) }));
      const pro = await computePro(board, options, signal, engineLines, view.modelRatings, view.maiaError);
      return pro.lines.slice(0, count).map(line => ({ pv: [setup, ...line.pv], metric: proMetric(line) }));
    } : null,
    back: source ? async (event) => {
      const button = event.currentTarget;
      try {
        const tab = await chrome.tabs.update(source, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      } catch {
        button.textContent = "Game tab closed";
      }
    } : null,
  });
  if (focusKey)
    [...root.querySelectorAll("[data-focus-key]")]
      .find(node => node.dataset.focusKey === focusKey)?.focus();
}
const PROGRESS_MS = 250;
const PROGRESS_MIN_DEPTH = 10;
// Redraw partial engine lines at most every PROGRESS_MS, and only when the
// candidate moves or their scores change, to keep the panel calm.
function progressiveDraw(view, target) {
  const minimum = view.bullet ? 6 : PROGRESS_MIN_DEPTH;
  let shown = "", pending, timer, last = 0, stopped = false;
  const flush = () => {
    timer = undefined;
    if (stopped || !pending || renderedSite !== view || mode !== "website" || !view.pending) return;
    // Commentator mode shows no candidates, so partial results need no redraw.
    if (view.reactionsOnly) return;
    const lines = pending;
    pending = undefined;
    last = performance.now();
    view.depth = lines[0].depth;
    // Redraw only for a new move order or a score change of 0.1 or more.
    const signature = lines.map(line => line.pv[0] + line.type + (line.type === "cp" ? Math.round(line.value / 10) : line.value)).join();
    if (signature === shown) return;
    shown = signature;
    view.candidates = lines;
    draw(view);
  };
  return {
    update(lines) {
      if (stopped || !lines.length || lines[0].depth < Math.min(minimum, target) || lines[0].depth >= target) return;
      pending = lines;
      if (!timer) timer = setTimeout(flush, Math.max(0, PROGRESS_MS - (performance.now() - last)));
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
async function refreshStudio() {
  const version = ++revision;
  ({ activeWorkspace: workspace } = await api.get("activeWorkspace"));
  const key = workspace && "analysis:" + workspace.key.slice(5);
  const view = key && (await api.get(key))[key];
  if (version !== revision || mode !== "studio") return;
  if (view) draw(view);
  else show("Open the practice board or load a game to see local analysis.");
}

// Human-model move probabilities for the player to move (Maia-3, or the
// lightweight model when Maia is off or unavailable).
async function predictHuman(board, options, signal, skipMaia, ratings) {
  const [self, opponent] = moverRatings(ratings, board.fen());
  if (options.maia && !skipMaia) {
    try {
      signal?.throwIfAborted();
      const [prediction] = await maiaPredict([board], [self], [opponent]);
      signal?.throwIfAborted();
      return { ...prediction, model: "Maia-3" };
    } catch {
      signal?.throwIfAborted();
    }
  }
  return { ranks: humanRanks(board, self), outcome: null, model: "Local model" };
}

// Pro: check the likely human moves with Stockfish at the same depth, then rank
// everything by human likelihood within the style's evaluation tolerance.
async function computePro(board, options, signal, engineLines, ratings, skipMaia) {
  const human = await predictHuman(board, options, signal, skipMaia, ratings);
  const known = new Set(engineLines.map(line => line.pv[0]));
  const extra = [];
  for (const { move } of humanCandidates(human.ranks)) {
    const id = move.from + move.to + (move.promotion || "");
    if (known.has(id)) continue;
    signal?.throwIfAborted();
    const [line] = await analyze(board, { depth: options.depth, count: 1, only: id, signal });
    if (line?.pv[0] === id) extra.push({ ...line, searched: true });
  }
  const ranked = rankPro([...engineLines, ...extra], human.ranks, options.proStyle);
  return { ...ranked, model: human.model, outcome: human.outcome };
}

const statuses = {
  unsupported: ["Looking for a game…", "Open a game on Chess.com or Lichess."],
  waiting: ["Looking for the board…", "Reading the position on this tab."],
  "generic-missing": ["Looking for a game…", "This page does not show a full board. Open a game on Chess.com or Lichess."],
  "generic-ambiguous": ["Several boards found", "Open the game you want in its own tab."],
  "generic-invalid": ["Looking for a game…", "This page shows a position that is not legal."],
  position: ["Board found", "Waiting for a readable position."],
  unavailable: ["Looking for a game…", "Open a game on Chess.com or Lichess. Reload the tab if it was open before Chess Studio."],
};

// A tab that never answers (navigation, back/forward cache, a reloaded
// extension) must not freeze the panel: every request has a deadline.
function askTab(id, message, ms = 1500) {
  return Promise.race([
    chrome.tabs.sendMessage(id, message),
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}
let lastTick = Date.now();
const injected = new Set();
const READER_SITES = /^https:\/\/(?:www\.)?(?:chess\.com|lichess\.org)\//;
async function injectReaders(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!READER_SITES.test(tab.url || "")) return false;
    if (/chess\.com/.test(tab.url))
      await chrome.scripting.executeScript({ target: { tabId }, files: ["read-fen.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["detect-entry.js"] });
    return true;
  } catch {
    return false;
  }
}
async function followWebsite() {
  lastTick = Date.now();
  const version = revision;
  const id = sourceOverride || active?.id;
  let observation;
  try {
    if (id)
      observation = await askTab(id, "chess-studio-position");
  } catch {
    /* No supported content script in the current tab. */
  }
  // Tabs opened before the extension was installed or reloaded have no
  // content script yet: add it once, so the user never has to refresh.
  if (id && !observation && !injected.has(id)) {
    injected.add(id);
    if (await injectReaders(id)) {
      try { observation = await askTab(id, "chess-studio-position", 2500); } catch { /* still loading */ }
    }
  }
  if (id && (!observation || observation.status === "unsupported")) {
    try {
      observation =
        (await askTab(id, "chess-studio-generic-position")) ||
        observation;
    } catch {
      /* The user has not granted access to this tab. */
    }
  }
  if (observation?.generic) {
    try {
      const position = new Chess(observation.fen);
      const other = position.turn() === "w" ? "b" : "w";
      if (
        position.isAttacked(
          position.findPiece({ type: "k", color: other })[0],
          position.turn(),
        )
      )
        throw Error();
    } catch {
      observation = { status: "generic-invalid" };
    }
  }
  if (version !== revision || mode !== "website") return;
  if (!observation || observation.status !== "ready") {
    const key = (id || "") + ":" + (observation?.status || "unavailable");
    if (positionKey !== key) {
      positionKey = key;
      controller?.abort();
      renderedSite = undefined;
      disconnectArrows();
      renderScanning(root, ...statuses[observation?.status || "unavailable"]);
      if (
        floating &&
        id &&
        (!observation || observation.status === "unsupported")
      ) {
        const connect = document.createElement("button");
        connect.textContent = "Read this tab";
        connect.onclick = async () => {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: id },
              files: ["generic-board.js"],
            });
            refresh();
          } catch {
            show(
              "Chrome did not grant access. Open the extension from the toolbar of the chess tab, then try again.",
            );
          }
        };
        root.append(connect);
      }
    }
  } else {
    const key = JSON.stringify([
      id, observation.fen, observation.last?.san,
      observation.flipped, observation.playerColor, observation.names,
      observation.automaticArrows, observation.ratings,
    ]);
    if (positionKey !== key) {
      positionKey = key;
      controller?.abort();
      controller = new AbortController();
      const board = new Chess(observation.fen);
      if (opening && params.has("player")) {
        const color = params.get("player");
        if (["you", "opponent", "w", "b"].includes(color)) selectedPlayers.set(id, color);
      }
      const selectedPlayer = selectedPlayers.get(id);
      const yourColor = observation.playerColor;
      const selectedColor = selectedPlayer === "you" ? yourColor
        : selectedPlayer === "opponent" ? (yourColor === "w" ? "b" : yourColor === "b" ? "w" : null)
        : selectedPlayer;
      const reactionsOnly = !isWebsiteWindow && websiteOptions.view === "reactions";
      const modelRatings = playerRatings(websiteOptions, observation);
      const [moverElo] = moverRatings(modelRatings, observation.fen);
      let engineDone;
      const view = {
        followTurn: websiteOptions.arrowSide !== "selection",
        previewOnClick: websiteOptions.arrowSide === "preview",
        replyFocus: !websiteOptions.bullet && Boolean(selectedColor && selectedColor !== board.turn()),
        fen: observation.fen,
        last: observation.last,
        mode: "website",
        bullet: websiteOptions.bullet,
        site: observation.site,
        analysis: Boolean(observation.analysis),
        source: id,
        generic: observation.generic,
        reactionsOnly,
        automaticArrows: websiteOptions.enabled && websiteOptions.arrows &&
          !reactionsOnly &&
          observation.automaticArrows,
        flipped: observation.flipped,
        names: observation.names,
        playerColor: observation.playerColor,
        ratings: observation.ratings,
        modelRatings,
        proStyle: websiteOptions.proStyle,
        show: websiteOptions.enabled,
        coachVisible: websiteOptions.coach === "always",
        candidates: [],
        human:
          !websiteOptions.maia && (!websiteOptions.bullet || controls.lens === "human") && websiteOptions.enabled && !board.isGameOver()
            ? humanLines(
                observation.fen,
                moverElo,
                websiteOptions.lines,
              )
            : [],
        // Commentator mode shows no candidates: skip the search so grading
        // gets the engine to itself and reactions arrive quickly.
        pending:
          websiteOptions.enabled &&
          !reactionsOnly &&
          !board.isGameOver(),
      };
      if (opening) {
        opening = false;
        if (params.get("from") === view.fen) {
          view.selectedRoots = { [controls.lens]: params.get("line") };
          view.previewSide = params.get("preview") === "1";
          view.replyFocus = params.get("reply") === "1";
          view.selectedReply = params.get("response");
          const options = controls.modes[controls.lens][view.replyFocus ? "reply" : "turn"];
          options.all = params.get("all") === "1";
          options.other = params.get("other") !== "0";
        }
      }
      if (view.pending) {
        const options = websiteOptions;
        const signal = controller.signal;
        view.engineDone = new Promise((resolve, reject) => { engineDone = { resolve, reject }; });
        view.engineDone.catch(() => {});
        view.loadPro = () => {
          if (view.proPending || view.pro) return;
          view.proPending = true;
          view.engineDone
            .then(lines => computePro(board, options, signal, lines, view.modelRatings, view.maiaError))
            .then(result => { view.pro = result; })
            .catch(error => {
              if (error.name !== "AbortError") view.pro = { lines: view.candidates, trap: null, failed: true };
            })
            .finally(() => {
              view.proPending = false;
              if (renderedSite === view && controls.lens === "pro") draw(view);
            });
        };
        if (!options.maia && !view.human.length) view.loadHuman = () => {
          view.human = humanLines(view.fen, moverElo, options.lines);
        };
      }
      if (websiteOptions.maia && view.pending) {
        view.loadHuman = () => {
          if (view.humanPending || view.human.length || view.maiaError) return;
          view.humanModel = "Maia-3";
          view.humanPending = true;
          maiaLines(view.fen, moverElo, websiteOptions.lines, controller.signal, websiteOptions.humanPlies || 2,
            moverRatings(modelRatings, view.fen)[1])
            .then(lines => {
              view.human = lines;
              // The outcome estimate is optional: it redraws on its own and never fails the lines.
              predictHuman(board, websiteOptions, controller.signal, false, modelRatings).then(prediction => {
                view.humanOutcome = prediction.outcome;
                if (renderedSite === view && controls.lens === "human") draw(view);
              }, () => {});
            })
            .catch(error => {
              if (error.name === "AbortError" || renderedSite !== view) return;
              view.maiaError = true;
              view.humanModel = "Local model · Maia unavailable";
              view.human = humanLines(view.fen, moverElo, websiteOptions.lines);
            }).finally(() => {
              if (renderedSite !== view) return;
              view.humanPending = false;
              if (controls.lens === "human") draw(view);
            });
        };
      }
      attachGrades(view);
      renderedSite = view;
      draw(view);
      if (!view.bullet) gradeMoveOf(view);
      if (controls.lens === "pro" && !view.replyFocus) view.loadPro?.();
      if (view.pending && view.playerColor && board.turn() !== view.playerColor && !view.analysis)
        findPremove(view, board, controller.signal);
      if (view.pending) {
        // Progressive results: show completed shallow iterations while the search
        // deepens. `view.searching` / `view.depth` / `view.targetDepth` describe it;
        // the final candidates are still the completed target-depth result.
        view.searching = true;
        view.depth = 0;
        view.targetDepth = websiteOptions.depth;
        const progress = progressiveDraw(view, websiteOptions.depth);
        analyze(board, {
          depth: websiteOptions.depth,
          count: websiteOptions.lines,
          signal: controller.signal,
          onProgress: progress.update,
        })
          .then((lines) => {
            progress.stop();
            if (renderedSite !== view || mode !== "website") return;
            view.pending = false;
            view.searching = false;
            view.candidates = lines;
            view.depth = lines[0]?.depth ?? view.targetDepth;
            engineDone.resolve(lines);
            draw(view);
          })
          .catch((error) => {
            progress.stop();
            engineDone.reject(error);
            if (renderedSite !== view || error.name === "AbortError") return;
            view.pending = false;
            view.searching = false;
            view.error = error.message;
            draw(view);
          });
      }
    }
  }
  timer = setTimeout(() => followWebsite().catch(showError), 450);
}
// Safe premove while the opponent thinks (see premove.mjs). The check uses a
// shallower search than the panel so it is ready within the opponent's move.
async function findPremove(view, board, signal) {
  const options = websiteOptions;
  const premoveMode = ["obvious", "safe", "off"].includes(options.premoves) ? options.premoves : "obvious";
  if (premoveMode === "off") return;
  view.premovePending = true;
  try {
    const human = await predictHuman(board, options, signal, view.maiaError, view.modelRatings);
    const weights = new Map(human.ranks.map(row => [uciOf(row.move), row.probability]));
    // Wide positions get a shallower check so it still finishes within the opponent's move.
    const width = board.moves().length;
    const depth = Math.max(8, Math.min(width > 30 ? 10 : 12, options.depth - 4));
    view.premove = await findSafePremove(board, { analyze, depth, signal, weights, mode: premoveMode });
  } catch (error) {
    if (error.name === "AbortError") return;
    view.premove = null;
  } finally {
    view.premovePending = false;
  }
  if (renderedSite === view && !signal.aborted) draw(view);
}
// Move-quality grading. Each new move is graded on its own search, so a fast
// reply from the opponent (e.g. a Chess.com bot) never cancels the reaction to
// the user's move. Grades live per source tab and are re-attached to every view.
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const GRADE_DEPTH = 12;
const gradeStores = new Map();
function gradeStore(source) {
  let store = gradeStores.get(source);
  if (!store) gradeStores.set(source, (store = { mine: null, opp: null, latest: null, log: [], seen: new Set(), history: [] }));
  return store;
}
function attachGrades(view) {
  const store = gradeStores.get(view.source);
  if (!store) return;
  // Only show grades for moves of the game on screen.
  const known = (entry) => entry && view.fen !== entry.move.before;
  view.myGrade = known(store.mine) ? store.mine : null;
  view.oppGrade = known(store.opp) ? store.opp : null;
  view.grade = store.latest?.grade || null;
  view.gradeMove = store.latest?.move || null;
  view.streak = streak(store.log);
  view.gradeCelebrate = Boolean(store.latest?.celebrate);
  // Graded moves of this game in board order, for the commentary feed.
  view.gradeHistory = store.history.filter((entry) => entry.ply <= plyOf(view.fen));
}
function plyOf(fen) {
  const [, turn, , , , move] = fen.split(" ");
  return (Number(move) - 1) * 2 + (turn === "b" ? 1 : 0);
}
async function gradeMoveOf(view) {
  const last = view.last;
  if (!last?.before || !last?.after || !websiteOptions.enabled) return;
  const store = gradeStore(view.source);
  if (store.seen.has(last.after)) return;
  store.seen.add(last.after);
  if (last.before.startsWith(START_FEN)) {
    store.mine = store.opp = store.latest = null;
    store.log = [];
    store.history = [];
  }
  const depth = Math.min(websiteOptions.depth, GRADE_DEPTH);
  const [[best], [reply]] = await Promise.all([
    analyze(new Chess(last.before), { depth, count: 1 }),
    analyze(new Chess(last.after), { depth, count: 1 }),
  ]);
  if (!best?.pv?.length) return;
  const bestMove = best.pv[0];
  const wasBest = bestMove.slice(0, 4) === last.from + last.to &&
    (bestMove[4] || "") === (last.promotion || "");
  // The reply is scored from the opponent’s perspective. Handle terminal positions directly.
  const afterGame = new Chess(last.after);
  const afterCp = afterGame.isCheckmate() ? 10000 : afterGame.isGameOver() ? 0 : -toCentipawns(reply);
  const beforeCp = toCentipawns(best);
  const grade = gradedTactic(gradeMove(beforeCp, afterCp, wasBest), last, reply, beforeCp, afterCp, wasBest);
  const live = renderedSite?.source === view.source ? renderedSite : null;
  const playerColor = live?.playerColor ?? view.playerColor;
  const mine = !playerColor || last.color === playerColor;
  const move = { san: last.san, color: last.color, before: last.before, after: last.after, from: last.from, to: last.to };
  const entry = {
    grade, move, mine, ply: plyOf(last.after), celebrate: mine && grade.tone === "best",
    commentary: moveCommentary(last, grade, best, reply),
  };
  store.history = [...store.history.filter((item) => item.ply < entry.ply), entry]
    .sort((a, b) => a.ply - b.ply).slice(-12);
  if (mine) {
    store.mine = entry;
    store.log.push(grade);
  } else store.opp = entry;
  store.latest = entry;
  if (live) {
    attachGrades(live);
    draw(live);
  }
}
function refresh() {
  reset();
  if (mode === "website") followWebsite().catch(showError);
  else refreshStudio().catch(showError);
}
function studioUrl() {
  const id = sourceOverride || active?.id;
  const query = new URLSearchParams();
  if (mode === "website" && id) query.set("source", id);
  query.set("lens", controls.lens);
  const view = renderedSite;
  if (view) {
    if (selectedPlayers.has(id)) query.set("player", selectedPlayers.get(id));
    query.set("from", view.fen);
    query.set("line", view.selectedRoots?.[controls.lens] || "");
    if (view.previewSide) query.set("preview", "1");
    if (view.replyFocus) query.set("reply", "1");
    if (view.selectedReply) query.set("response", view.selectedReply);
    const options = controls.modes[controls.lens][view.replyFocus ? "reply" : "turn"];
    query.set("all", Number(options.all));
    query.set("other", Number(options.other));
  }
  return chrome.runtime.getURL("website.html") + "?" + query;
}
document.getElementById("open").onclick = async () => {
  if (mode === "website" && !isWebsiteWindow) {
    await chrome.tabs.create({ url: studioUrl() });
  } else {
    const fallback = chrome.runtime.getURL("index.html");
    const url = workspace?.url?.startsWith(fallback + "?")
      ? workspace.url
      : fallback;
    try {
      const tab = await chrome.tabs.get(workspace?.tabId);
      if (tab.url !== url && tab.pendingUrl !== url)
        await chrome.tabs.create({ url });
      else {
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    } catch {
      await chrome.tabs.create({ url });
    }
  }
};
if (document.body.classList.contains("panel") && !floating) {
  chrome.tabs.onActivated.addListener(async (info) => {
    if (info.windowId !== initialTab?.windowId) return;
    try {
      active = await chrome.tabs.get(info.tabId);
    } catch {
      active = undefined;
    }
    if (mode === "website") refresh();
  });
}
chrome.runtime.onMessage.addListener((message, sender) => {
  if (
    message?.type !== "chess-studio-board-changed" ||
    sender.id !== chrome.runtime.id ||
    sender.tab?.id !== (sourceOverride || active?.id) ||
    mode !== "website"
  ) return;
  revision++;
  clearTimeout(timer);
  followWebsite().catch(showError);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.preferences) {
    const previousMotion = prefs.motion;
    prefs = { ...prefs, ...changes.preferences.newValue };
    applyTheme();
    if (previousMotion !== prefs.motion && renderedSite) draw(renderedSite);
  }
  if (changes.websiteOptions) {
    const previousLens = websiteOptions.lens;
    const previousBullet = websiteOptions.bullet;
    websiteOptions = websiteSearchOptions(changes.websiteOptions.newValue);
    if (previousLens !== websiteOptions.lens || previousBullet !== websiteOptions.bullet)
      controls.lens = analysisLens(websiteOptions.lens);
    refresh();
    return;
  }
  if (
    mode === "studio" &&
    Object.keys(changes).some(
      (key) => key === "activeWorkspace" || key.startsWith("analysis:"),
    )
  )
    refreshStudio().catch(showError);
});
function showError() {
  show("Analysis could not be loaded. Reopen this view and retry.", "error");
}
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => {
  if (renderedSite && websiteOptions.view === "reactions" && !isWebsiteWindow) draw(renderedSite);
});
applyTheme();
refresh();
// Watchdog: restart the follow loop if it has not ticked for a while.
setInterval(() => {
  if (mode === "website" && Date.now() - lastTick > 4000) refresh();
}, 2000);
