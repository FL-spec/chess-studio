import { Chess } from "./vendor/chess.mjs";
import { explain } from "./chess-view.mjs";
import { uci } from "./engine.mjs";

export function moveEvidence(fen, line) {
  const game = new Chess(fen);
  const moves = line.slice(0, 5).map((value) => game.move(value));
  const [move, reply, continuation] = moves;
  return {
    san: move.san,
    uci: uci(move),
    replyUci: reply ? uci(reply) : "",
    effect: explain(move),
    reply: reply ? reply.san + " — " + explain(reply) : "",
    continuation: continuation
      ? continuation.san + " — " + explain(continuation)
      : "",
    line: moves.map((candidate, index) => {
      const number = candidate.before.split(" ")[5];
      const prefix = candidate.color === "w" ? number + ". " : index === 0 ? number + "… " : "";
      return prefix + candidate.san;
    }).join(" "),
  };
}
