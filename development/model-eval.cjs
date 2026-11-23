const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");

async function* games(filename) {
  const stream = fs.createReadStream(filename);
  const input = require("node:readline").createInterface({ input: stream, crlfDelay: Infinity });
  let lines = [];
  try {
    for await (const line of input) {
      if (line.startsWith("[Event ") && lines.length) {
        yield lines.join("\n");
        lines = [];
      }
      lines.push(line);
    }
    if (lines.length) yield lines.join("\n");
  } finally {
    input.close();
    stream.destroy();
  }
}
async function main() {
  const { Chess } = await import("../extension/vendor/chess.mjs");
  const positions = [];
  for await (const pgn of games(process.argv[2])) {
    const game = new Chess();
    try { game.loadPgn(pgn.trim()); } catch { continue; }
    const moves = game.history({ verbose: true });
    if (moves.length < 20) continue;
    const index = 4 + ((positions.length * 7919) % (moves.length - 5));
    const move = moves[index];
    const rating = Number(game.getHeaders()[move.color === "w" ? "WhiteElo" : "BlackElo"]);
    if (!Number.isFinite(rating) || rating < 1000 || rating > 2000) continue;
    positions.push({ fen: move.before, san: move.san, rating, ply: index });
    if (positions.length === 240) break;
  }
  assert.equal(positions.length, 240);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "chess-maia-eval-"));
  const ext = path.resolve(__dirname, "../extension");
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHESS_TEST_CHROME,
    headless: true, ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--disable-extensions-except=" + ext, "--load-extension=" + ext],
  });
  try {
    const page = await context.newPage();
    page.on("pageerror", error => console.error(error));
    await page.goto("chrome://extensions");
    const item = page.locator("extensions-item").filter({ hasText: "Chess Studio" });
    const base = "chrome-extension://" + await item.getAttribute("id") + "/";
    await page.goto(base + "index.html?view=settings");
    assert.equal(await page.getByRole("combobox", { name: "Human predictions" }).inputValue(), "true");
    await page.evaluate(async () => (await import("./maia-model.mjs")).installMaia());
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("combobox", { name: "Human predictions" }).waitFor();
    const result = await page.evaluate(async positions => {
      const { Chess } = await import("./vendor/chess.mjs");
      const { maiaRanks, maiaLines } = await import("./maia.mjs");
      const { rankHuman } = await import("./policy.mjs");
      const { default: weights } = await import("./weights.mjs");
      const { default: openings } = await import("./openings.mjs");
      const metrics = () => ({ top1: 0, top3: 0, logLoss: 0 });
      const models = { local: metrics(), maia: metrics() };
      for (let i = 0; i < positions.length; i += 8) {
        const batch = positions.slice(i, i + 8);
        const boards = batch.map(row => new Chess(row.fen));
        const neural = await maiaRanks(boards, batch.map(row => row.rating));
        batch.forEach(({ san, rating, ply }, j) => {
          const local = rankHuman(boards[j], rating, ply, weights, openings);
          for (const [label, choices] of [["local", local], ["maia", neural[j]]]) {
            const hit = choices.findIndex(row => row.move.san === san);
            if (hit < 0) throw Error("Missing legal move " + san);
            const m = models[label];
            m.top1 += Number(hit === 0);
            m.top3 += Number(hit < 3);
            m.logLoss -= Math.log(choices[hit].probability);
          }
        });
      }
      const { analyze } = await import("./engine.mjs");
      const mate = new Chess();
      mate.loadPgn("1. f3 e5 2. g4");
      const [winning] = await analyze(mate, { depth: 12, count: 3 });
      if (winning.type !== "mate" || winning.value !== 1 || mate.move(winning.pv[0]).san !== "Qh4#")
        throw Error("Stockfish missed forced mate in one.");
      const start = new Chess().fen();
      const begin = performance.now();
      const engine = await analyze(new Chess(start), { depth: 16, count: 5 });
      const engineMs = Math.round(performance.now() - begin);
      if (engine.length !== 5 || new Set(engine.map(row => row.depth)).size !== 1 ||
          engine.some(row => row.wdl?.reduce((sum, value) => sum + value, 0) !== 1000))
        throw Error("Incomplete MultiPV or incorrect WDL.");
      for (const row of engine) {
        const game = new Chess(start);
        for (const move of row.pv) game.move(move);
      }
      const t = performance.now();
      const lines = await maiaLines(start, 2000, 5);
      for (const row of lines) {
        const board = new Chess(start);
        for (const san of row.line) board.move(san);
      }
      return { count: positions.length, models, engineMs, engineDepth: engine[0].depth, fiveLineMs: Math.round(performance.now() - t), first: lines[0] };
    }, positions);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
