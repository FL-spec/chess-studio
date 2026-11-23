// Move-quality grading from engine evaluations (pure, no DOM).
// Expected score uses the Lichess win-chance curve; thresholds follow Lichess:
// inaccuracy >= 0.10, mistake >= 0.20, blunder >= 0.30 drop in expected score.

const MATE_CP = 10000;

/** Centipawns from the mover's point of view for an engine line {type, value}. */
export function toCentipawns(line) {
  if (!line) return 0;
  if (line.type === "mate") return line.value > 0 ? MATE_CP - line.value : -MATE_CP - line.value;
  return line.value;
}

/** Expected score (0..1) for a centipawn score. */
export function expectedScore(cp) {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 1 / (1 + Math.exp(-0.00368208 * clamped));
}

export const GRADES = {
  best: { label: "Best", symbol: "★", tone: "best" },
  excellent: { label: "Excellent", symbol: "!", tone: "good" },
  good: { label: "Good", symbol: "✓", tone: "good" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!", tone: "warn" },
  mistake: { label: "Mistake", symbol: "?", tone: "bad" },
  blunder: { label: "Blunder", symbol: "??", tone: "bad" },
};

/**
 * Grade a played move.
 * @param {number} beforeCp  eval before the move, from the mover's side
 * @param {number} afterCp   eval after the move, from the mover's side
 * @param {boolean} wasBest  the played move equals the engine's best move
 */
export function gradeMove(beforeCp, afterCp, wasBest = false) {
  const loss = Math.max(0, expectedScore(beforeCp) - expectedScore(afterCp));
  let key;
  if (wasBest || loss < 0.02) key = "best";
  else if (loss < 0.05) key = "excellent";
  else if (loss < 0.1) key = "good";
  else if (loss < 0.2) key = "inaccuracy";
  else if (loss < 0.3) key = "mistake";
  else key = "blunder";
  return { key, loss, ...GRADES[key] };
}

/** Lichess-style per-move accuracy (0..100) from an expected-score loss. */
export function moveAccuracy(loss) {
  const value = 103.1668 * Math.exp(-0.04354 * loss * 100) - 3.1669;
  return Math.max(0, Math.min(100, value));
}

/** Average accuracy over grades; null when empty. */
export function gameAccuracy(grades) {
  if (!grades.length) return null;
  return grades.reduce((sum, grade) => sum + moveAccuracy(grade.loss), 0) / grades.length;
}

/** Current run of best/excellent moves, newest last. */
export function streak(grades) {
  let count = 0;
  for (let index = grades.length - 1; index >= 0; index -= 1) {
    if (grades[index].key !== "best" && grades[index].key !== "excellent") break;
    count += 1;
  }
  return count;
}
