export const modelUrl = "https://raw.githubusercontent.com/CSSLab/maia-platform-frontend/91516ecb3be4c4f3ef3b0470a78570443ff27eb3/public/maia3/maia3_simplified.onnx";
const digest = "47172964fecdc8ee8018e15059dc679baef550766bc7adacec227ada1288624b";
let ready;
let retryAt = 0;
export function installMaia() {
  if (Date.now() < retryAt) return Promise.reject(Error("Maia download unavailable."));
  ready ??= navigator.locks.request("chess-studio-maia-download", prepare).catch(error => {
    ready = undefined;
    retryAt = Date.now() + 30000;
    throw error;
  });
  return ready;
}
async function prepare() {
  const cache = await caches.open("chess-studio-models");
  if ((await cache.keys(modelUrl)).length) return;
  const response = await fetch(modelUrl, { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error("Model download failed.");
  const bytes = await response.arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  if (Array.from(hash, b => b.toString(16).padStart(2, "0")).join("") !== digest)
    throw Error("Model verification failed.");
  await cache.put(modelUrl, new Response(bytes));
}
