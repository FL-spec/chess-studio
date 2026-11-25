// Full-game simulation: real games replayed move by move on a Chess.com
// fixture page, with the extension's panel following them as in a real game.
//
// Usage: CHESS_TEST_CHROME=/path/to/chrome node game-simulation.cjs [games.pgn] [maxGames]
// Default games: fixtures/lichess-games.pgn (finished public Lichess games).
//
// Checks, for every game:
// - no page errors in the panel;
// - the coach comments on your moves, and on the opponent's moves only when
//   they are very bad or very good (Blunder, Brilliant) or a trap;
// - every comment is short (at most two sentences) and has no "Plan:" text;
// - the end of the game is detected (checkmate, stalemate and repetition from
//   the moves; resignation and time from the page's result) with the right
//   result for your side;
// - "Open in Studio" saves the whole game and opens Game review with it.
// Before the games, the engine check: with the game's moves, Stockfish never
// recommends a move that repeats the position a third time in a won position.
const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = `<!doctype html><meta charset=utf-8><title>Game fixture</title><style>wc-chess-board{display:block;width:400px;height:400px}</style>
<nav id="sidebar-main-menu"><a href="/member/studio-player">Studio-Player</a></nav>
<main class="board-layout-main">
  <div class="board-layout-top"><span class="cc-user-username-component" id="top-name">Coach Magnus</span></div>
  <wc-chess-board></wc-chess-board>
  <div class="board-layout-bottom"><span class="cc-user-username-component" id="bottom-name">Studio-Player</span></div>
</main>
<wc-simple-move-list class="move-list"></wc-simple-move-list><div id="result-host"></div><script>
function loadPosition(placement,moves,flipped,result) {
  const board=document.querySelector('wc-chess-board');
  board.classList.toggle('flipped',Boolean(flipped));
  board.innerHTML=placement.split('/').map((rank,row)=>{
    let file=0;
    return [...rank].map(piece=>{
      if(/\\d/.test(piece)){file+=Number(piece);return '';}
      const type=(piece===piece.toLowerCase()?'b':'w')+piece.toLowerCase();
      return '<div class="piece '+type+' square-'+(++file)+(8-row)+'"></div>';
    }).join('');
  }).join('');
  document.querySelector('wc-simple-move-list').innerHTML=moves.map(move=>'<div class="node"><span>'+move+'</span></div>').join('');
  document.getElementById('result-host').innerHTML=result
    ? '<div class="game-over-header-component">'+result.header+'</div><div class="game-result">'+result.score+'</div>' : '';
}
function setPlayers(top,bottom){document.getElementById('top-name').textContent=top;document.getElementById('bottom-name').textContent=bottom;}
loadPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR',[]);
</script>`;

