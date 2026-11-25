// Unit tests for Pro ranking, model ratings and safe premoves (no browser).
import assert from 'node:assert/strict';
import { Chess } from '../extension/vendor/chess.mjs';
import { expectedScore, humanCandidates, rankPro, proMetric } from '../extension/pro-lines.mjs';
import { playerRatings, moverRatings, toModelRating } from '../extension/ratings.mjs';
import { findSafePremove, relevantReplies, uciOf } from '../extension/premove.mjs';

// Expected score follows Lichess's curve, clamped at ±1000 cp; mates are 0 or 1.
assert.equal(expectedScore({ type: 'cp', value: 0 }), 0.5);
assert.ok(Math.abs(expectedScore({ type: 'cp', value: 100 }) - 0.591) < 0.001);
assert.equal(expectedScore({ type: 'cp', value: 5000 }), expectedScore({ type: 'cp', value: 1000 }));
assert.equal(expectedScore({ type: 'mate', value: 3 }), 1);
assert.equal(expectedScore({ type: 'mate', value: -2 }), 0);

// Human candidates stop at 90% of the probability, the floor, or five moves.
const start = new Chess();
const rank = (san, probability) => { const move = start.move(san); start.undo(); return { move, probability }; };
const ranks = [rank('e4', .5), rank('d4', .3), rank('Nf3', .15), rank('c4', .02)];
assert.deepEqual(humanCandidates(ranks).map(row => row.move.san), ['e4', 'd4', 'Nf3']);
assert.deepEqual(humanCandidates(ranks, { mass: .7 }).map(row => row.move.san), ['e4', 'd4']);

// A common human move outside the tolerance is rejected and reported as a trap.
const lines = [
  { type: 'cp', value: 80, pv: ['d2d4'] },
  { type: 'cp', value: 70, pv: ['g1f3'] },
  { type: 'cp', value: -150, pv: ['e2e4'] },
];
const ranked = rankPro(lines, ranks, 'balanced');
assert.deepEqual(ranked.lines.map(line => line.pv[0]), ['d2d4', 'g1f3', 'e2e4']);
assert.equal(ranked.trap.pv[0], 'e2e4');
assert.ok(ranked.lines.slice(0, 2).every(line => line.accepted && line.loss <= .04));
// Precise keeps fewer moves than Natural.
const near = [{ type: 'cp', value: 60, pv: ['e2e4'] }, { type: 'cp', value: 20, pv: ['d2d4'] }];
const dRanks = [rank('d4', .8), rank('e4', .1)];
assert.equal(rankPro(near, dRanks, 'precise').lines[0].pv[0], 'e2e4');
assert.equal(rankPro(near, dRanks, 'natural').lines[0].pv[0], 'd2d4');
assert.equal(proMetric({ type: 'cp', value: 42, probability: .38 }), '+0.42 · 38%');
assert.equal(rankPro([], ranks).lines.length, 0);

// Ratings: Chess.com ratings map to the model's Lichess scale; levels clamp.
assert.equal(toModelRating(1000, 'CHESS.COM'), 1395);
assert.equal(toModelRating(1700, 'LICHESS'), 1700);
assert.equal(toModelRating(0, 'LICHESS'), null);
assert.equal(toModelRating(100, 'LICHESS'), 600);
const fixed = playerRatings({ elo: 1500, opponentElo: 1900, ratingSource: 'fixed' }, { playerColor: 'b' });
assert.deepEqual([fixed.w, fixed.b, fixed.source], [1900, 1500, 'settings']);
const page = playerRatings({ elo: 1500, ratingSource: 'page' }, { playerColor: 'w', site: 'CHESS.COM', ratings: { w: 1200, b: null } });
assert.deepEqual([page.w, page.b, page.source], [1547, 1500, 'page']);
const unknown = playerRatings({ elo: 1800, opponentElo: 0 }, {});
assert.deepEqual([unknown.w, unknown.b], [1800, 1800]);
assert.deepEqual(moverRatings({ w: 1400, b: 2000 }, '8/8/8/8/8/8/8/K6k b - - 0 1'), [2000, 1400]);

