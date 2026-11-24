import { Chess } from "./vendor/chess.mjs";
import { rankHuman } from "./policy.mjs";
import weights from "./weights.mjs";
import openings from "./openings.mjs";

function plyOf(board) {
  const [, turn, , , , move] = board.fen().split(" ");
  return (Number(move) - 1) * 2 + Number(turn === "b");
}

export function humanRanks(board, elo) {
  return rankHuman(board, elo, plyOf(board), weights, openings);
}

export function humanLines(fen, elo, count = 3, ranked) {
  const board = new Chess(fen);
  const ply = plyOf(board);
  return (ranked || humanRanks(board, elo))
    .slice(0, count)
    .map(({ move, probability }) => {
      const line = [move.san];
      const continuation = new Chess(move.after);
      for (let depth = 1; depth < 5 && !continuation.isGameOver(); depth++) {
        const [next] = rankHuman(
          continuation,
          elo,
          ply + depth,
          weights,
          openings,
        );
        if (!next) break;
        line.push(continuation.move(next.move.san).san);
      }
      return { san: move.san, probability, line };
    });
}
