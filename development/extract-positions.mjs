// Test positions from a Lichess database PGN (https://database.lichess.org).
// Usage: node extract-positions.mjs <games.pgn> <out.json> [random] [attacked]
// Picks positions from real games (seeded, repeatable): `random` at random
// plies, and `attacked` where the side to move can win one of the other side's
// pieces. In every position the side to move is "the opponent" for premoves.
import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "../extension/vendor/chess.mjs";
import { see } from "../extension/tactics.mjs";

const [file, out, randomCount = "500", attackedCount = "250"] = process.argv.slice(2);
if (!file || !out) throw Error("usage: node extract-positions.mjs <games.pgn> <out.json> [random] [attacked]");
const wantRandom = Number(randomCount), wantAttacked = Number(attackedCount);
let seed = 7;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const winsPiece = (board) => board.moves({ verbose: true })
  .some((move) => move.captured && move.captured !== "p" && see(board, move.to, board.turn()) >= 2);

const randomSet = [], attackedSet = [];
const games = readFileSync(file, "utf8").split(/\n\n(?=\[Event )/);
for (const text of games) {
  if (randomSet.length >= wantRandom && attackedSet.length >= wantAttacked) break;
  const elo = (tag) => Number(text.match(new RegExp('\\[' + tag + ' "(\\d+)"\\]'))?.[1] || 0);
  const white = elo("WhiteElo"), black = elo("BlackElo");
  if (!white || !black) continue;
  const movetext = text.split(/\n\n/).at(-1)
    .replace(/\{[^}]*\}/g, " ").replace(/\d+\.(\.\.)?/g, " ").replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, " ");
  const sans = movetext.split(/\s+/).filter(Boolean);
  if (sans.length < 16) continue;
  const board = new Chess();
  const pick = 6 + Math.floor(random() * Math.max(1, sans.length - 8));
  let takenAttacked = false;
  for (let ply = 0; ply < sans.length; ply++) {
    try { board.move(sans[ply]); } catch { break; }
    if (board.isGameOver()) break;
    const rating = board.turn() === "w" ? white : black;
    if (ply + 1 === pick && randomSet.length < wantRandom) randomSet.push({ fen: board.fen(), elo: rating });
    if (!takenAttacked && ply >= 6 && attackedSet.length < wantAttacked && winsPiece(board) && random() < 0.35) {
      attackedSet.push({ fen: board.fen(), elo: rating });
      takenAttacked = true;
    }
  }
}
writeFileSync(out, JSON.stringify({ random: randomSet, attacked: attackedSet }));
console.log("Positions: " + randomSet.length + " random, " + attackedSet.length + " with a piece of yours attacked.");
