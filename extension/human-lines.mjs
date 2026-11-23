import { Chess } from "./vendor/chess.mjs";
import { rankHuman } from "./policy.mjs";
import weights from "./weights.mjs";
import openings from "./openings.mjs";

export function humanLines(fen, elo, count = 3, ranked) {
  const board = new Chess(fen);
  const fields = fen.split(" ");
  const ply = (Number(fields[5]) - 1) * 2 + Number(fields[1] === "b");
  return (ranked || rankHuman(board, elo, ply, weights, openings))
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
