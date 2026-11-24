import { score, uci } from "./engine.mjs";

// Pro mode: the strongest move a human would actually play.
//
// Stockfish says how good each move is; the human model (Maia-3) says how
// likely a player of the chosen rating is to find it. Pro keeps the moves that
// stay within a small expected-score loss of Stockfish's best, then ranks them
// by a KL-regularised utility (Jacob et al., 2022):
//
//   utility = ln P_human(move) − loss / λ
//
// where `loss` is the drop in expected score (0–1) versus the best move.
// A small λ plays like the engine; a large λ plays like the human model.

export const PRO_STYLES = {
  // Tolerance stays below Lichess's inaccuracy threshold (0.05) except in Natural.
  precise: { tolerance: 0.02, lambda: 0.01, label: "Precise" },
  balanced: { tolerance: 0.04, lambda: 0.025, label: "Balanced" },
  natural: { tolerance: 0.07, lambda: 0.05, label: "Natural" },
};
// Pro balance: 0 plays like the engine, 100 like the human model. The named
// styles are points on this scale.
export const STYLE_BALANCE = { precise: 15, balanced: 45, natural: 85 };
export function balanceStyle(balance) {
  const b = Math.max(0, Math.min(100, Number(balance))) / 100;
  const label = b < 0.3 ? "Precise" : b < 0.65 ? "Balanced" : "Natural";
  return { tolerance: 0.01 + 0.07 * b, lambda: 0.005 + 0.055 * b, label };
}
export function proStyle(style) {
  if (typeof style === "number" && Number.isFinite(style)) return balanceStyle(style);
  return PRO_STYLES[style] || PRO_STYLES.balanced;
}
/** The Pro setting from the saved options: the balance slider, else the named style. */
export const proSetting = (options) =>
  Number.isFinite(options?.proBalance) ? options.proBalance : (STYLE_BALANCE[options?.proStyle] ?? STYLE_BALANCE.balanced);

// Lichess's win-probability curve (lichess.org/page/accuracy), as an expected
// score for the side to move. Centipawns are clamped to ±1000 as Lichess does.
const LICHESS_K = 0.00368208;
export function expectedScore(line) {
  if (!line) return 0.5;
  if (line.type === "mate") return line.value > 0 ? 1 : line.value < 0 ? 0 : 0.5;
  const cp = Math.max(-1000, Math.min(1000, line.value));
  return 1 / (1 + Math.exp(-LICHESS_K * cp));
}

/**
 * The human moves worth checking with the engine: the most likely moves until
 * `mass` of the probability is covered, each at least `floor` likely.
 */
export function humanCandidates(ranks, { mass = 0.9, floor = 0.03, max = 5 } = {}) {
  const picked = [];
  let covered = 0;
  for (const row of ranks || []) {
    if (picked.length >= max || covered >= mass || row.probability < floor) break;
    picked.push(row);
    covered += row.probability;
  }
  return picked;
}

/**
 * Rank engine-scored lines for Pro. `lines` are Stockfish lines from the side to
 * move (they may include extra lines searched for human candidates), `ranks` the
 * human model's move probabilities. Returns the accepted lines best-first, each
 * with `probability`, `loss` and `utility`, then the remaining engine lines.
 * `trap` is the most likely human move that Pro rejected, if it is common.
 */
export function rankPro(lines, ranks, style = "balanced") {
  const unique = [];
  const seen = new Set();
  for (const line of lines || []) {
    if (!line?.pv?.length || seen.has(line.pv[0])) continue;
    seen.add(line.pv[0]);
    unique.push(line);
  }
  if (!unique.length) return { lines: [], trap: null };
  const { tolerance, lambda } = proStyle(style);
  const probabilities = new Map((ranks || []).map(({ move, probability }) => [uci(move), probability]));
  const best = Math.max(...unique.map(expectedScore));
  const scored = unique.map(line => {
    const probability = probabilities.get(line.pv[0]) ?? 0;
    const loss = Math.max(0, best - expectedScore(line));
    // A forced mate is kept only if the alternative still wins clearly.
    const keepsMate = !(unique.some(other => other.type === "mate" && other.value > 0) &&
      !(line.type === "mate" && line.value > 0) && expectedScore(line) < 0.97);
    const accepted = loss <= tolerance && keepsMate;
    return {
      ...line, probability, loss, accepted,
      utility: Math.log(Math.max(probability, 0.002)) - loss / lambda,
    };
  });
  const accepted = scored.filter(line => line.accepted)
    .sort((a, b) => b.utility - a.utility || a.loss - b.loss);
  const rest = scored.filter(line => !line.accepted)
    .sort((a, b) => a.loss - b.loss);
  const likeliest = [...scored].sort((a, b) => b.probability - a.probability)[0];
  const trap = likeliest && !likeliest.accepted && likeliest.probability >= 0.2 ? likeliest : null;
  return { lines: [...accepted, ...rest], trap };
}

// Quick ranking from the engine's own candidates only (no extra searches), used
// while the full Pro analysis is still running.
export function proLines(lines, humanRanks, style) {
  if (!lines?.length || !humanRanks?.length) return lines;
  return rankPro(lines, humanRanks, style).lines;
}

// "+0.42 · 38%": the evaluation and how often players at this level choose it.
export function proMetric(line) {
  return score(line) + (line.probability >= 0.005 ? " · " + Math.round(line.probability * 100) + "%" : "");
}
