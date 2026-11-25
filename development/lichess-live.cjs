// Live Lichess check: loads the extension in Chromium, opens real Lichess
// pages and asks the content script for the position, as the panel does.
// Needs the network. Usage: CHESS_TEST_CHROME=/path/to/chrome node lichess-live.cjs
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const extension = path.resolve(process.env.CHESS_TEST_EXTENSION || path.join(__dirname, '../extension'));
  const context = await chromium.launchPersistentContext('/tmp/chess-studio-lichess-' + process.pid, {
    executablePath: process.env.CHESS_TEST_CHROME || '/usr/bin/chromium', headless: process.env.CHESS_TEST_HEADED ? false : true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--no-sandbox', '--disable-extensions-except=' + extension, '--load-extension=' + extension],
  });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => null);
    const store = await context.newPage();
    await store.goto('chrome://extensions');
    const item = store.locator('extensions-item').filter({ has: store.getByText('Chess Studio', { exact: true }) });
    await item.waitFor();
    const id = await item.getAttribute('id');
    const panel = await context.newPage();
    await panel.goto('chrome-extension://' + id + '/popup.html');

    async function observe(url) {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('cg-board piece', { timeout: 20000 }).catch(async (e) => { console.log('title:', await page.title(), (await page.content()).slice(0, 300)); throw e; });
      await page.waitForTimeout(1500);
      const tabUrl = page.url();
      const result = await panel.evaluate(async (target) => {
        const [tab] = await chrome.tabs.query({ url: target });
        for (let i = 0; i < 20; i++) {
          try {
            const answer = await chrome.tabs.sendMessage(tab.id, 'chess-studio-position');
            if (answer?.status === 'ready' || i === 19) return answer;
          } catch (error) { if (i === 19) return { error: String(error) }; }
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }, tabUrl.split('#')[0]);
      await page.close();
      return { url: tabUrl, ...result };
    }

    // 1. Analysis from a PGN URL (was stuck: "pgn/…" read as a start FEN).
    const pgn = await observe('https://lichess.org/analysis/pgn/e4_e5_Nf3_Nc6_Bb5');
    console.log('analysis/pgn', pgn.status, pgn.fen, pgn.history?.length);
    assert.equal(pgn.status, 'ready');
    assert.equal(pgn.fen, 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3');
    assert.equal(pgn.history.length, 5);
    assert.equal(pgn.analysis, true);

    // 2. Analysis from a FEN URL.
    const fenUrl = await observe('https://lichess.org/analysis/standard/8/8/8/4k3/8/8/4P3/4K3_w_-_-_0_1');
    console.log('analysis/fen', fenUrl.status, fenUrl.fen);
    assert.equal(fenUrl.status, 'ready');
    assert.equal(fenUrl.fen.split(' ')[0], '8/8/8/4k3/8/8/4P3/4K3');

    // 3. A game page (the current top TV game, watched): moves, players, ratings.
    const channels = await (await fetch('https://lichess.org/api/tv/channels')).json();
    const gameId = (channels.best || channels.blitz || Object.values(channels)[0]).gameId;
    const game = await observe('https://lichess.org/' + gameId);
    console.log('game', game.url, game.status, game.fen, 'moves', game.history?.length, game.names, game.ratings, game.result);
    assert.equal(game.status, 'ready');
    assert.ok(game.history.length > 0, 'the move list is read');
    assert.ok(game.names?.w && game.names?.b, 'player names are read');
    assert.equal(game.automaticArrows, true);
    console.log('Lichess live check passed.');
  } finally {
    await context.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
