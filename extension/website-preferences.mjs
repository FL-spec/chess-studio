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
  // Pro balance (0 = like the engine, 100 = like the human model) is saved
  // only when changed; until then the named proStyle applies.
  bulletStyle: "human",
  // Openings to play and learn, by id from book.mjs ("" = any).
  openingWhite: "",
  openingBlackE4: "",
  openingBlackD4: "",
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
  // Bullet: one fast suggestion. "human" (default) is the move a player would
  // really make, checked by a quick Stockfish search; "engine" is Stockfish only.
  if (!options.bullet) return options;
  const human = options.bulletStyle !== "engine";
  return { ...options, lens: human ? "pro" : "engine", view: "moves", depth: human ? 8 : 9, lines: human ? 2 : 1,
    proBalance: human ? 70 : options.proBalance, humanPlies: 1, miniBoard: false, arrowSide: "turn" };
}
