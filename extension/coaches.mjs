// Chess Studio commentators and their reaction poses.
import { openingIdea, spokenName } from "./book.mjs";

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
    book: ["Ah, the {o}.", "Here comes the {o}.", "The {o}. Nice."], leave: "Out of book now. Your own ideas from here.",
    brilliant: ["Brilliant!", "What a find!"], great: ["Great move! The only one.", "You found it!"], miss: ["You missed their slip.", "There was a punish there."], best: ["Nice move.", "Well played.", "That's the one."],
    excellent: ["Good choice.", "Solid."], good: ["Fine.", "Reasonable."], inaccuracy: ["Not quite.", "There was better."],
    mistake: ["Careful.", "That one hurts."], blunder: ["Oh no.", "Big slip."], slip: ["They slipped!", "Your chance!"],
    sounds: ["Hm.", "Mm-hm.", "Okay.", "Ah."],
  },
  kai: {
    book: ["The {o}! Love it.", "We're in the {o}, chat.", "Oh, the {o}!"], leave: "Out of theory, chat! Now it's real chess.",
    brilliant: ["Insane!", "Are you kidding?!"], great: ["Only move, and you found it!", "Huge find!"], miss: ["Chat, we missed it!", "They blundered and we let it go!"], best: ["Let's go!", "Clean."], excellent: ["Nice, nice.", "Solid stuff."],
    good: ["Playable.", "Sure."], inaccuracy: ["Hmm, sketchy.", "Not the cleanest."], mistake: ["Oof.", "Chat, that's a mistake."],
    blunder: ["No way!", "That's a blunder!"], slip: ["They blundered! Punish it!", "Free stuff!"],
    sounds: ["Yep.", "Uh-huh.", "Okay, okay.", "Mm."],
  },
  theo: {
    book: ["The {o}. Well known.", "The {o}.", "A main line: the {o}."], leave: "We leave theory here.",
    brilliant: ["Very strong.", "A real sacrifice."], great: ["The only move. Well found.", "Accurate under pressure."], miss: ["A missed chance.", "You let them off the hook."], best: ["Precise.", "Correct."], excellent: ["Good.", "Sensible."],
    good: ["Playable.", "Acceptable."], inaccuracy: ["Imprecise.", "Slightly inaccurate."], mistake: ["A mistake.", "This loses ground."],
    blunder: ["A serious error.", "This should lose."], slip: ["An error by your opponent.", "Now be precise."],
    sounds: ["Hm.", "Mm.", "Known.", "Yes."],
  },
  ada: {
    book: ["This is the {o}.", "The {o}, a classic.", "Let's learn the {o}."], leave: "Out of the book. Now think for yourself.",
    brilliant: ["Beautiful idea!", "Wonderful."], great: ["The one good move. Excellent.", "Well calculated."], miss: ["They erred. Did you see it?", "A chance to punish was there."], best: ["Textbook.", "Instructive. Well done."], excellent: ["Good thinking.", "Sound."],
    good: ["Reasonable.", "A fine idea."], inaccuracy: ["Let's look again.", "A small inaccuracy."], mistake: ["A lesson here.", "Worth reviewing."],
    blunder: ["Let's study this one.", "A costly error."], slip: ["Notice their error.", "Can you use it?"],
    sounds: ["Hm.", "I see.", "Mm-hm.", "Right."],
  },
  mika: {
    book: ["Book: the {o}.", "We're in the {o}.", "The {o}, a main line."], leave: "Out of book. New territory.",
    brilliant: ["Spectacular.", "Found it!"], great: ["Only move. Found.", "Every other move drops the eval."], miss: ["Missed the punish.", "The swing goes back."], best: ["Top choice.", "Engine approves."], excellent: ["Strong.", "Near the top."],
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
  // Opening traps: the one just played into, or a warning before your move.
  const trap = entry.trap
    ? (entry.trap.victimIsMe ? "That is the " + entry.trap.name + ". " + entry.trap.idea
      : "They fell for the " + entry.trap.name + "! " + entry.trap.idea + (entry.trap.punish ? " Look for " + entry.trap.punish + "." : ""))
    : "";
  const warning = entry.trapAhead ? "Careful: " + entry.trapAhead.bait + " here walks into the " + entry.trapAhead.name + "." : "";
  if (grade.key === "book") {
    const label = "Book · " + spokenName(grade.opening || "Opening theory");
    // A new opening on the board: name it and give its main idea, once.
    const idea = entry.openingIntro ? openingIdea(grade.opening) : "";
    if (!idea && !warning) return { label, text: coachSound(id, ply), quiet: true };
    const intro = idea ? pick(voice.book, ply).replace("{o}", spokenName(grade.opening)) + " " + idea : "";
    return { label, text: [intro, warning].filter(Boolean).join(" "), extra: "", quiet: false };
  }
  const opener = !mine
    ? (grade.key === "blunder" || grade.key === "mistake" ? pick(voice.slip, ply) : "")
    : pick(voice[grade.key] || voice.good, ply);
  // The first move after the opening book says so.
  const parts = [entry.leftBook && grade.tone !== "bad" ? voice.leave : "", opener, trap || commentary?.reason, warning].filter(Boolean);
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
  brilliant: "delighted", great: "delighted", best: "happy", excellent: "happy", good: "happy",
  inaccuracy: "thinking", mistake: "worried", blunder: "shocked", miss: "worried",
};
const STREAK_MILESTONES = new Set([3, 5, 8, 12, 20]);
const STRONG = new Set(["brilliant", "great", "best", "excellent"]);

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
  if (key === "brilliant" || key === "great") return "delighted";
  if (key === "blunder" || key === "mistake" || key === "inaccuracy" || key === "miss") return MOOD_BY_GRADE[key];
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
// Image file and label of a coach's face for a mood.
export function coachFace(id, mood = "idle", animated = false) {
  const coach = COACHES.find((item) => item.id === id) || COACHES[0];
  const face = MOODS.has(mood) ? mood : "idle";
  return { src: "coaches/" + coach.id + "-" + face + (animated ? ".gif" : ".webp"), alt: coach.name + ", " + face };
}
export function coachPortrait(id, mood = "idle", { animated = false, replay = 0 } = {}) {
  const { src, alt } = coachFace(id, mood, animated);
  return '<img src="' + src + (animated && replay ? "?play=" + replay : "") + '" alt="' + alt +
    '" width="160" height="160" draggable="false">';
}
