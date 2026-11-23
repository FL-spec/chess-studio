import assert from "node:assert/strict";
import { Chess } from "../extension/vendor/chess.mjs";
import { rankHuman } from "../extension/policy.mjs";
import { humanLines } from "../extension/human-lines.mjs";
import weights from "../extension/weights.mjs";
import openings from "../extension/openings.mjs";

const start = new Chess();
for (const rating of [1000, 1450, 1950]) {
  const choices = rankHuman(start, rating, 0, weights, openings);
  assert.equal(choices.length, 20);
  assert.ok(
    Math.abs(choices.reduce((sum, choice) => sum + choice.probability, 0) - 1) <
      1e-10,
  );
  assert.equal(choices[0].move.san, "e4");
  assert.ok(choices[0].probability > 0.25);
}
const distribution = (elo) =>
  rankHuman(start, elo, 0, weights, openings).map((choice) => [
    choice.move.san,
    choice.probability,
  ]);
assert.notDeepEqual(distribution(1000), distribution(1950));
const mate = new Chess();
mate.loadPgn("1. f3 e5 2. g4 Qh4#");
assert.deepEqual(rankHuman(mate, 1450, 4, weights, openings), []);
const kingPawn = new Chess();
kingPawn.move("e4");
const responses = humanLines(kingPawn.fen(), 1450, 5);
assert.deepEqual(responses.slice(0, 3).map(line => line.san), ["e5", "c5", "e6"]);
for (const response of responses) {
  const board = new Chess(kingPawn.fen());
  assert.equal(response.line[0], response.san);
  for (const move of response.line) assert.ok(board.move(move));
}
console.log(
  "Policy tests passed: legal candidates, normalized probabilities, rating conditioning and checkmate.",
);
