importScripts("vendor/ort/ort.wasm.min.js");
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL("vendor/ort/", location.href).href;
let session;
async function load(url) {
  const response = await (await caches.open("chess-studio-models")).match(url);
  if (!response) throw Error("Download Maia-3 in Settings.");
  return ort.InferenceSession.create(await response.arrayBuffer(), { executionProviders: ["wasm"] });
}
// `ratings` is the rating of the player to move; `opponents` the rating of the
// other player (Maia-3 conditions on both). The value head is returned when the
// model has one, so callers can read a rating-aware outcome estimate.
onmessage = async ({ data }) => {
  const { id, url, tokens, ratings, opponents } = data;
  try {
    session ??= load(url);
    const model = await session;
    const count = ratings.length;
    const feeds = {
      tokens: new ort.Tensor("float32", tokens, [count, 64, 12]),
      elo_self: new ort.Tensor("float32", ratings, [count]),
      elo_oppo: new ort.Tensor("float32", opponents || ratings, [count]),
    };
    const names = model.outputNames.includes("logits_value") ? ["logits_move", "logits_value"] : ["logits_move"];
    const outputs = await model.run(feeds, names);
    const logits = outputs.logits_move.data.slice();
    const value = outputs.logits_value ? outputs.logits_value.data.slice() : null;
    for (const name of names) outputs[name].dispose();
    postMessage({ id, logits, value }, value ? [logits.buffer, value.buffer] : [logits.buffer]);
  } catch (error) {
    session = undefined;
    postMessage({ id, error: String(error.message || error) });
  }
};