// Safe premoves with a scripted engine. Black (to move) will most likely trade
// queens; White's premove is the recapture Kxd1.
const board = new Chess('3qk3/8/8/8/8/8/8/3QK3 b - - 0 1');
const weights = new Map(board.moves({ verbose: true }).map(move => [uciOf(move), uciOf(move) === 'd8d1' ? .9 : .1 / 15]));
function engine({ onlyScore = 0 } = {}) {
  const calls = [];
  const analyze = async (position, { count, only }) => {
    calls.push({ fen: position.fen(), count, only });
    const moves = position.moves({ verbose: true });
    if (position.turn() === 'w')
      return only.split(' ').map(id => ({ type: 'cp', value: onlyScore, pv: [id] }));
    return moves.filter(reply => !only || only.split(' ').includes(uciOf(reply))).map(reply => {
      const after = new Chess(position.fen());
      after.move(reply);
      const answers = after.moves({ verbose: true });
      const answer = answers.find(move => uciOf(move) === 'e1d1') || answers[0];
      return { type: 'cp', value: 0, pv: [uciOf(reply), answer && uciOf(answer)].filter(Boolean) };
    }).slice(0, only ? undefined : count);
  };
  return { analyze, calls };
}
const scripted = engine();
const found = await findSafePremove(board, { analyze: scripted.analyze, weights });
assert.equal(found.move, 'e1d1');
assert.equal(found.san, 'Kxd1');
assert.ok(found.coverage > .85, String(found.coverage));
// Only the likely replies and every forcing one are searched: Qxd1+ plus the
// quiet replies until 95% of the probability, in one restricted search.
const restricted = scripted.calls.find(call => call.only && call.position?.turn?.() !== 'w') || scripted.calls.find(call => call.only);
assert.ok(restricted.count < board.moves().length, String(restricted.count));
assert.ok(restricted.only.split(' ').includes('d8d1'));
// The engine's best replies are always searched first, however unlikely.
assert.equal(scripted.calls[0].only, undefined);
const engineKept = relevantReplies(board.moves({ verbose: true }), new Map([['d8d1', .99]]), new Set(['e8f7'])).map(uciOf);
assert.ok(engineKept.includes('e8f7'), engineKept.join());
assert.equal(found.fen, board.fen());
// Without weights every reply is checked; with them, captures and checks always are.
assert.equal(relevantReplies(board.moves({ verbose: true })).length, board.moves().length);
const rare = new Map([['d8d1', .99]]);
const kept = relevantReplies(board.moves({ verbose: true }), rare).map(uciOf);
assert.ok(kept.includes('d8d1') && kept.length < board.moves().length && kept.every(id => board.moves({ verbose: true }).find(m => uciOf(m) === id).san.match(/[x+#]/)), kept.join());
// Off mode and finished games never search.
assert.equal(await findSafePremove(board, { analyze: scripted.analyze, mode: 'off' }), null);
assert.equal(await findSafePremove(new Chess('7k/5QQ1/8/8/8/8/8/K7 b - - 0 1'), { analyze: scripted.analyze }), null);
// A quiet move that is best against every reply at no cost is the move you
// would play anyway, so "obvious" mode accepts it too.
const quiet = new Chess('4k3/8/8/8/8/8/8/R3K3 b - - 0 1');
const quietEngine = async (position, { only }) => position.turn() === 'w' && only ? only.split(' ').map(id => ({ type: 'cp', value: 900, pv: [id] }))
  : position.moves({ verbose: true }).filter(reply => !only || only.split(' ').includes(uciOf(reply))).map(reply => ({ type: 'cp', value: -900, pv: [uciOf(reply), 'a1a7'] }));
assert.equal((await findSafePremove(quiet, { analyze: quietEngine }))?.move, 'a1a7');
assert.equal((await findSafePremove(quiet, { analyze: quietEngine, mode: 'safe' }))?.move, 'a1a7');
// If the premove would be a blunder after some reply, nothing is shown.
const risky = new Chess('3qk3/8/8/8/8/8/8/3QK3 b - - 0 1');
const riskyEngine = async (position, { only }) => position.turn() === 'w' && only ? only.split(' ').map(id => ({ type: 'cp', value: -600, pv: [id] }))
  : position.moves({ verbose: true }).filter(reply => !only || only.split(' ').includes(uciOf(reply))).map(reply => ({ type: 'cp', value: 0, pv: [uciOf(reply), 'd1d7'] }));
assert.equal(await findSafePremove(risky, { analyze: riskyEngine, mode: 'safe' }), null);
// Aborting stops the search.
const controller = new AbortController();
controller.abort();
await assert.rejects(findSafePremove(board, { analyze: scripted.analyze, weights, signal: controller.signal }), { name: 'AbortError' });
// Premoves: only on the opponent's turn, only in games against a computer,
// and only when your side is certain.
{
  const { premoveAllowed } = await import("../extension/premove.mjs");
  const { Chess } = await import("../extension/vendor/chess.mjs");
  const blackToMove = new Chess("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
  const whiteToMove = new Chess();
  const base = { opponentBot: true, playerColor: "w", playerSource: "account", flipped: false };
  assert.equal(premoveAllowed(base, blackToMove), true);
  assert.equal(premoveAllowed(base, whiteToMove), false, "your turn: no premove");
  assert.equal(premoveAllowed({ ...base, opponentBot: false }, blackToMove), false, "human opponent: no premove");
  assert.equal(premoveAllowed({ ...base, playerColor: undefined }, blackToMove), false, "unknown side");
  assert.equal(premoveAllowed({ ...base, analysis: true }, blackToMove), false, "analysis board");
  // Side from orientation: allowed only while the board still shows your side at the bottom.
  assert.equal(premoveAllowed({ ...base, playerSource: "orientation" }, blackToMove), true);
  assert.equal(premoveAllowed({ ...base, playerSource: "orientation", flipped: true }, blackToMove), false, "flipped board");
  assert.equal(premoveAllowed({ ...base, playerColor: "b", playerSource: "orientation", flipped: true }, whiteToMove), true);
  // Account match wins over a flipped board.
  assert.equal(premoveAllowed({ ...base, flipped: true }, blackToMove), true);
}
console.log('Pro ranking, model ratings and safe premoves passed.');
