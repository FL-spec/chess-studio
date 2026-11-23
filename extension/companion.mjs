import { websiteDefaults } from "./website-preferences.mjs";
import { Chess } from "./vendor/chess.mjs";
import { describe, renderCompanion, renderScanning } from "./companion-view.mjs";
import { analyze, score } from "./engine.mjs";
import { maiaLines } from "./maia.mjs";
import { humanLines } from "./human-lines.mjs";
import { supported } from "./detect.mjs";
import { gradeMove, streak, toCentipawns } from "./gamify.mjs";
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
let websiteOptions = { ...websiteDefaults, ...stored.websiteOptions };
const arrows = () => ({ all: false, other: true });
const controls = {
  lens: (params.get("lens") || websiteOptions.lens) === "human" ? "human" : "engine",
  modes: {
    engine: { turn: arrows(), reply: arrows() },
    human: { turn: arrows(), reply: arrows() },
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
    if (view.automaticArrows) showSourceLines(view, lines);
    else if (source && !view.generic && interaction) {
      chrome.tabs.sendMessage(source, {
        type: "chess-studio-mark",
        fen: view.fen,
        lines,
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
      const count = websiteOptions.lines;
      if (lens === "human")
        return (websiteOptions.maia && !view.maiaError
          ? await maiaLines(board.fen(), websiteOptions.elo, count, signal)
          : humanLines(board.fen(), websiteOptions.elo, count)).map(item => ({
          pv: [setup, ...item.line],
          metric: Math.round(item.probability * 100) + "%",
        }));
      const lines = await analyze(board, { depth: websiteOptions.depth, count, signal });
      return lines.map(line => ({ pv: [setup, ...line.pv], metric: score(line) }));
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
const PROGRESS_MS = 120;
const PROGRESS_MIN_DEPTH = 8;
// Redraw partial engine lines at most every PROGRESS_MS, and only when the
// candidate moves or their scores change, to keep the panel calm.
function progressiveDraw(view, target) {
  let shown = "", pending, timer, last = 0, stopped = false;
  const flush = () => {
    timer = undefined;
    if (stopped || !pending || renderedSite !== view || mode !== "website" || !view.pending) return;
    const lines = pending;
    pending = undefined;
    last = performance.now();
    view.depth = lines[0].depth;
    const signature = lines.map(line => line.pv[0] + line.type + line.value).join();
    if (signature === shown) return;
    shown = signature;
    view.candidates = lines;
    draw(view);
  };
  return {
    update(lines) {
      if (stopped || !lines.length || lines[0].depth < Math.min(PROGRESS_MIN_DEPTH, target) || lines[0].depth >= target) return;
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

const statuses = {
  unsupported: ["Looking for a game…", "Open a game on Chess.com or Lichess."],
  waiting: ["Looking for the board…", "Reading the position on this tab."],
  "generic-missing": ["Looking for a game…", "This page does not show a full board. Open a game on Chess.com or Lichess."],
  "generic-ambiguous": ["Several boards found", "Open the game you want in its own tab."],
  "generic-invalid": ["Looking for a game…", "This page shows a position that is not legal."],
  position: ["Board found", "Waiting for a readable position."],
  unavailable: ["Looking for a game…", "Open a game on Chess.com or Lichess. Reload the tab if it was open before Chess Studio."],
};

async function followWebsite() {
  const version = revision;
  const id = sourceOverride || active?.id;
  let observation;
  try {
    if (id)
      observation = await chrome.tabs.sendMessage(id, "chess-studio-position");
  } catch {
    /* No supported content script in the current tab. */
  }
  if (id && (!observation || observation.status === "unsupported")) {
    try {
      observation =
        (await chrome.tabs.sendMessage(id, "chess-studio-generic-position")) ||
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
      observation.automaticArrows,
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
      const view = {
        followTurn: websiteOptions.arrowSide !== "selection",
        previewOnClick: websiteOptions.arrowSide === "preview",
        replyFocus: Boolean(selectedColor && selectedColor !== board.turn()),
        fen: observation.fen,
        last: observation.last,
        mode: "website",
        site: observation.site,
        analysis: Boolean(observation.analysis),
        source: id,
        generic: observation.generic,
        reactionsOnly: websiteOptions.view === "reactions",
        automaticArrows: websiteOptions.enabled && websiteOptions.arrows &&
          websiteOptions.view !== "reactions" &&
          observation.automaticArrows,
        flipped: observation.flipped,
        names: observation.names,
        playerColor: observation.playerColor,
        show: websiteOptions.enabled,
        coachVisible: websiteOptions.coach === "always",
        candidates: [],
        human:
          !websiteOptions.maia && websiteOptions.enabled && !board.isGameOver()
            ? humanLines(
                observation.fen,
                websiteOptions.elo,
                websiteOptions.lines,
              )
            : [],
        pending:
          websiteOptions.enabled &&
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
      if (websiteOptions.maia && view.pending) {
        view.loadHuman = () => {
          if (view.humanPending || view.human.length || view.maiaError) return;
          view.humanModel = "Maia-3";
          view.humanPending = true;
          maiaLines(view.fen, websiteOptions.elo, websiteOptions.lines, controller.signal)
            .then(lines => { view.human = lines; })
            .catch(error => {
              if (error.name === "AbortError" || renderedSite !== view) return;
              view.maiaError = true;
              view.humanModel = "Local model · Maia unavailable";
              view.human = humanLines(view.fen, websiteOptions.elo, websiteOptions.lines);
            }).finally(() => {
              if (renderedSite !== view) return;
              view.humanPending = false;
              if (controls.lens === "human") draw(view);
            });
        };
      }
      renderedSite = view;
      draw(view);
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
            draw(view);
            gradeLastMove(view, lines[0], controller.signal).catch(() => {});
          })
          .catch((error) => {
            progress.stop();
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
// Move-quality grading. The position before the last move is usually cached by
// the engine (it was the previous live position), so this costs little.
const gradeLogs = new Map();
async function gradeLastMove(view, after, signal) {
  const last = view.last;
  if (!last?.before || !after || !websiteOptions.enabled) return;
  const before = new Chess(last.before);
  const [best] = await analyze(before, { depth: websiteOptions.depth, count: 1, signal });
  if (!best?.pv?.length || renderedSite !== view) return;
  const bestMove = best.pv[0];
  const wasBest = bestMove.slice(0, 4) === last.from + last.to &&
    (bestMove[4] || "") === (last.promotion || "");
  // `best` scores the mover; `after` scores the opponent, so negate it.
  const grade = gradeMove(toCentipawns(best), -toCentipawns(after), wasBest);
  const mine = !view.playerColor || last.color === view.playerColor;
  const key = view.source + ":" + last.color;
  let log = gradeLogs.get(key);
  // A move from the starting position begins a new game.
  if (!log || last.before.startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR")) log = [];
  if (log.at(-1)?.fen !== last.after) log.push({ ...grade, fen: last.after });
  gradeLogs.set(key, log);
  view.grade = grade;
  view.streak = mine ? streak(log) : 0;
  view.gradeCelebrate = mine && grade.key === "best";
  if (renderedSite === view) draw(view);
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
    prefs = { ...prefs, ...changes.preferences.newValue };
    applyTheme();
  }
  if (changes.websiteOptions)
    websiteOptions = { ...websiteDefaults, ...changes.websiteOptions.newValue };
  if (changes.websiteOptions) {
    if (changes.websiteOptions.oldValue?.lens !== changes.websiteOptions.newValue?.lens)
      controls.lens = websiteOptions.lens === "human" ? "human" : "engine";
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
applyTheme();
refresh();
