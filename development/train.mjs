import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { Chess } from "../extension/vendor/chess.mjs";
import {
  features,
  rankHuman,
  openingKey,
  openingBand,
} from "../extension/policy.mjs";
let seed = 9487;
const random = () =>
  (seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296;
const training = new Chess();
let games = 0,
  positions = 0,
  tests = 0,
  correct = 0,
  loss = 0,
  baselineLoss = 0;
const book = {};
const weights = Array(34).fill(0);
const ratings = {};
for await (const line of createInterface({ input: process.stdin })) {
  for (const color of ["White", "Black"]) {
    const tag = line.match(new RegExp("^\\[" + color + 'Elo "(\\d+)"'));
    if (tag) ratings[color] = Number(tag[1]);
  }
  if (!line.startsWith("1. ") || !ratings.White || !ratings.Black) continue;
  const { White, Black } = ratings;
  delete ratings.White;
  delete ratings.Black;
  try {
    training.loadPgn(line);
  } catch {
    continue;
  }
  const moves = training.history({ verbose: true });
  if (moves.length < 12) continue;
  games++;
  if (games === 6501) {
    for (const key of Object.keys(book)) {
      if (
        Object.values(book[key][3]).reduce((sum, count) => sum + count, 0) < 15
      )
        delete book[key];
    }
  }
  if (games <= 6500) {
    for (const move of moves.slice(0, 12)) {
      const key = openingKey(move.before);
      const band = openingBand(move.color === "w" ? White : Black);
      const entry = (book[key] ??= [{}, {}, {}, {}]);
      for (const index of [band, 3])
        entry[index][move.san] = (entry[index][move.san] || 0) + 1;
    }
  }
  const indices = new Set(
    Array.from({ length: 6 }, () => Math.floor(random() * moves.length)),
  );
  for (const index of indices) {
    const played = moves[index];
    const position = new Chess(played.before);
    const elo = played.color === "w" ? White : Black;
    if (games > 6500) {
      const choices = rankHuman(position, elo, index, weights, book);
      baselineLoss += Math.log(choices.length);
      correct += Number(choices[0]?.move.san === played.san);
      loss -= Math.log(
        choices.find((choice) => choice.move.san === played.san).probability,
      );
      tests++;
      continue;
    }
    const candidates = position.moves({ verbose: true });
    const encoded = candidates.map((move) =>
      features(position, move, elo, index),
    );
    if (encoded[0].length !== weights.length)
      throw Error("Feature dimension " + encoded[0].length);
    const logits = encoded.map((vector) =>
      vector.reduce((sum, value, i) => sum + value * weights[i], 0),
    );
    const peak = Math.max(...logits);
    const mass = logits.map((logit) => Math.exp(logit - peak));
    const total = mass.reduce((sum, value) => sum + value, 0);
    const observed =
      encoded[candidates.findIndex((move) => move.san === played.san)];
    const rate = 0.075 / Math.sqrt(1 + positions / 1200);
    for (let i = 0; i < weights.length; i++) {
      const expected =
        encoded.reduce((sum, vector, j) => sum + vector[i] * mass[j], 0) /
        total;
      weights[i] += rate * (observed[i] - expected - 0.001 * weights[i]);
    }
    positions++;
  }
  if (games === 6800) break;
}
writeFileSync(
  "../extension/weights.mjs",
  "export default " +
    JSON.stringify(weights.map((x) => Number(x.toFixed(7)))) +
    ";\n",
);
for (const key of Object.keys(book)) {
  if (Object.values(book[key][3]).reduce((sum, count) => sum + count, 0) < 15)
    delete book[key];
}
writeFileSync(
  "../extension/openings.mjs",
  "export default " + JSON.stringify(book) + ";\n",
);
console.log(
  JSON.stringify({
    games,
    positions,
    tests,
    correct,
    top1: correct / tests,
    logLoss: loss / tests,
    uniformLogLoss: baselineLoss / tests,
    openingPositions: Object.keys(book).length,
  }),
);
