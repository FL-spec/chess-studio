// Model benchmark: human-move prediction, Pro trade-offs, value calibration and
// safe premoves on real rated games.
//
//   CHESS_TEST_CHROME=<chrome> MAIA_ONNX=<maia3_simplified.onnx> \
//     node model-bench.cjs games.pgn [positions=1200] [premovePositions=400]
//
// Games come from any PGN with WhiteElo/BlackElo/Result tags (for example the
// Lichess API: /api/tournament/<id>/games). Positions are sampled
// deterministically: up to 3 per game, from ply 8 on.
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function* games(text) {
  for (const chunk of text.split(/\n(?=\[Event )/)) if (chunk.trim()) yield chunk.trim();
}

async function main() {
  const [file, limitArg, premoveArg] = process.argv.slice(2);
  const limit = Number(limitArg) || 1200;
  const premoveLimit = Number(premoveArg ?? 400);
  const { Chess } = await import("../extension/vendor/chess.mjs");
  const positions = [];
  let gameIndex = 0;
  for (const pgn of games(fs.readFileSync(file, "utf8"))) {
    const game = new Chess();
    try { game.loadPgn(pgn); } catch { continue; }
    const headers = game.getHeaders();
    if (headers.Variant && headers.Variant !== "Standard") continue;
    const moves = game.history({ verbose: true });
    if (moves.length < 16) continue;
    const ratings = { w: Number(headers.WhiteElo), b: Number(headers.BlackElo) };
    if (!ratings.w || !ratings.b) continue;
    const result = { "1-0": 1, "0-1": 0, "1/2-1/2": 0.5 }[headers.Result];
    if (result === undefined) continue;
    gameIndex++;
    for (let k = 0; k < 3; k++) {
      const index = 8 + ((gameIndex * 7919 + k * 104729) % (moves.length - 9));
      const move = moves[index];
      const reply = moves[index + 1];
      const other = move.color === "w" ? "b" : "w";
      positions.push({
        fen: move.before, uci: move.from + move.to + (move.promotion || ""),
        self: ratings[move.color], opponent: ratings[other], ply: index,
        // Game result for the player to move.
        result: move.color === "w" ? result : 1 - result,
        reply: reply ? reply.from + reply.to + (reply.promotion || "") : null,
      });
    }
  }
  positions.sort((a, b) => ((a.self * 31 + a.ply * 17) % 997) - ((b.self * 31 + b.ply * 17) % 997));
  const sample = positions.slice(0, limit);
  console.error("Positions:", sample.length, "from", gameIndex, "games");

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "chess-bench-"));
  const ext = path.resolve(__dirname, "../extension");
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHESS_TEST_CHROME, headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--no-sandbox", "--disable-extensions-except=" + ext, "--load-extension=" + ext],
  });
  try {
    if (process.env.MAIA_ONNX)
      await context.route("https://raw.githubusercontent.com/**", route => route.fulfill({
        status: 200, body: fs.readFileSync(process.env.MAIA_ONNX), contentType: "application/octet-stream" }));
    const page = await context.newPage();
    page.on("pageerror", error => console.error(error));
    page.on("console", message => { if (message.text().startsWith("[bench]")) console.error(message.text()); });
    await page.goto("chrome://extensions");
    const item = page.locator("extensions-item").filter({ hasText: "Chess Studio" });
    await item.waitFor();
    const base = "chrome-extension://" + await item.getAttribute("id") + "/";
    await page.goto(base + "index.html");
    page.setDefaultTimeout(0);
    const result = await page.evaluate(async ({ positions, premoveLimit }) => {
      const { Chess } = await import("./vendor/chess.mjs");
      const { maiaPredict } = await import("./maia.mjs");
      const { analyzeCommand } = await import("./engine-core.mjs");
      const { rankPro, humanCandidates, expectedScore, PRO_STYLES } = await import("./pro-lines.mjs");
      const { findSafePremove, uciOf } = await import("./premove.mjs");
      const { rankHuman } = await import("./policy.mjs");
      const { default: weights } = await import("./weights.mjs");
      const { default: openings } = await import("./openings.mjs");
      const DEPTH = 12;
      const analyze = (board, { depth = DEPTH, count = 1, only, signal } = {}) =>
        analyzeCommand("position fen " + board.fen(), only ? 1 : Math.min(count, board.moves().length), { depth, count, only, signal });
      const band = rating => rating < 1200 ? "<1200" : rating < 1500 ? "1200-1499" : rating < 1800 ? "1500-1799" : rating < 2100 ? "1800-2099" : "2100+";
      const bands = {};
      const slot = name => (bands[name] ??= { n: 0 });
      const add = (row, key, value) => { row[key] = (row[key] || 0) + value; };
      const brier = { maia: 0, stockfish: 0, n: 0 };

      for (let i = 0; i < positions.length; i += 16) {
        const batch = positions.slice(i, i + 16);
        const boards = batch.map(row => new Chess(row.fen));
        const [matched, same, fixed] = await Promise.all([
          maiaPredict(boards, batch.map(row => row.self), batch.map(row => row.opponent)),
          maiaPredict(boards, batch.map(row => row.self), batch.map(row => row.self)),
          maiaPredict(boards, batch.map(() => 2000), batch.map(() => 2000)),
        ]);
        for (const [j, row] of batch.entries()) {
          const board = boards[j];
          const stats = slot(band(row.self));
          const all = slot("all");
          for (const target of [stats, all]) target.n++;
          const score = (name, ranks) => {
            const hit = ranks.findIndex(item => uciOf(item.move) === row.uci);
            for (const target of [stats, all]) {
              add(target, name + "Top1", Number(hit === 0));
              add(target, name + "Top3", Number(hit >= 0 && hit < 3));
              add(target, name + "Nll", -Math.log(Math.max(ranks[hit]?.probability ?? 1e-6, 1e-6)));
            }
          };
          score("maia", matched[j].ranks);
          score("maiaSameElo", same[j].ranks);
          score("maia2000", fixed[j].ranks);
          score("lightweight", rankHuman(board, row.self, row.ply, weights, openings));

          // Engine, Pro and the human move, all scored by the same search.
          const engine = await analyze(board, { count: 3 });
          const known = new Set(engine.map(line => line.pv[0]));
          const extra = [];
          for (const { move } of humanCandidates(matched[j].ranks)) {
            const id = uciOf(move);
            if (known.has(id)) continue;
            const [line] = await analyze(board, { only: id });
            if (line?.pv[0] === id) { extra.push(line); known.add(id); }
          }
          if (!known.has(row.uci)) {
            const [line] = await analyze(board, { only: row.uci });
            if (line) extra.push(line);
          }
          const lines = [...engine, ...extra];
          const best = Math.max(...lines.map(expectedScore));
          const lossOf = id => {
            const line = lines.find(item => item.pv[0] === id);
            return line ? Math.max(0, best - expectedScore(line)) : null;
          };
          const humanLoss = lossOf(row.uci);
          for (const target of [stats, all]) {
            add(target, "engineTop1", Number(engine[0].pv[0] === row.uci));
            add(target, "humanLoss", humanLoss ?? 0);
            add(target, "maiaPickLoss", lossOf(uciOf(matched[j].ranks[0].move)) ?? 0);
          }
          for (const style of Object.keys(PRO_STYLES)) {
            const pick = rankPro(lines, matched[j].ranks, style).lines[0];
            for (const target of [stats, all]) {
              add(target, "pro_" + style + "Top1", Number(pick.pv[0] === row.uci));
              add(target, "pro_" + style + "Loss", Math.max(0, best - expectedScore(pick)));
            }
          }
          // Outcome calibration for the player to move.
          if (matched[j].outcome) {
            brier.maia += (matched[j].outcome.score - row.result) ** 2;
            brier.stockfish += (expectedScore(engine[0]) - row.result) ** 2;
            brier.n++;
          }
        }
        console.log("[bench] moves", Math.min(i + 16, positions.length), "/", positions.length);
      }

      // Premoves: the side not to move premoves; the opponent's real move decides.
      const premove = { positions: 0, found: 0, executed: 0, cancelled: 0, bestAfterReal: 0, lossSum: 0, worst: 0, bad: 0, ms: 0, foundSafe: 0 };
      for (const row of positions.slice(0, premoveLimit)) {
        if (!row.reply) continue;
        const board = new Chess(row.fen);
        const [prediction] = await maiaPredict([board], [row.self], [row.opponent]);
        const weightsMap = new Map(prediction.ranks.map(item => [uciOf(item.move), item.probability]));
        premove.positions++;
        for (const mode of ["obvious", "safe"]) {
          const start = performance.now();
          const found = await findSafePremove(board, { analyze, depth: 10, weights: weightsMap, mode });
          if (mode === "obvious") premove.ms += performance.now() - start;
          if (!found) continue;
          if (mode === "safe") { premove.foundSafe++; continue; }
          premove.found++;
          const after = new Chess(row.fen);
          after.move(row.uci);
          if (after.isGameOver()) continue;
          const legal = after.moves({ verbose: true }).find(move => move.from + move.to === found.move.slice(0, 4));
          if (!legal) { premove.cancelled++; continue; }
          premove.executed++;
          // Judge with a deeper search than the premove check used.
          const [best] = await analyze(after, { depth: 16 });
          const [played] = await analyze(after, { depth: 16, only: uciOf(legal) });
          const loss = Math.max(0, expectedScore(best) - expectedScore(played));
          premove.lossSum += loss;
          premove.worst = Math.max(premove.worst, loss);
          premove.bestAfterReal += Number(best.pv[0] === uciOf(legal));
          premove.bad += Number(loss > 0.05);
        }
      }
      return { bands, brier, premove };
    }, { positions: sample, premoveLimit });

    const table = {};
    for (const [name, row] of Object.entries(result.bands)) {
      const n = row.n;
      const out = { n };
      for (const [key, value] of Object.entries(row)) if (key !== "n") out[key] = Math.round((value / n) * 1000) / 1000;
      table[name] = out;
    }
    const p = result.premove;
    const summary = {
      generated: new Date().toISOString(),
      positions: sample.length,
      depth: 12,
      bands: table,
      outcomeBrier: {
        n: result.brier.n,
        maiaValue: Math.round((result.brier.maia / result.brier.n) * 10000) / 10000,
        stockfishLichessCurve: Math.round((result.brier.stockfish / result.brier.n) * 10000) / 10000,
      },
      premove: {
        positions: p.positions,
        foundObvious: p.found, foundAllSafe: p.foundSafe,
        executedAfterRealReply: p.executed, cancelledByRealReply: p.cancelled,
        bestMoveAfterRealReply: p.bestAfterReal,
        meanLossWhenExecuted: p.executed ? Math.round((p.lossSum / p.executed) * 10000) / 10000 : null,
        worstLoss: Math.round(p.worst * 10000) / 10000,
        executedWorseThanInaccuracy: p.bad,
        meanSearchMs: Math.round(p.ms / Math.max(1, p.positions)),
      },
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
