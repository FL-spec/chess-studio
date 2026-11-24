// Ratings for the human model. Maia-3 was trained on Lichess games, so its
// rating input is on the Lichess scale. Chess.com ratings are lower, most at the
// bottom of the scale; this linear map sits between published blitz and rapid
// fits (Lichess ≈ 0.72·CDC + 670 blitz, 0.81·CDC + 592 rapid; ±70 points).
export const MIN_RATING = 600;
export const MAX_RATING = 2800;
const clamp = (value) => Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(value)));

export function toModelRating(rating, site) {
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return clamp(site === "CHESS.COM" ? 0.76 * rating + 635 : rating);
}

/**
 * Ratings for each color, for the human model.
 * - `ratingSource: "page"` uses the ratings shown next to the players when the
 *   page has them (converted to the model's scale), else the fixed levels.
 * - Your level is `elo`. The opponent's is `opponentElo`, or `elo` when 0.
 * Without a known player, both colors use `elo`.
 */
export function playerRatings(options, view = {}) {
  const mine = clamp(options.elo || 2000);
  const theirs = clamp(options.opponentElo || mine);
  const you = view.playerColor;
  const fixed = you
    ? { [you]: mine, [you === "w" ? "b" : "w"]: theirs }
    : { w: mine, b: mine };
  if (options.ratingSource !== "page" || !view.ratings) return { ...fixed, source: "settings" };
  const w = toModelRating(view.ratings.w, view.site);
  const b = toModelRating(view.ratings.b, view.site);
  return { w: w ?? fixed.w, b: b ?? fixed.b, source: w || b ? "page" : "settings" };
}

// The (self, opponent) rating pair for the player to move in `fen`.
export function moverRatings(ratings, fen) {
  const turn = fen.split(" ")[1] === "b" ? "b" : "w";
  return [ratings[turn], ratings[turn === "w" ? "b" : "w"]];
}
