export const websiteDefaults = {
  enabled: true,
  bullet: false,
  arrows: true,
  arrowSide: "preview",
  maia: true,
  lens: "engine",
  depth: 16,
  lines: 3,
  humanPlies: 2,
  miniBoard: true,
  elo: 2000,
  // 0 means "same as your level".
  opponentElo: 0,
  // "page": use the ratings shown on the game page when there are any.
  ratingSource: "page",
  proStyle: "balanced",
  // "obvious": recaptures, captures, checks, promotions and forced replies.
  premoves: "obvious",
  coach: "always",
  view: "moves",
};

export function analysisLens(value) {
  return value === "human" || value === "pro" ? value : "engine";
}

export function websiteSearchOptions(saved) {
  const options = { ...websiteDefaults, ...saved };
  return options.bullet
    ? { ...options, lens: "engine", view: "moves", depth: 9, lines: 1,
        humanPlies: 2, miniBoard: false, arrowSide: "turn" }
    : options;
}
