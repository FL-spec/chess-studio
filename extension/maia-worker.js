importScripts("vendor/ort/ort.wasm.min.js");
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL("vendor/ort/", location.href).href;
let session;
async function load(url) {
  const response = await (await caches.open("chess-studio-models")).match(url);
  if (!response) throw Error("Download Maia-3 in Settings.");
  return ort.InferenceSession.create(await response.arrayBuffer(), { executionProviders: ["wasm"] });
}
onmessage = async ({ data }) => {
  const { id, url, tokens, ratings } = data;
  try {
    session ??= load(url);
    const model = await session;
    const count = ratings.length;
    const elo = new ort.Tensor("float32", ratings, [count]);
    const feeds = { tokens: new ort.Tensor("float32", tokens, [count, 64, 12]), elo_self: elo, elo_oppo: elo };
    const outputs = await model.run(feeds, ["logits_move"]);
    const logits = outputs.logits_move.data.slice();
    outputs.logits_move.dispose();
    postMessage({ id, logits }, [logits.buffer]);
  } catch (error) {
    session = undefined;
    postMessage({ id, error: String(error.message || error) });
  }
};
