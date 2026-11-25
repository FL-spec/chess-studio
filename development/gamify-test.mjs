import assert from "node:assert/strict";
import { moveCommentary } from "../extension/analysis-evidence.mjs";
import { Chess } from "../extension/vendor/chess.mjs";
import { latestReaction, reactionMood } from "../extension/coaches.mjs";
import { expectedScore, gradedTactic, gradeMove, gameAccuracy, streak, toCentipawns } from "../extension/gamify.mjs";
assert.equal(expectedScore(0), 0.5);
assert.ok(expectedScore(300) > 0.7 && expectedScore(-300) < 0.3);
assert.equal(gradeMove(30, 10, true).key, "best");
assert.equal(gradeMove(30, 25).key, "best");
assert.equal(gradeMove(50, 0).key, "excellent");
assert.equal(gradeMove(50, -40).key, "good");
assert.equal(gradeMove(50, -120).key, "inaccuracy");
assert.equal(gradeMove(100, -150).key, "mistake");
assert.equal(gradeMove(200, -500).key, "blunder");
assert.equal(gradeMove(-100, 50).key, "best");
assert.equal(toCentipawns({ type: "mate", value: 3 }) > 9000, true);
assert.equal(toCentipawns({ type: "mate", value: -2 }) < -9000, true);
const grades = [gradeMove(20, 20, true), gradeMove(50, -400), gradeMove(10, 5), gradeMove(10, 0)];
assert.equal(streak(grades), 2);
const accuracy = gameAccuracy(grades);
assert.ok(accuracy > 50 && accuracy < 100, String(accuracy));
assert.equal(gameAccuracy([]), null);
const offeredQueen = new Chess("3r3k/8/8/8/3Q4/8/8/K7 w - - 0 1").move("d4d7");
const takingQueen = { pv: ["d8d7"] };
const sacrifice = gradedTactic(gradeMove(20, 18, true), offeredQueen, takingQueen, 20, 18, true);
assert.equal(sacrifice.key, "brilliant");
assert.deepEqual(sacrifice.tactic, { piece: "queen", reply: "Rxd7" });
assert.equal(streak([...grades, sacrifice]), 3);
const droppedQueen = gradedTactic(gradeMove(200, -500), offeredQueen, takingQueen, 200, -500, false);
assert.equal(droppedQueen.key, "blunder");
assert.equal(droppedQueen.tactic.piece, "queen");
const exchange = new Chess("2rq3k/8/8/8/3Q4/8/8/K7 w - - 0 1").move("d4d8");
assert.equal(gradedTactic(gradeMove(20, 18, true), exchange, { pv: ["c8d8"] }, 20, 18, true).key, "best");
assert.equal(gradedTactic(gradeMove(460, 440, true), offeredQueen, takingQueen, 460, 440, true).key, "best");
assert.equal(gradedTactic(gradeMove(20, 18, true), offeredQueen, { pv: ["h8h7"] }, 20, 18, true).key, "best");
const opening = new Chess().move("e4");
const sound = moveCommentary(opening, gradeMove(30, 27, true), { pv: ["e2e4"] },
  { pv: ["e7e5", "g1f3"] });
assert.match(sound.reason, /e4|opens|center/i);
assert.match(sound.example, /e5.*Nf3.*e5/);
assert.equal(sound.alternative, undefined);
const blunderNote = moveCommentary(offeredQueen, droppedQueen,
  { pv: ["d4e5"] }, takingQueen);
assert.match(blunderNote.reason, /queen.*Rxd7/);
assert.match(blunderNote.alternative, /^Qe5/);
const sacrificeNote = moveCommentary(offeredQueen, sacrifice, { pv: ["d4d7"] }, takingQueen);
assert.match(sacrificeNote.reason, /offers the queen.*Rxd7/);
assert.equal(sacrificeNote.alternative, undefined);
const foolsMate = new Chess();
for (const san of ["f3", "e5"]) foolsMate.move(san);
const openingBlunder = foolsMate.move("g4");
const mateNote = moveCommentary(openingBlunder, gradeMove(0, -10000), { pv: ["g2g3"] },
  { type: "mate", value: 1, pv: ["d8h4"] });