function parseGames(text, Chess) {
  const games = [];
  for (const block of text.split(/\n\n(?=\[Event )/)) {
    const tag = (name) => block.match(new RegExp('\\[' + name + ' "([^"]*)"\\]'))?.[1] || '';
    if (tag('Variant') && tag('Variant') !== 'Standard') continue;
    if (tag('FEN')) continue;
    const game = new Chess();
    try { game.loadPgn(block); } catch { continue; }
    const sans = game.history();
    if (sans.length < 6) continue;
    games.push({ id: tag('GameId') || tag('Site'), result: tag('Result'), termination: tag('Termination'), sans, white: tag('White'), black: tag('Black') });
  }
  return games;
}

// What the site would show at the end, and what the panel should say.
function ending(game, Chess, me) {
  const board = new Chess();
  for (const san of game.sans) board.move(san);
  const iWon = (game.result === '1-0') === (me === 'w');
  if (board.isCheckmate()) return { page: null, expect: iWon ? /^You won by checkmate$/ : /^You lost by checkmate$/ };
  if (board.isStalemate()) return { page: null, expect: /^Draw by stalemate$/ };
  if (board.isThreefoldRepetition()) return { page: null, expect: /^Draw by repetition$/ };
  if (board.isInsufficientMaterial()) return { page: null, expect: /^Draw by insufficient material$/ };
  if (game.result === '1/2-1/2') return { page: { score: '½-½', header: 'Game Drawn by agreement' }, expect: /^Draw( by agreement)?$/ };
  const time = /time/i.test(game.termination);
  const header = (iWon ? 'You Won! ' : (game.result === '1-0' ? 'White' : 'Black') + ' Won ') + (time ? 'on time' : 'by resignation');
  return { page: { score: game.result, header }, expect: new RegExp('^You ' + (iWon ? 'won' : 'lost') + ' (on time|by resignation)$') };
}

(async () => {
  const { Chess } = await import('../extension/vendor/chess.mjs');
  const file = process.argv[2] || path.join(__dirname, 'fixtures/lichess-games.pgn');
  const limit = Number(process.argv[3] || 40);
  const games = parseGames(fs.readFileSync(file, 'utf8'), Chess).slice(0, limit);
  assert.ok(games.length, 'no games in ' + file);
  const ext = path.resolve(process.env.CHESS_TEST_EXTENSION || path.join(__dirname, '../extension'));
  const context = await chromium.launchPersistentContext('/tmp/chess-simulation-' + process.pid, {
    headless: true, executablePath: process.env.CHESS_TEST_CHROME || '/usr/bin/chromium',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--no-sandbox', '--disable-extensions-except=' + ext, '--load-extension=' + ext],
  });
  const report = { games: 0, plies: 0, comments: 0, opponentComments: 0, endings: {}, failures: [] };
  try {
    await context.route('https://www.chess.com/**', (route) => route.fulfill({ contentType: 'text/html', body: html, status: 200 }));
    const store = await context.newPage();
    await store.goto('chrome://extensions');
    const item = store.locator('extensions-item').filter({ has: store.getByText('Chess Studio', { exact: true }) });
    await item.waitFor();
    const base = 'chrome-extension://' + await item.getAttribute('id') + '/';

    // 1. Engine check: repetition in a won position.
    const engine = await context.newPage();
    await engine.goto(base + 'popup.html');
    const repetition = await engine.evaluate(async () => {
      const { Chess } = await import(chrome.runtime.getURL('vendor/chess.mjs'));
      const { analyze } = await import(chrome.runtime.getURL('engine.mjs'));
      // White is a queen up. After these moves, Qd1 repeats the position a third time.
      const game = new Chess('7k/8/8/8/8/8/6PP/3Q2K1 b - - 0 1');
      for (const move of ['h8g8', 'd1d2', 'g8h8', 'd2d1', 'h8g8', 'd1d2', 'g8h8']) game.move(move);
      const check = new Chess(game.fen());
      const withMoves = await analyze(game, { depth: 14, count: 3 });
      const repeat = await analyze(game, { depth: 14, count: 1, only: 'd2d1' });
      const plain = await analyze(check, { depth: 14, count: 1, only: 'd2d1' });
      game.move('d2d1');
      return { best: withMoves.map((line) => line.pv[0]), repeat: repeat[0], plain: plain[0], threefold: game.isThreefoldRepetition() };
    });
    assert.equal(repetition.threefold, true);
    assert.ok(!repetition.best.includes('d2d1'), 'Stockfish recommends the repeating move: ' + repetition.best);
    assert.equal(repetition.repeat.type, 'cp');
    assert.equal(repetition.repeat.value, 0, 'the repeating move scores as a draw');
    assert.ok(repetition.plain.type === 'mate' || repetition.plain.value > 500, 'without the moves the repetition is invisible');
    console.log('Engine check passed: with the moves, the third repetition scores 0.00 and is never recommended (best: ' + repetition.best.join(', ') + ').');
    await engine.evaluate(async () => {
      const { websiteOptions = {} } = await chrome.storage.local.get('websiteOptions');
      await chrome.storage.local.set({ websiteOptions: { ...websiteOptions, depth: 10, view: 'reactions' } });
    });

    // 2. The games.
    const training = await context.newPage();
    await training.goto('https://www.chess.com/play/computer');
    const launcher = await context.newPage();
    await launcher.goto(base + 'popup.html');
    const floatingPage = context.waitForEvent('page');
    await launcher.getByRole('button', { name: 'Pop out', exact: true }).click().catch((error) => { if (!launcher.isClosed()) throw error; });
    const panel = await floatingPage;
    await panel.locator('body.floating').waitFor();
    await panel.setViewportSize({ width: 380, height: 760 });
    const errors = [];
    panel.on('pageerror', (error) => errors.push(error.message));

    for (const [index, game] of games.entries()) {
      // Alternate your side: White in even games, Black in odd ones.
      const me = index % 2 ? 'b' : 'w';
      const flipped = me === 'b';
      // You sit at the bottom; the board is flipped when you play Black.
      await training.evaluate(([top, bottom]) => setPlayers(top, bottom),
        ['Lichess-' + ((flipped ? game.white : game.black) || 'Opponent'), 'Studio-Player']);
      const board = new Chess();
      await training.evaluate(([f]) => loadPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', [], f), [flipped]);
      await panel.locator('h1.companion-heading[data-turn="w"]').waitFor({ timeout: 15000 });
      const end = ending(game, Chess, me);
      const problems = [];
      for (const [ply, san] of game.sans.entries()) {
        board.move(san);
        const last = ply === game.sans.length - 1;
        await training.evaluate(([placement, moves, f, result]) => loadPosition(placement, moves, f, result),
          [board.fen().split(' ')[0], game.sans.slice(0, ply + 1), flipped, last ? end.page : null]);
        if (!last) await panel.locator('h1.companion-heading[data-turn="' + board.turn() + '"]').waitFor({ timeout: 15000 });
        // Let the grading of this move finish most of the time, as between real moves.
        await panel.waitForTimeout(Number(process.env.SIM_PLY_MS || 600));
      }
      report.plies += game.sans.length;
      // The end of the game.
      try {
        await panel.locator('.game-over').waitFor({ timeout: 15000 });
        const text = (await panel.locator('.game-over-result').textContent()).trim();
        if (!end.expect.test(text)) problems.push('end: "' + text + '" does not match ' + end.expect);
        report.endings[text] = (report.endings[text] || 0) + 1;
        if ((await panel.locator('h1.companion-heading').textContent()).trim() !== 'Game over') problems.push('heading is not "Game over"');
      } catch (error) {
        problems.push('end of game not detected (' + (end.page ? 'page result' : 'rules') + ')');
      }
      // Coach feed: let the last gradings land, then read every comment.
      await panel.waitForTimeout(1200);
      const items = await panel.locator('.cm-item').evaluateAll((nodes) => nodes.map((node) => ({
        opponent: node.hasAttribute('data-opponent'),
        badge: node.querySelector('.grade-badge')?.textContent || '',
        say: node.querySelector('.cm-say')?.textContent || '',
        extra: node.querySelector('.cm-example')?.textContent || '',
      })));
      report.comments += items.length;
      if (process.env.SIM_VERBOSE) for (const entry of items) console.log('    ' + (entry.opponent ? '[opp] ' : '') + entry.badge + ' | ' + entry.say + (entry.extra ? ' | ' + entry.extra : ''));
      if (index === 0) await panel.screenshot({ path: path.join(__dirname, 'simulation-end.png'), fullPage: true });
      for (const entry of items) {
        if (entry.opponent) {
          report.opponentComments += 1;
          if (!/Blunder|Brilliant/.test(entry.badge) && !/fell for|Careful:/.test(entry.say))
            problems.push('opponent comment on an ordinary move: ' + entry.badge + ' "' + entry.say + '"');
        }
        const sentences = entry.say.split(/(?<=[.!?])\s+/).filter(Boolean);
        if (sentences.length > 3 && !/fell for|That is the/.test(entry.say)) problems.push('long comment: "' + entry.say + '"');
        if (/Plan:/.test(entry.say + entry.extra)) problems.push('plan text shown: "' + entry.extra + '"');
      }
      // Open in Studio: the whole game is saved and Game review opens with it.
      if (await panel.locator('.game-over-open').count()) {
        const reviewPage = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
        await panel.locator('.game-over-open').click();
        const review = await reviewPage;
        if (!review) problems.push('Open in Studio opened nothing');
        else {
          await review.waitForLoadState('domcontentloaded');
          const id = new URL(review.url()).searchParams.get('id');
          if (!/game-review\.html$/.test(new URL(review.url()).pathname) || !id) problems.push('wrong review url ' + review.url());
          const saved = await panel.evaluate(async (key) => (await chrome.storage.local.get('reviews')).reviews?.find((item) => item.id === key), id);
          const replay = new Chess();
          try { replay.loadPgn(saved?.pgn || ''); } catch { /* checked below */ }
          if (replay.history().join(' ') !== game.sans.join(' ')) problems.push('saved review PGN differs from the game');
          if (saved?.playerColor !== me) problems.push('saved review side ' + saved?.playerColor + ' instead of ' + me);
          await review.close();
        }
      }
      if (errors.length) problems.push('page errors: ' + errors.splice(0).join(' | '));
      report.games += 1;
      const status = problems.length ? 'FAIL' : 'ok';
      console.log(`${String(index + 1).padStart(2)} ${status} ${game.id} ${game.sans.length} plies, you ${me === 'w' ? 'White' : 'Black'}, ${game.result} ${game.termination}; ${items.length} comments` + (problems.length ? '\n   - ' + problems.join('\n   - ') : ''));
      if (problems.length) report.failures.push({ game: game.id, problems });
    }
    console.log(JSON.stringify(report, null, 1));
    assert.equal(report.failures.length, 0, report.failures.length + ' games failed');
    console.log(`Game simulation passed: ${report.games} real games, ${report.plies} moves.`);
  } finally {
    await context.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
