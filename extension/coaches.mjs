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
const MOODS = new Set(["idle", "delighted", "happy", "thinking", "worried", "shocked"]);

/** Image markup for a commentator in a mood. */
export function coachPortrait(id, mood = "idle", { animated = false, replay = 0 } = {}) {
  const coach = COACHES.find((item) => item.id === id) || COACHES[0];
  const face = MOODS.has(mood) ? mood : "idle";
  const extension = animated ? ".gif" + (replay ? "?play=" + replay : "") : ".webp";
  return '<img src="coaches/' + coach.id + "-" + face + extension + '" alt="' + coach.name + ", " + face +
    '" width="160" height="160" draggable="false">';
}