assert.match(mateNote.reason, /Qh4#.*forced mate/);
assert.match(mateNote.alternative, /^g3/);

// Coach reactions: only moves that matter.
const graded = (key, mine, ply) => ({ grade: { key }, mine, ply, move: { after: "fen" + ply } });
assert.equal(reactionMood(graded("good", true, 1)), null);
assert.equal(reactionMood(graded("best", true, 1), 1), null);
assert.equal(reactionMood(graded("best", true, 1), 3), "happy");
assert.equal(reactionMood(graded("excellent", true, 1), 5), "delighted");
assert.equal(reactionMood(graded("brilliant", true, 1)), "delighted");
assert.equal(reactionMood(graded("inaccuracy", true, 1)), "thinking");
assert.equal(reactionMood(graded("mistake", true, 1)), "worried");
assert.equal(reactionMood(graded("blunder", true, 1)), "shocked");
assert.equal(reactionMood(graded("blunder", false, 1)), "delighted");
assert.equal(reactionMood(graded("inaccuracy", false, 1)), null);
// A blunder is remembered for one reply, then the coach goes quiet.
assert.equal(latestReaction([graded("blunder", true, 1), graded("good", false, 2)])?.mood, "shocked");
assert.equal(latestReaction([graded("blunder", true, 1), graded("good", false, 2), graded("good", true, 3)]), null);
// Streak milestones count strong moves of yours only.
const run = [1, 3, 5].map(ply => graded("best", true, ply)).flatMap(entry => [entry, graded("good", false, entry.ply + 1)]);
assert.equal(latestReaction(run.slice(0, 5))?.mood, "happy");
assert.equal(latestReaction(run.slice(0, 3)), null);
// Book moves and coach lines.
const { bookMove, repertoireMove } = await import("../extension/book.mjs");
const { coachLine } = await import("../extension/coaches.mjs");
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
assert.equal(bookMove(START, "e4").name, "King's Pawn Opening");
assert.equal(bookMove(START, "h4"), null);
assert.equal(repertoireMove(START, { w: "london" }).san, "d4");
assert.equal(repertoireMove(START, { w: "" }), null);
const bookLine = coachLine({ grade: { key: "book", opening: "Italian Game" }, move: { san: "Bc4" }, mine: true, ply: 5 }, "kai");
assert.equal(bookLine.quiet, true);
assert.equal(bookLine.label, "Book · Italian Game");
// A new opening is named once, with its main idea; leaving the book is said.
const introLine = coachLine({ grade: { key: "book", opening: "Open Game (1…e5)" }, move: { san: "e5" }, mine: false, ply: 2, openingIntro: true }, "nova");
assert.equal(introLine.quiet, false);
assert.equal(introLine.label, "Book · Open Game");
assert.match(introLine.text, /Open Game.*e4 and e5/);
const leftLine = coachLine({ grade: { key: "good", label: "Good", tone: "good" }, move: { san: "h3" }, mine: true, ply: 9, leftBook: true,
  commentary: { reason: "Stops a pin on g4." } }, "theo");
assert.match(leftLine.text, /^We leave theory here\. /);
const bestLine = coachLine({ grade: { key: "best", label: "Best", tone: "best" }, move: { san: "Nf3" }, mine: true, ply: 3,
  commentary: { reason: "Develops the knight to f3.", example: "After Nc6, d4" } }, "theo");
assert.match(bestLine.text, /^(Precise|Correct)\. Develops the knight/);
// No plan text in the comment: the plan is the "See plan" button.
assert.equal(bestLine.extra, "");
// Costly moves name the better move in a few words.
const costlyLine = coachLine({ grade: { key: "mistake", label: "Mistake", tone: "bad" }, move: { san: "h4" }, mine: true, ply: 9,
  commentary: { reason: "Allows Nxe5. Wins a pawn.", alternative: "Nf3 · Develops the knight." } }, "nova");
assert.equal(costlyLine.extra, "Better was Nf3.");
// A coordinate-only reason adds nothing to a good move.
const plainLine = coachLine({ grade: { key: "best", label: "Best", tone: "best" }, move: { san: "Rd1" }, mine: true, ply: 21,
  commentary: { reason: "Moves the rook to d1." } }, "theo");
assert.doesNotMatch(plainLine.text, /Moves the rook/);
console.log("Gamify tests passed: grade thresholds, mate scores, sacrifices, material blunders, streaks, accuracy and coach reactions.");

// Tactics and positional ideas in move explanations.
const { explain } = await import("../extension/chess-view.mjs");
const say = (fen, san) => explain(new Chess(fen).move(san));
assert.match(say("r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1", "Nc7+"), /^Forks the king on e8 and the rook on a8/);
assert.match(say("rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 0 4", "Bg5"), /^Pins the knight on f6 to the queen/);
assert.match(say("4q3/8/8/4k3/8/8/8/R5K1 w - - 0 1", "Re1+"), /^Skewers the king on e5/);
assert.match(say("4k3/8/8/8/8/4N3/8/4R1K1 w - - 0 1", "Nd5+"), /^Discovered check/);
assert.match(say("4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1", "Rxd5"), /^Takes the undefended knight on d5/);
assert.match(say("r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4", "Bxc6"), /^Trades the bishop for the knight/);
assert.match(say("rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 3", "Qh5"), /^Threatens mate with Qxf7#/);
assert.match(say("8/8/3k4/8/3P4/8/8/4K3 w - - 0 1", "d5"), /passed pawn/);
assert.match(say("4k3/pp3ppp/8/8/8/8/PP3PPP/R5K1 w - - 0 1", "Rd1"), /open d-file/);
assert.match(say("3r2k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1", "h3"), /luft/);
assert.match(say("rnbqkbnr/pppppppp/8/8/8/6P1/PPPPPP1P/RNBQKBNR w KQkq - 0 1", "Bg2"), /Fianchettoes/);
assert.match(say("8/5k2/8/8/8/8/5K2/8 w - - 0 1", "Ke3"), /king toward the centre/);
const { see } = await import("../extension/tactics.mjs");
assert.equal(see(new Chess("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1"), "d5", "w"), 1);
assert.equal(see(new Chess("4k3/8/2p5/3p4/4P3/8/8/4K3 w - - 0 1"), "d5", "w"), 0);

// Great (only move) and Miss grades.
const { refineGrade } = await import("../extension/gamify.mjs");
assert.equal(refineGrade(gradeMove(50, 45, true), { beforeCp: 50, secondCp: -250 }).key, "great");
assert.equal(refineGrade(gradeMove(50, 45, true), { beforeCp: 50, secondCp: 30 }).key, "best");
assert.equal(refineGrade(gradeMove(300, 120), { beforeCp: 300, opponentErred: true }).key, "miss");
assert.equal(refineGrade(gradeMove(300, -400), { beforeCp: 300, opponentErred: true }).key, "blunder");
assert.equal(reactionMood(graded("great", true, 1)), "delighted");

// Opening book coverage and traps.
const { OPENINGS, openingIdea, openingName, trapAfter, trapAhead } = await import("../extension/book.mjs");
assert.ok(OPENINGS.length >= 80);
for (const opening of OPENINGS) assert.ok(openingIdea(opening.name), "idea for " + opening.name);
const reach = (moves) => { const game = new Chess(); for (const san of moves.split(" ")) game.move(san); return game.fen(); };
assert.equal(openingName(reach("e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5")), "Sicilian Sveshnikov");
assert.equal(openingName(reach("e4 e5 Nf3 Nc6 Bc4 Bc5 b4")), "Evans Gambit");
assert.equal(trapAfter(reach("e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1")).name, "Légal Trap");
assert.equal(trapAhead(reach("e4 e5 Bc4 Nc6 Qh5")).bait, "Nf6");
const fell = coachLine({ grade: { key: "blunder", label: "Blunder", tone: "bad" }, move: { san: "Bxd1" }, mine: false, ply: 10,
  trap: { name: "Légal Trap", idea: "Mate follows.", punish: "Bxf7+", victimIsMe: false } }, "kai");
// Named, one short sentence, and no move hint.
assert.equal(fell.text, "They fell for the Légal Trap! Mate follows.");
const warned = coachLine({ grade: { key: "book", opening: "Open Game" }, move: { san: "Qh5" }, mine: false, ply: 5,
  trapAhead: { name: "Scholar's Mate", bait: "Nf6" } }, "nova");
assert.equal(warned.quiet, false);
assert.match(warned.text, /Careful: Nf6.*Scholar's Mate/);

// Bullet mode writes its values into the settings and resets them when off.
const { bulletValues, bulletReset, leavesBullet, websiteDefaults } = await import("../extension/website-preferences.mjs");
assert.equal(bulletValues({ bulletStyle: "human" }).lens, "pro");
assert.equal(bulletValues({ bulletStyle: "engine" }).lines, 1);
assert.equal(bulletReset().depth, websiteDefaults.depth);
assert.equal(leavesBullet({ bullet: true, bulletStyle: "human" }, "depth", 16), true);
assert.equal(leavesBullet({ bullet: true, bulletStyle: "human" }, "depth", 8), false);
assert.equal(leavesBullet({ bullet: true, bulletStyle: "human" }, "elo", 1500), false);
assert.equal(leavesBullet({ bullet: false }, "depth", 16), false);
// The coach's feed: your moves, and opponent moves only when they matter.
{
  const { inFeed, brief } = await import("../extension/coaches.mjs");
  const g = (key, mine, extra = {}) => ({ grade: { key, tone: "good", label: key }, move: { san: "e4" }, mine, ply: 1, ...extra });
  assert.equal(inFeed(g("good", true)), true);
  // Quiet book moves stay out of the feed; a new opening is named.
  assert.equal(inFeed(g("book", true)), false);
  assert.equal(inFeed(g("book", true, { openingIntro: true })), true);
  assert.equal(inFeed(g("inaccuracy", true)), true);
  assert.equal(inFeed(g("good", false)), false);
  assert.equal(inFeed(g("mistake", false)), false);
  assert.equal(inFeed(g("book", false)), false);
  // Opponent moves only when very bad or very good.
  assert.equal(inFeed(g("book", false, { openingIntro: true })), false);
  assert.equal(inFeed(g("great", false)), false);
  for (const key of ["blunder", "brilliant"]) assert.equal(inFeed(g(key, false)), true, key);
  assert.equal(inFeed(g("good", false, { trap: { name: "Légal Trap" } })), true);
  assert.equal(inFeed(g("good", false, { trapAhead: { name: "Légal Trap", bait: "Bxd1" } })), true);
  assert.equal(reactionMood(g("mistake", false)), null);
  assert.equal(reactionMood(g("brilliant", false)), "shocked");
  assert.equal(reactionMood(g("great", false)), null);
  assert.equal(brief("One. Two. Three.", 2), "One. Two.");
  // A good move's plan is a line Studio can open; the comment stays short.
  const start = new Chess();
  const played = start.move("e4");
  const note = moveCommentary(played, gradeMove(30, 27, true), { pv: ["e2e4"] }, { type: "cp", value: 30, pv: ["e7e5", "g1f3", "b8c6"] });
  assert.ok(note.plan, "plan for a quiet good move");
  assert.equal(note.plan.fen, played.after);
  assert.equal(note.plan.move, "e7e5");
  assert.equal(note.plan.san, "Nf3");
  const said = coachLine({ grade: { key: "good", label: "Good", tone: "good" }, move: { san: "e4", color: "w" }, mine: true, ply: 1, commentary: note }, "theo");
  assert.equal(said.extra, "");
  assert.ok(said.plan);
  assert.ok(said.text.split(/[.!?]/).filter(Boolean).length <= 2, said.text);
  const theirs = coachLine({ grade: { key: "good", label: "Good", tone: "good" }, move: { san: "e5" }, mine: false, ply: 2, commentary: note }, "theo");
  assert.equal(theirs.plan, null);
}
console.log("Coach knowledge tests passed: tactics, Great and Miss grades, opening book, traps and bullet settings.");
