// Chess Studio commentators and their reaction poses.

// Each commentator has six animated GIFs and matching stills for the reaction states.
export const COACHES = [
  { id: "nova", name: "Nova", persona: "The Coach", tagline: "An approachable club coach." },
  { id: "kai", name: "Kai", persona: "The Streamer", tagline: "A live chess creator and tournament host." },
  { id: "theo", name: "Theo", persona: "The Grandmaster", tagline: "A seasoned tournament grandmaster." },
  { id: "ada", name: "Ada", persona: "The Professor", tagline: "A chess teacher with a positional eye." },
  { id: "mika", name: "Mika", persona: "The Analyst", tagline: "A broadcast analyst who follows the critical line." },
];

export const MOOD_BY_GRADE = {
  brilliant: "delighted", best: "happy", excellent: "happy", good: "happy",
  inaccuracy: "thinking", mistake: "worried", blunder: "shocked",
};
const STREAK_MILESTONES = new Set([3, 5, 8, 12, 20]);
const STRONG = new Set(["brilliant", "best", "excellent"]);

/**
 * The coach's mood for a graded move, or null when the move does not matter
 * enough to react to. `streak` is the run of strong moves ending at this move.
 * Your move: brilliant, inaccuracy, mistake, blunder, or a streak milestone.
 * Opponent move: only their mistakes and blunders.
 */
export function reactionMood(entry, streak = 0) {
  const key = entry?.grade?.key;
  if (!key) return null;
  if (!entry.mine) return key === "blunder" ? "delighted" : key === "mistake" ? "happy" : null;
  if (key === "brilliant") return "delighted";
  if (key === "blunder" || key === "mistake" || key === "inaccuracy") return MOOD_BY_GRADE[key];
  if (STRONG.has(key) && STREAK_MILESTONES.has(streak)) return streak >= 5 ? "delighted" : "happy";
  return null;
}

/**
 * The latest move worth reacting to among the last `window` plies of
 * `history` (graded entries in board order), with its mood, or null.
 */
export function latestReaction(history, window = 2) {
  const list = history || [];
  if (!list.length) return null;
  const lastPly = list[list.length - 1].ply;
  let run = 0;
  const streaks = new Map();
  for (const entry of list) {
    if (!entry.mine) continue;
    run = STRONG.has(entry.grade.key) ? run + 1 : 0;
    streaks.set(entry, run);
  }
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const entry = list[index];
    if (lastPly - entry.ply >= window) break;
    const mood = reactionMood(entry, streaks.get(entry) || 0);
    if (mood) return { entry, mood };
  }
  return null;
}

const MOODS = new Set(["idle", "delighted", "happy", "thinking", "worried", "shocked"]);

/** Image markup for a commentator in a mood. */
export function coachPortrait(id, mood = "idle", { animated = false, replay = 0 } = {}) {
  const coach = COACHES.find((item) => item.id === id) || COACHES[0];
  const face = MOODS.has(mood) ? mood : "idle";
  const extension = animated ? ".gif" + (replay ? "?play=" + replay : "") : ".webp";
  return '<img src="coaches/' + coach.id + "-" + face + extension + '" alt="' + coach.name + ", " + face +
    '" width="160" height="160" draggable="false">';
}
