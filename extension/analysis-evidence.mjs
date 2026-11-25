import { Chess } from "./vendor/chess.mjs";
import { explain } from "./chess-view.mjs";
import { uci } from "./engine.mjs";
import { leftHanging, pieceName } from "./tactics.mjs";

function replay(fen, line, limit) {
  const game = new Chess(fen);
  return line.slice(0, limit).map((value) => game.move(value));
}

export function moveEvidence(fen, line) {
  const moves = replay(fen, line, 5);
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


// The played move and the alternative are separate lines from the same position.
export function moveCommentary(move, grade, best, reply) {
  const played = replay(move.before, [move.from + move.to + (move.promotion || "")], 1)[0];
  const continuations = replay(played.after, reply?.pv || [], 3);
  const [response, next, followup] = continuations;
  const costly = grade.tone === "bad" || grade.tone === "warn";
  let reason = explain(played);
  let example;
  let alternative;
  let plan;

  if (grade.tactic && grade.key === "brilliant") {
    const { piece, reply: capture } = grade.tactic;
    reason = `${played.san} offers the ${piece}. The engine still approves the sacrifice after ${capture}.`;
    if (next) example = moveDetail(next);
  } else if (grade.tactic) {
    const { piece, reply: capture } = grade.tactic;
    reason = `${played.san} gives up the ${piece} to ${capture}.`;
  } else if (costly && response) {
    if (reply.type === "mate" && reply.value > 0) {
      reason = `${response.san} starts a forced mate for the other side.`;
    } else {
      // Name the loose piece when the reply takes it.
      const loose = leftHanging(played).find((item) => item.square === response.to);
      const lead = loose && response.captured
        ? `Leaves the ${pieceName(loose.type)} on ${loose.square} without enough protection. `
        : "";
      reason = `${lead}Allows ${response.san}. ${explain(response)}`;
      if (followup && (followup.captured || followup.promotion || followup.san.endsWith("+"))) {
        example = `${next.san} ${followup.san} · ${explain(followup)}`;
      }
    }
  } else if (next && !isCoordinateOnly(explain(next))) {
    example = `After ${response.san}, ${moveDetail(next)}`;
    // The plan as a line that Studio can show: the position after your move,
    // starting with the expected reply.
    plan = { san: next.san, after: response.san, effect: explain(next), fen: played.after, move: uci(response) };
  }

  if (grade.key === "miss" && best?.pv?.length) {
    const [punish] = replay(played.before, best.pv, 1);
    reason = `Their last move could be punished with ${punish.san}. ${explain(punish)}`;
  }
  if (costly && best?.pv?.length && uci(played) !== best.pv[0]) {
    const [preferred, answer, plan] = replay(played.before, best.pv, 3);
    const effect = explain(preferred);
    alternative = `${preferred.san} · ${effect}`;
    if (isCoordinateOnly(effect) && plan)
      alternative = `${preferred.san} ${answer.san} ${plan.san} · ${explain(plan)}`;
  }
  return { reason, example, alternative, plan };
}

function isCoordinateOnly(text) {
  return /^Moves the [a-z]+ to [a-h][1-8]\.$/.test(text);
}

function moveDetail(move) {
  return `${move.san} · ${explain(move)}`;
}
