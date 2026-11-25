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
assert.equal(bestLine.extra, "Plan: After Nc6, d4");
console.log("Gamify tests passed: grade thresholds, mate scores, sacrifices, material blunders, streaks, accuracy and coach reactions.");
