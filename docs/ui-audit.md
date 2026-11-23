# UI audit of Chess Studio 1.6.0

This audit reviewed the 1.6.0 release in the launcher popup, the pinned panel and Studio at several window widths. The screenshots it refers to are not part of the repository.

## Conclusion

The base is close to premium: there is one blue accent, a calm warm-paper palette, a good board, and short labels. It misses the Apple-like bar for four reasons:
1. **Layout bugs at narrow widths.** In the 320px panel, the sticky footer covers the "Why" text. In the 420px Studio, the nav wraps onto two lines.
2. **Too much stacked at once.** The analysis rail shows engine lines, human lines, a 2-line "Human move model · Local model · Maia unavailable" heading, Why, Moves and several buttons together. There is no single focal point.
3. **Too many rules and boxes.** Hairlines appear between every row and every section, and controls come as pill groups, tabs and link-buttons together. The segmented control, underline tabs and link toggles all sit in one 60px band.
4. **Status copy leaks into headings and toasts.** Examples: "Maia unavailable" in an H3, and the "Try a move…" toast that is still showing on Library.

The fixes are mostly CSS and copy. No rewrite is needed.

Severity: P1 = broken or misleading; P2 = clearly below the bar; P3 = polish.
"In progress" marks items covered by the 1.7.0 redesign of the header above the board and the on-board arrows.

## Launcher popup (`launcher-popup.png`)
| Issue | Sev | Fix |
|---|---|---|
| A 540px-tall popup holds 3 rows; about 60% is empty. | P2 | Size the body to its content (about 200px), or add a one-line live status ("chess.com · White to move · +0.74"). |
| Three different icon styles (outline, filled half, checker), all blue. | P3 | Use one 1.5px-stroke icon set in ink colour. Keep blue for the hover state only. |
| A rule between every row. | P3 | Remove the rules. Use 44px rows with hover fill. |

## Pinned panel / pop-out (`panel-engine-320`, `panel-human-320`, `popout-*`, `panel-dark-360`, `panel-empty-lines-off`)
| Issue | Sev | Fix |
|---|---|---|
| At 320px the sticky footer (Open Studio / Settings) covers the "Why d5?" heading and text. | **P1** | Add bottom padding equal to the footer height on the scroll container, or make the footer non-sticky. |
| "Website analysis" select sits under the logo; the header takes 90px before any chess content. | P2 | Put the logo and source on one line, or move the source into Settings. |
| Three control rows (Engine/Human, Selected/All moves, Show opponent arrows), each in a different style. | P2 (in progress) | Keep one segmented control. Make All moves an icon toggle and opponent arrows a player-row toggle. |
| Player tabs, eval bar and turn heading all compete. "Your turn" repeats "White to move". | P2 | Keep the turn heading and eval number on one line. Remove "Your turn". |
| A rule under every candidate row, and a box around the selected row. | P2 | No rules. Use the selected-row fill only. |
| "Stockfish 19 · Depth 16" is placed above the list. | P3 | Move it to the footer meta line, muted. |
| The explanation line uses a left border bar (an extra container). | P3 | Plain muted text under the selected row. |
| Lines-off empty state: the text is correct but it has no action button. | P3 | Add an inline "Show lines" button. |

## Studio — Practice / Review (`studio-workspace`, `studio-line-replay`, `review*`, `studio-game-over`, `studio-loading`)
| Issue | Sev | Fix |
|---|---|---|
| H3 reads "Human move model · Local model · Maia unavailable" (2 lines). It is a status message used as a heading. | **P1** | Heading "Human". Put a muted "Using fallback model" note under it, linked to Settings. |
| The rail stacks Why, engine list, Compare button, human list and Moves. The Moves list is pushed below the fold. | P2 | Use tabs (Lines / Human / Moves), or collapse human lines into a "Likely" pill on engine rows. |
| The left rail does not reach the bottom on long pages; in full-page captures it floats mid-page (`review-turning-points`). | P2 | Use `min-height:100vh` plus `position:sticky; top:0; height:100vh` on the rail. |
| Huge H1 ("Practice", 44px) and an uppercase eyebrow on every page. This is marketing styling in a tool. | P2 | H1 at 28px. Remove the eyebrow, or keep it only on the website-source page. |
| Toolbar has 4 bordered buttons below the board plus 2 in the header. Undo is disabled and only looks faded. | P2 (in progress) | One primary button. Move the rest into a "…" menu or icon buttons with tooltips. |
| Move list: the active-move pill is wider than the move text, and column widths are uneven. | P3 | Use a tabular-nums grid of 28/1fr/1fr; make the pill hug the text. |
| Loading shows only "Calculating with Stockfish…" with a dot. | P3 | Use skeleton rows (3 grey bars) in place of the list, so the layout does not jump. |
| "Find turning points" returns text only. | P3 | Show an eval graph (mockup 1). |
| Eval bar green/grey under "White evaluation" adds a second accent (green). | P3 | Use an ink/paper bar, as in the panel. |

