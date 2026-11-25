// The commentator inside Studio: one coach card for the move at the cursor.
// Practice: your moves, and the opponent's only for extremes (a blunder, a
// Brilliant move or a trap). Review (Analyse a game): every move, with the
// best move when it was not played. Grades come from game-analysis.mjs, so a
// move gets the same grade, book name, trap and comment as in Game review,
// and the engine sees the move history (repetitions included).
import { COACHES, coachFace, coachLine, reactionMood, MOOD_BY_GRADE } from "./coaches.mjs";
import { boardAt, gradeReviewMove } from "./game-analysis.mjs";
import { analyze } from "./engine.mjs";
import { Chess } from "./vendor/chess.mjs";

const DEPTH = 12;
const linesCache = new Map(); // start + moves up to a position -> engine lines
let job = null;
let shownKey = "";

const uciOf = (move) => move.from + move.to + (move.promotion || "");
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const article = (word) => (/^[aeiou]/i.test(word) ? "an " : "a ");

async function linesAt(start, moves, index, signal) {
  const key = start + "|" + moves.slice(0, index).map(uciOf).join(" ");
  if (linesCache.has(key)) return linesCache.get(key);
  const board = boardAt(start, moves, index);
  const lines = board.isGameOver() ? [] : await analyze(board, { depth: DEPTH, count: 2, signal });
  if (linesCache.size > 600) linesCache.delete(linesCache.keys().next().value);
  linesCache.set(key, lines);
  return lines;
}

/** Grade move `index` (0-based) as Game review does, with the move before it for "Miss". */
export async function gradeAt({ start, moves, index, playerColor = null, analyse = linesAt, signal }) {
  const lines = [];
  const first = Math.max(0, index - 1);
  for (let at = first; at <= index + 1; at += 1) lines[at] = await analyse(start, moves, at, signal);
  const previous = index > 0 ? gradeReviewMove({ start, moves, lines, index: index - 1, playerColor }) : undefined;
  return gradeReviewMove({ start, moves, lines, index, previous: previous || undefined, playerColor });
}

function sanOf(fen, uci) {
  try { return new Chess(fen).move(uci).san; } catch { return uci; }
}

function card(el, { coachId, mood, who, title, text, extra, tone, fresh, action }) {
  const { src, alt } = coachFace(coachId, mood);
  el.innerHTML =
    '<img class="sc-face" src="' + src + '" alt="' + escapeHtml(alt) + '" width="56" height="56" draggable="false">' +
    '<div class="sc-body">' +
    (who ? '<p class="sc-who">' + escapeHtml(who) + "</p>" : "") +
    '<p class="sc-title"' + (tone ? ' data-tone="' + tone + '"' : "") + ">" + escapeHtml(title) + "</p>" +
    (text ? '<p class="sc-text">' + escapeHtml(text) + "</p>" : "") +
    (extra ? '<p class="sc-best">' + extra + "</p>" : "") +
    "</div>";
  if (action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sc-show";
    button.textContent = action.label;
    button.onclick = action.run;
    el.querySelector(".sc-best, .sc-body").append(button);
  }
  if (fresh) {
    el.classList.remove("sc-pop");
    void el.offsetWidth;
    el.classList.add("sc-pop");
  }
}

function titleFor(entry) {
  const { grade, move } = entry;
  if (grade.key === "book") return move.san + " · " + (grade.opening || "Book move");
  const label = grade.label.toLowerCase();
  if (grade.key === "best") return move.san + " is the best move";
  if (grade.tone === "bad" || grade.tone === "warn") return move.san + " is " + article(label) + label;
  return move.san + " is " + article(label) + label + " move";
}

/**
 * Update the coach card. `history` is the verbose move list, `cursor` the
 * number of moves shown, `side` your colour in practice ("w"/"b").
 * `exercise`: a "Retry this position" attempt in Review.
 * `hidden`: Practice explanations are "On demand" and none was asked for.
 * `onShow(fen, line)`: play a line on the board (the best move).
 * Grading runs in the background and is cancelled by the next call.
 */
export function updateStudioCoach(el, { mode, history, cursor, side, coachId, hidden = false, exercise = false, onShow }) {
  if (!el) return;
  job?.abort();
  job = new AbortController();
  const signal = job.signal;
  if (hidden) {
    shownKey = "";
    el.replaceChildren();
    return;
  }
  const coach = COACHES.find((item) => item.id === coachId) || COACHES[0];
  const name = coach.name;
  const review = mode === "review";
  if (!cursor) {
    shownKey = "";
    card(el, {
      coachId: coach.id, mood: "idle", who: name,
      title: exercise ? "Find a better move" : review ? "Let’s look at this game" : "Your move when ready",
      text: exercise ? "Play your move and I will tell you how it compares."
        : review ? "Step through the moves and I will comment on each one." : "I will comment on your moves as you play.",
    });
    return;
  }
  const start = history[0].before;
  const moves = history;
  const playerColor = review ? null : side;
  const show = (entry) => {
    const { move, grade } = entry;
    const line = coachLine(entry, coach.id);
    const mood = entry.mine ? MOOD_BY_GRADE[grade.key] || "idle" : reactionMood(entry) || "idle";
    const costly = grade.tone === "bad" || grade.tone === "warn";
    const bestSan = sanOf(move.before, entry.best);
    // Name the better move once: the coach's "Better was …" or our own line.
    const extra = line.extra
      ? escapeHtml(line.extra)
      : !entry.wasBest && grade.key !== "book" && grade.tone !== "best"
        ? "Best was <strong>" + escapeHtml(bestSan) + "</strong>" : "";
    const who = (review ? "" : entry.mine ? "You · " : "Opponent · ") + (move.color === "w" ? "White" : "Black");
    const key = move.before + uciOf(move);
    const action = onShow && !entry.wasBest && (costly || grade.key === "good" || grade.key === "excellent")
      ? { label: "Show " + bestSan, run: () => onShow(move.before, entry.bestLine) } : null;
    card(el, {
      coachId: coach.id, mood, who, title: titleFor(entry), text: line.text, extra,
      tone: grade.key === "book" ? "" : grade.tone, fresh: key !== shownKey, action,
    });
    shownKey = key;
  };
  const thinking = (move) => {
    if (move.before + uciOf(move) === shownKey) return;
    card(el, { coachId: coach.id, mood: "thinking", who: name, title: move.san, text: "Thinking about this move…" });
  };
  (async () => {
    try {
      const move = moves[cursor - 1];
      if (!review && move.color !== side) {
        // Opponent's move: comment only on extremes, else keep your last move.
        const entry = await gradeAt({ start, moves, index: cursor - 1, playerColor, signal });
        if (signal.aborted) return;
        if (entry && (reactionMood(entry) || entry.trap)) return show(entry);
        if (cursor < 2) {
          shownKey = "";
          card(el, { coachId: coach.id, mood: "idle", who: name, title: "Your move", text: "I will comment on your moves as you play." });
          return;
        }
        const mine = await gradeAt({ start, moves, index: cursor - 2, playerColor, signal });
        if (signal.aborted || !mine) return;
        return show(mine);
      }
      thinking(move);
      const entry = await gradeAt({ start, moves, index: cursor - 1, playerColor, signal });
      if (signal.aborted || !entry) return;
      show(entry);
    } catch (error) {
      if (error?.name !== "AbortError" && !signal.aborted)
        card(el, { coachId: coach.id, mood: "idle", who: name, title: "No comment", text: "The engine is not available right now." });
    }
  })();
}
