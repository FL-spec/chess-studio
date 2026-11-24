// Chess Studio commentators and their reaction poses.

// Each commentator has six animated GIFs and matching stills for the reaction states.
export const COACHES = [
  { id: "nova", name: "Nova", persona: "The Coach", tagline: "An approachable club coach." },
  { id: "kai", name: "Kai", persona: "The Streamer", tagline: "A live chess creator and tournament host." },
  { id: "theo", name: "Theo", persona: "The Grandmaster", tagline: "A seasoned tournament grandmaster." },
  { id: "ada", name: "Ada", persona: "The Professor", tagline: "A chess teacher with a positional eye." },
  { id: "mika", name: "Mika", persona: "The Analyst", tagline: "A broadcast analyst who follows the critical line." },
];

// Each coach's voice: short openers by grade, and small sounds for moves that
// need no comment (book moves, quiet replies).
const VOICES = {
  nova: {
    brilliant: ["Brilliant!", "What a find!"], best: ["Nice move.", "Well played.", "That's the one."],
    excellent: ["Good choice.", "Solid."], good: ["Fine.", "Reasonable."], inaccuracy: ["Not quite.", "There was better."],
    mistake: ["Careful.", "That one hurts."], blunder: ["Oh no.", "Big slip."], slip: ["They slipped!", "Your chance!"],
    sounds: ["Hm.", "Mm-hm.", "Okay.", "Ah."],
  },
  kai: {
    brilliant: ["Insane!", "Are you kidding?!"], best: ["Let's go!", "Clean."], excellent: ["Nice, nice.", "Solid stuff."],
    good: ["Playable.", "Sure."], inaccuracy: ["Hmm, sketchy.", "Not the cleanest."], mistake: ["Oof.", "Chat, that's a mistake."],
    blunder: ["No way!", "That's a blunder!"], slip: ["They blundered! Punish it!", "Free stuff!"],
    sounds: ["Yep.", "Uh-huh.", "Okay, okay.", "Mm."],
  },
  theo: {
    brilliant: ["Very strong.", "A real sacrifice."], best: ["Precise.", "Correct."], excellent: ["Good.", "Sensible."],
    good: ["Playable.", "Acceptable."], inaccuracy: ["Imprecise.", "Slightly inaccurate."], mistake: ["A mistake.", "This loses ground."],
    blunder: ["A serious error.", "This should lose."], slip: ["An error by your opponent.", "Now be precise."],
    sounds: ["Hm.", "Mm.", "Known.", "Yes."],
  },
  ada: {
    brilliant: ["Beautiful idea!", "Wonderful."], best: ["Textbook.", "Instructive. Well done."], excellent: ["Good thinking.", "Sound."],
    good: ["Reasonable.", "A fine idea."], inaccuracy: ["Let's look again.", "A small inaccuracy."], mistake: ["A lesson here.", "Worth reviewing."],
    blunder: ["Let's study this one.", "A costly error."], slip: ["Notice their error.", "Can you use it?"],
    sounds: ["Hm.", "I see.", "Mm-hm.", "Right."],
  },
  mika: {
    brilliant: ["Spectacular.", "Found it!"], best: ["Top choice.", "Engine approves."], excellent: ["Strong.", "Near the top."],
    good: ["Holds the balance.", "Within range."], inaccuracy: ["A small drop.", "The eval dips."], mistake: ["A clear drop.", "The eval swings."],
    blunder: ["Decisive error.", "The eval collapses."], slip: ["Their error.", "The eval swings your way."],
    sounds: ["Noted.", "Hm.", "Tracking.", "Mm."],
  },
};
const voiceOf = (id) => VOICES[id] || VOICES.nova;
// A scrambled index, so the lines do not repeat in an obvious order.
const pick = (list, seed) => list[((Math.abs(seed) + 11) * 2654435761 >>> 0) % 97 % list.length];

/** A short sound for a move that needs no comment. */
export function coachSound(id, seed = 0, avoid = "") {
  const options = voiceOf(id).sounds.filter((sound) => sound !== avoid);
  return pick(options, seed);
}

/**
 * What the coach says about a graded move: { label, text, quiet }.
 * Book moves are quiet: only the opening name and a short sound.
 */
export function coachLine(entry, id) {
  const { grade, move, mine, commentary, ply = 0 } = entry;
  const voice = voiceOf(id);
  if (grade.key === "book")
    return { label: "Book · " + (grade.opening || "Opening theory"), text: coachSound(id, ply), quiet: true };
  const opener = !mine
    ? (grade.key === "blunder" || grade.key === "mistake" ? pick(voice.slip, ply) : "")
    : pick(voice[grade.key] || voice.good, ply);
  const parts = [opener, commentary?.reason].filter(Boolean);
  // The plan for good moves; the better move for costly ones.
  const extra = grade.tone === "bad" || grade.tone === "warn"
    ? (commentary?.alternative ? "Better: " + commentary.alternative : "")
    : (commentary?.example ? "Plan: " + commentary.example : "");
  return {
    label: (mine ? "" : "Opponent · ") + move.san + " · " + grade.label,
    text: parts.join(" "),
    extra,
    quiet: false,
  };
}

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
  if (key === "book") return null;
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
    if (!entry.mine || entry.grade.key === "book") continue;
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