## Website Studio (`website-studio`, `website-studio-continuation`, `website-studio-no-position`)
| Issue | Sev | Fix |
|---|---|---|
| Two primary blue buttons: "Back to game" and "Open built-in board". | P2 | Keep one primary. The other becomes a text link. |
| The orange reply arrow is drawn as a dotted chain over the queen and hides pieces. | P2 (in progress) | Solid 60%-opacity arrow, drawn under the pieces. |
| Footer row under a rule duplicates the navigation. | P3 | Remove it. Settings goes to a header icon. |
| "No supported position" empty state is plain text. | P3 | Short line plus "Open built-in board" button. |

## Library (`library.png`)
| Issue | Sev | Fix |
|---|---|---|
| The "Try a move. Turn on Show lines…" toast from Practice is still showing on Library. | **P1** | Clear toasts on route change. Auto-dismiss after 4s. |
| A row reads "Saved position · 2 moves" with no date, players, result or thumbnail. | P2 | Show date, opening name, result and a mini board. Make the whole row clickable. |
| Selected nav item has a border plus a fill (other pages use fill only). | P3 | Use one style. |
| No empty state was captured; one is likely missing. | P3 | "No saved games yet" plus an Import button. |

## Settings (`settings-light`, `settings-dark`, `website-settings`)
| Issue | Sev | Fix |
|---|---|---|
| 14 selects in one column. Labels are at the far left and controls 760px away, so the eye travels far. | P2 | Max width 560px. Use switches for on/off settings. Add a short helper line only where needed. |
| "Website search depth" vs "Engine depth", and "Human predictions" vs "Human model level": the overlap is confusing. | P2 | Merge into "Engine strength" and "Human model (rating)". |
| The rail ends at the viewport height (same bug as Studio). | P2 | As above. |
| Model sizes are shown as body copy ("downloads 46 MB…"). | P3 | Muted helper text, 13px. |

## Narrow Studio 420px and dark mode (`practice-dark-420`, `practice-new-game-420`, `practice-dark-desktop`)
| Issue | Sev | Fix |
|---|---|---|
| The nav wraps: "Website analysis" moves to its own line in a pill row. | P2 | Use a horizontal scroll row, or move it into a "More" item. |
| Toolbar buttons wrap to 2 lines (Export PGN is left alone). | P2 (in progress) | Icon buttons, or the overflow menu. |
| Dark mode: the light-blue primary (#8eb7ff) with dark text reads as disabled. | P3 | Use a stronger blue (#4d8dff) with white text. |
| Dark mode: board light squares (#c4cbd0) are very bright next to the dark UI. | P3 | Dim them to about #aab3ba. |

## Cross-cutting
| Area | Issue | Sev | Fix |
|---|---|---|---|
| Type scale | Sizes in use include 11, 12, 13, 14, 15, 17, 20, 28 and 44 px. Labels at 11–12px are too small in the panel. | P2 | Use 4 sizes: 13 / 15 / 20 / 28. Minimum 13px. Use tabular-nums for scores. |
| Spacing | Gaps vary (10, 14, 18, 22 px). | P3 | Use an 8pt grid (8/16/24/32). |
| Accent | Blue is used for links, tabs, toggles, icons, primary buttons and the selected row. Green and orange are added on top. | P2 | Keep blue for the primary action and selection only. Orange only for opponent arrows. |
| Containers | A rule between every row and every section. | P2 | Separate with whitespace. Keep at most one rule per view. |
| Focus/keyboard | Focus ring exists (--focus). There are no keyboard shortcuts for moves or candidates in the panel. | P2 | Arrow keys, plus a sheet opened with `?` (mockup 4). |
| Contrast | Muted #565e69 on #faf9f6 is about 6.3:1 (passes). Placeholder and disabled text is about 2.5:1. | P3 | Keep disabled text at 3:1 or higher. |
| Consistency | The panel has a black eval bar; Studio has a green bar. The panel uses pill tabs; Studio uses a rail nav. | P2 | Make one shared eval component and one segmented control. |

## Top 10 ideas (ranked by value ÷ effort)
1. **Eval graph + move-quality badges in Review** (?!, ?, ??, !, book) and an accuracy summary. High value, medium effort; reuses the turning-points scan. → `mockups/1-review-eval-graph.png`
2. **One-line "why" under every candidate**, in a compact panel. High value, low effort; the explanation engine already exists. → `mockups/2-compact-panel-why.png`
3. **Keyboard shortcuts plus a `?` sheet.** Medium value, low effort. → `mockups/4-keyboard-sheet.png`
4. **Threat view.** Hold T to see the opponent's best move as a red arrow and square, with a one-liner. High value, medium effort (null-move search). → `mockups/3-threat-view.png`
5. Compact panel mode: board-less, 4 rows, auto-height for pop-out. Medium value, low effort.
6. Skeleton loading rows plus a depth progress ring in place of the text spinner. Medium value, low effort.
7. Library cards with mini board, opening name, date and result. Medium value, low effort.
8. "Practice this mistake": jump from a Review badge to Practice from that position. High value, medium effort.
9. Opening name label under the turn heading (openings.mjs already exists). Medium value, low effort.
10. Post-game summary card shared as an image. Low–medium value, medium effort.
