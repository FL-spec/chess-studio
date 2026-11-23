import { analyzeCommand } from "./engine-core.mjs";

// Offscreen document: the single Stockfish host shared by every extension view.
chrome.runtime.onConnect.addListener((port) => {
  if (port.sender?.id !== chrome.runtime.id || port.name !== "chess-studio-engine") return;
  const controllers = new Map();
  port.onMessage.addListener((message) => {
    if (message?.type === "hello") return port.postMessage({ type: "ready" });
    if (message?.type === "cancel") return controllers.get(message.id)?.abort();
    if (message?.type !== "analyze") return;
    const { id, command, expected, depth, count, only, progress } = message;
    const controller = new AbortController();
    controllers.set(id, controller);
    const send = (data) => { try { port.postMessage({ id, ...data }); } catch {} };
    analyzeCommand(command, expected, {
      depth, count, only, signal: controller.signal,
      onProgress: progress ? (lines) => send({ type: "progress", lines }) : undefined,
    }).then(
      (lines) => send({ type: "result", lines }),
      (error) => send({ type: "error", error: String(error?.message || error), name: error?.name }),
    ).finally(() => controllers.delete(id));
  });
  port.onDisconnect.addListener(() => {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
  });
});
