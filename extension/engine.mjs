import { analyzeCommand } from "./engine-core.mjs";

export const uci = (move) => move.from + move.to + (move.promotion || "");

// All extension views (popup, side panel, Studio, review) share one Stockfish host
// in an offscreen document: one warm engine, one cache, one search per position.
// When the offscreen API is unavailable (or the host fails), the same engine core
// runs in this page instead, so behaviour never depends on the host.
const HOST_URL = "engine-host.html";
let port, serial = 0, hostFailedAt = 0;
const jobs = new Map();
let opening;

const remoteAvailable = () =>
  typeof chrome !== "undefined" && chrome.offscreen?.createDocument && chrome.runtime?.getContexts &&
  location.protocol === "chrome-extension:" && Date.now() - hostFailedAt > 30000;

// The lock serialises creation across views (one offscreen document per extension).
const ensureHost = () => navigator.locks.request("chess-studio-engine-host", createHost);
async function createHost() {
  const url = chrome.runtime.getURL(HOST_URL);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [url] });
  if (contexts.length) return;
  try {
    await chrome.offscreen.createDocument({
      url: HOST_URL, reasons: ["WORKERS"],
      justification: "Runs the local Stockfish engine once for all Chess Studio views.",
    });
  } catch (error) {
    // Another view created it at the same moment.
    if (!/single offscreen|already/i.test(String(error?.message))) throw error;
  }
}
function connect() {
  opening ??= (async () => {
    await ensureHost();
    const next = chrome.runtime.connect({ name: "chess-studio-engine" });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Engine host did not answer.")), 3000);
      const hello = (message) => {
        if (message?.type !== "ready") return;
        clearTimeout(timer);
        next.onMessage.removeListener(hello);
        resolve();
      };
      next.onMessage.addListener(hello);
      next.onDisconnect.addListener(() => { clearTimeout(timer); reject(new Error("Engine host closed.")); });
      next.postMessage({ type: "hello" });
    });
    next.onMessage.addListener(({ id, type, lines, error, name }) => {
      const job = jobs.get(id);
      if (!job) return;
      if (type === "progress") return job.onProgress?.(lines);
      jobs.delete(id);
      if (type === "result") job.resolve(lines);
      else job.reject(Object.assign(name === "AbortError" ? new DOMException(error, name) : new Error(error), {}));
    });
    next.onDisconnect.addListener(() => {
      if (port === next) port = undefined;
      opening = undefined;
      // Host went away mid-search: finish those searches locally.
      for (const [id, job] of jobs) {
        jobs.delete(id);
        job.fallback();
      }
    });
    port = next;
    return next;
  })().catch((error) => {
    opening = undefined;
    throw error;
  });
  return opening;
}

function analyzeRemote(command, expected, options) {
  const { signal, onProgress, depth = 12, count = 3, only } = options;
  const local = () => analyzeCommand(command, expected, options);
  return connect().then((host) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Cancelled", "AbortError"));
    const id = ++serial;
    const abort = () => {
      if (!jobs.delete(id)) return;
      host.postMessage({ type: "cancel", id });
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const done = (fn) => (value) => { signal?.removeEventListener("abort", abort); fn(value); };
    jobs.set(id, {
      onProgress, resolve: done(resolve), reject: done(reject),
      fallback: () => { signal?.removeEventListener("abort", abort); local().then(resolve, reject); },
    });
    signal?.addEventListener("abort", abort, { once: true });
    host.postMessage({ type: "analyze", id, command, expected, depth, count, only, progress: Boolean(onProgress) });
  }), () => {
    hostFailedAt = Date.now();
    return local();
  });
}

/**
 * Analyse a chess.js board with Stockfish 19. Results are identical to a fresh
 * engine per call; identical concurrent requests share one search, and finished
 * results are cached (LRU) so takebacks and re-renders are instant.
 * `onProgress(lines)` (optional) receives every completed iteration (depth 1, 2, …).
 */
export function analyze(board, options = {}) {
  if (board.isGameOver()) return Promise.resolve([]);
  if (options.signal?.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
  const history = board.history({ verbose: true });
  const start = history[0]?.before || board.fen();
  const command = "position fen " + start + (history.length ? " moves " + history.map(uci).join(" ") : "");
  const expected = options.only ? 1 : Math.min(options.count ?? 3, board.moves().length);
  return remoteAvailable() ? analyzeRemote(command, expected, options) : analyzeCommand(command, expected, options);
}

export function score(line) {
  if (line.type === "mate")
    return line.value > 0
      ? "Mate in " + line.value
      : "Mated in " + Math.abs(line.value);
  return (line.value > 0 ? "+" : "") + (line.value / 100).toFixed(2);
}
