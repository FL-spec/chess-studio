// Stockfish workers are expensive to start (99 MB WASM + NNUE, about 300 ms each),
// so finished workers stay warm in a small pool. Every search sends `ucinewgame`
// first, which clears the hash and history tables: a reused single-threaded worker
// therefore returns exactly what a fresh one would.
const ENGINE_URL = "./vendor/stockfish-19-single.js";
const MAX_IDLE = 1;
const IDLE_MS = 45000;
const CACHE_SIZE = 64;
const idle = [];
const cache = new Map();
const running = new Map();

function spawn() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(ENGINE_URL);
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Stockfish could not start."));
    };
    worker.onmessage = ({ data }) => {
      if (String(data) !== "uciok") return;
      worker.postMessage("setoption name UCI_ShowWDL value true");
      resolve(worker);
    };
    worker.postMessage("uci");
  });
}
function acquire() {
  const entry = idle.pop();
  if (!entry) return spawn();
  clearTimeout(entry.timer);
  return Promise.resolve(entry.worker);
}
function release(worker) {
  worker.onmessage = worker.onerror = null;
  if (idle.length >= MAX_IDLE) return worker.terminate();
  const entry = { worker };
  entry.timer = setTimeout(() => {
    idle.splice(idle.indexOf(entry), 1);
    worker.terminate();
  }, IDLE_MS);
  idle.push(entry);
}

function search(command, { depth, count, only, expected }, notify) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    let worker, done = false;
    const lines = new Map();
    let completed = [];
    const timeout = setTimeout(
      () => completed.length ? finish(null, completed, true) : finish(new Error("Stockfish timed out. Please retry.")),
      18000,
    );
    function finish(error, result, kill) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      if (worker) {
        if (kill) worker.terminate();
        else release(worker);
      }
      if (error) reject(error);
      else resolve({ lines: result, complete: !kill });
    }
    cancel = () => {
      if (done) return;
      const error = new DOMException("Cancelled", "AbortError");
      if (!worker) return finish(error);
      // Stop the search and keep the warm worker once it confirms with bestmove.
      const stuck = setTimeout(() => finish(error, null, true), 1000);
      worker.onmessage = ({ data }) => {
        if (String(data).startsWith("bestmove")) {
          clearTimeout(stuck);
          finish(error);
        }
      };
      worker.postMessage("stop");
    };
    acquire().then((ready) => {
      worker = ready;
      if (done) return release(worker);
      worker.onerror = (event) =>
        finish(new Error(event.message || "Stockfish could not start."), null, true);
      worker.onmessage = ({ data }) => {
        const message = String(data);
        if (message === "readyok") {
          worker.postMessage(command);
          worker.postMessage("go depth " + depth + (only ? " searchmoves " + only : ""));
        } else if (message.startsWith("info ")) {
          const match = message.match(
            /depth (\d+).*?multipv (\d+).*?score (cp|mate) (-?\d+).*? pv (.+)/,
          );
          if (!match) return;
          const [, reached, index, type, value, pv] = match;
          const rank = Number(index);
          const level = Number(reached);
          if (!lines.has(level)) lines.set(level, new Map());
          const iteration = lines.get(level);
          const outcomes = /\bwdl (\d+) (\d+) (\d+)/.exec(message);
          iteration.set(rank, {
            depth: level, type, value: Number(value), pv: pv.trim().split(/\s+/),
            wdl: outcomes?.slice(1).map(Number),
          });
          if (iteration.size === expected && level >= (completed[0]?.depth || 0)) {
            completed = [...iteration].sort(([a], [b]) => a - b).map(([, line]) => line);
            notify(completed);
          }
        } else if (message.startsWith("bestmove")) {
          finish(null, completed);
        }
      };
      worker.postMessage("setoption name MultiPV value " + count);
      worker.postMessage("ucinewgame");
      worker.postMessage("isready");
    }, (error) => finish(error));
  });
  return { promise, cancel };
}

const copy = (lines) => lines.map((line) => ({ ...line, pv: [...line.pv], wdl: line.wdl && [...line.wdl] }));

/**
 * Run (or join, or serve from cache) one search. `command` is the UCI
 * `position …` line; `expected` the number of lines a complete iteration has.
 */
export function analyzeCommand(command, expected, { depth = 12, count = 3, signal, only, onProgress } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
  const key = [command, depth, count, only || ""].join("|");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    if (onProgress) onProgress(copy(hit));
    return Promise.resolve(copy(hit));
  }
  let job = running.get(key);
  if (!job) {
    job = { listeners: new Set(), users: 0, latest: null };
    const { promise, cancel } = search(command, { depth, count, only, expected }, (lines) => {
      job.latest = lines;
      for (const listener of job.listeners) listener(copy(lines));
    });
    job.promise = promise;
    job.cancel = cancel;
    running.set(key, job);
    promise.then(({ lines, complete }) => {
      if (!complete) return;
      cache.set(key, lines);
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
    }, () => {}).finally(() => {
      if (running.get(key) === job) running.delete(key);
    });
  }
  job.users++;
  if (onProgress) {
    job.listeners.add(onProgress);
    if (job.latest) onProgress(copy(job.latest));
  }
  return new Promise((resolve, reject) => {
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      signal?.removeEventListener("abort", abort);
      if (onProgress) job.listeners.delete(onProgress);
      job.users--;
    };
    const abort = () => {
      leave();
      if (job.users === 0) {
        if (running.get(key) === job) running.delete(key);
        job.cancel();
      }
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    job.promise.then(({ lines }) => {
      if (left) return;
      leave();
      resolve(copy(lines));
    }, (error) => {
      if (left) return;
      leave();
      reject(error);
    });
  });
}

