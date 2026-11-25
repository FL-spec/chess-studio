export const websiteDefaults = {
  enabled: true,
  // Your Chess.com or Lichess name ("" = found automatically).
  username: "",
  bullet: false,
  arrows: true,
  arrowSide: "preview",
  // With "Selected player" arrows, also draw the other side's replies.
  opponentArrows: true,
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

// Settings that bullet mode sets. Turning bullet off puts them back to the defaults.
export const BULLET_KEYS = ["lens", "view", "depth", "lines", "proBalance", "humanPlies", "miniBoard", "arrowSide"];

/** The values bullet mode uses. "human" (default) is the move a player would
 * really make, checked by a quick Stockfish search; "engine" is Stockfish only. */
export function bulletValues(options) {
  const human = options.bulletStyle !== "engine";
  return { lens: human ? "pro" : "engine", view: "moves", depth: human ? 8 : 9, lines: human ? 2 : 1,
    ...(human ? { proBalance: 70 } : {}), humanPlies: 1, miniBoard: false, arrowSide: "turn" };
}

/** Default values for the settings bullet mode changes (proBalance: unset). */
export function bulletReset() {
  return Object.fromEntries(BULLET_KEYS.map((key) => [key, websiteDefaults[key]]));
}

/** A bullet-controlled setting changed by hand while bullet is on: bullet turns off. */
export function leavesBullet(options, key, value) {
  if (!options.bullet || !BULLET_KEYS.includes(key)) return false;
  const preset = bulletValues(options);
  return key in preset && preset[key] !== value;
}

export function websiteSearchOptions(saved) {
  const options = { ...websiteDefaults, ...saved };
  if (!options.bullet) return options;
  return { ...options, ...bulletValues(options) };
}
