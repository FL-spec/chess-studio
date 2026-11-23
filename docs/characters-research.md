# Commentator characters: research and recommendation

Date: 2026-11-23. Scope: better coach faces, smoother and richer reactions, shipped offline in the MV3 extension.

## Conclusion

Use **layered SVG characters animated with CSS and the Web Animations API (WAAPI)**, built from CC0 art (DiceBear Notionists or Open Peeps, or our own drawn parts). It needs no runtime library, works under the current CSP, costs no CPU when idle, and fits well under 1 MB. Add **canvas-confetti** (ISC, 25 KB) for Brilliant/Best streak moments.

Consider **Rive** later, only if we commission a professional animator. Rive gives Duolingo-level motion, but adds about 1.5 MB of runtime and needs custom art.

## Current state (verified in repo)

- `development/build-coaches.mjs` builds static SVGs from DiceBear `avataaars`.
- `extension/coaches/` holds 6 moods per coach (`<name>-<mood>.svg`), 292 KB total.
- `extension/companion-view.mjs:61` `reactionCard(view)` renders the card; it is appended at line 264.
- License risk: DiceBear lists Avataaars (Pablo Stanley) as "Free for personal and commercial use". That is a custom grant, not a standard open licence. Its compatibility with GPL-3.0 redistribution is unclear. Moving to a CC0 style removes this risk.

## Licences checked at the source

Checked on dicebear.com/licenses, unpkg package.json files, and the Microsoft repo LICENSE (2026-11-23).

| Asset | Licence | GPL-3.0 project? |
|---|---|---|
| DiceBear Notionists (Zoish) | CC0 | Yes, no conditions |
| DiceBear Lorelei / Lorelei Neutral (Lisa Wischofsky) | CC0 | Yes |
| DiceBear Open Peeps (Pablo Stanley) | CC0 | Yes |
| DiceBear Adventurer (Lisa Wischofsky) | CC BY 4.0 | Yes, with attribution |
| DiceBear Micah (Micah Lanier) | CC BY 4.0 | Yes, with attribution |
| DiceBear Fun Emoji (Davis Uche) | CC BY 4.0 | Yes, with attribution |
| DiceBear Avataaars, Bottts (Pablo Stanley) | Custom "free for personal and commercial use" | Unclear; avoid |
| Microsoft Fluent Emoji (3D, flat, high-contrast) | MIT | Yes |
| Rive web runtime `@rive-app/canvas` 2.55.0 | MIT | Yes (the .riv art has its own licence) |
| lottie-web, `@lottiefiles/dotlottie-web` | MIT | Yes |
| canvas-confetti 1.9.4 | ISC | Yes |
| OpenMoji | CC BY-SA 4.0 (not re-checked today) | Yes, one-way into GPL-3.0 per FSF; art stays BY-SA |
| Google Noto animated emoji | CC BY 4.0 per Google's page (not re-checked today) | Yes, with attribution |
| Rive community files | Per file (often CC BY); check each | Case by case |

Not checked here: Big Smile and Personas styles. Verify on dicebear.com/licenses before use.

## Runtime sizes (measured from unpkg, uncompressed)

| Runtime | Size |
|---|---|
| Rive canvas-lite `rive.js` + `rive.wasm` | 570 KB + 906 KB = about 1.48 MB |
| dotlottie-web `index.js` (plus its wasm, not measured) | 161 KB + wasm |
| lottie-web `lottie_light.min.js` | 168 KB |
| canvas-confetti | 25 KB |
| CSS/SVG + WAAPI | 0 KB |

## Top 3 approaches

### 1. Layered SVG + CSS/WAAPI (recommended)

- **Looks like:** Notionists or Open Peeps line art (dicebear.com/styles/notionists, openpeeps.com), with blinking eyes, mouth swaps, head tilt, squash and stretch, and a short "anticipation" before each reaction.
- **Licence:** CC0 art, our own code. No attribution needed.
- **Size:** about 20–40 KB per coach for all parts. Under 300 KB for the full cast.
- **CSP/MV3:** fully compatible. No eval, no wasm, no network.
- **Effort:** 3–5 days for 2–3 coaches, including tuning.
- **Limit:** motion is "good UI" level, not full character animation.

### 2. Rive state machine

- **Looks like:** Duolingo's characters (rive.app/blog, Duolingo case study). One `.riv` per coach with a state machine and a `mood` input.
- **Licence:** runtime MIT. Art must be commissioned or a community file with a compatible licence.
- **Size:** about 1.5 MB runtime plus 20–100 KB per `.riv`. Near the 2 MB budget.
- **CSP/MV3:** works. The wasm needs `'wasm-unsafe-eval'`, which the manifest already allows. Ship `rive.wasm` in the package and point the runtime at it with `RuntimeLoader.setWasmUrl(chrome.runtime.getURL(...))`. Pause the render loop when idle.
- **Effort:** 1–2 weeks with a Rive animator; 1–2 days of integration.
- **Risk:** highest polish, but highest cost and size, and art dependency.

### 3. Fluent Emoji 3D faces + CSS motion

- **Looks like:** Microsoft's 3D emoji faces (github.com/microsoft/fluentui-emoji), one PNG per mood (grinning, star-struck, thinking, worried, astonished).
- **Licence:** MIT.
- **Size:** about 10–30 KB per PNG at 128 px. Under 200 KB.
- **CSP/MV3:** compatible.
- **Effort:** 1 day.
- **Limit:** faces are emoji, not a named "coach" with personality. Crossfades between images, no part motion. Good fallback or "emoji coach" option.

Not recommended: Lottie. It is CSP-safe in light/dotLottie builds, but there is no CC0 character set with our six moods, and making one costs the same as Rive with weaker interactivity.

## Implementation plan for approach 1

### Asset pipeline

1. In `development/build-coaches.mjs`, replace `avataaars` with `notionists` (or `openPeeps`) from `@dicebear/collection`. Fix the seed per coach.
2. Generate one SVG per coach with a neutral face. Generate the eye and mouth variants per mood. Split them into named groups: `#body`, `#head`, `#eyes-<variant>`, `#brows-<variant>`, `#mouth-<variant>`.
3. Run SVGO (keep IDs). Write one sprite per coach to `extension/coaches/<name>.svg`. Delete the old `<name>-<mood>.svg` files.
4. Update the licence note in the build script and in the repo's third-party notices: "Notionists by Zoish, CC0".

### Runtime

- `extension/coaches.mjs`: export per coach the sprite path and the parts per mood.
- New `extension/coach-motion.mjs` (about 150 lines):
  - `setMood(el, mood, grade)` toggles `data-mood` on the root, which shows the right eyes, brows and mouth through CSS.
  - It plays one WAAPI reaction with `el.animate(...)`. Cancel the previous animation first, so fast moves do not stack.
  - Blink: one CSS keyframe on `#eyes`, `scaleY(1 → 0.1 → 1)` over 150 ms, with a random 3–6 s delay. Pause it with `animation-play-state` when the panel is hidden (`document.visibilityState`, `IntersectionObserver`).
- `extension/companion-view.mjs` `reactionCard`: keep the coach element across re-renders. Key it by coach id, and only call `setMood` when the move index changes. Do not rebuild the SVG on every render; that is what re-triggers animations.
- `extension/style.css`: animate only `transform` and `opacity`. Use `transform-origin: 50% 100%` for squash and stretch. Add `will-change: transform` only while a reaction is playing. Add `@media (prefers-reduced-motion: reduce)` that turns off bounce, shake and confetti and keeps a 150 ms crossfade.

### Mood to animation mapping

| Mood | Grades | Face | Motion (WAAPI) | Extra |
|---|---|---|---|---|
| idle | none | neutral eyes, soft smile | breathing `scale(1 → 1.015)` 4 s loop, blink | none |
| delighted | Brilliant, Great | wide eyes, open smile | anticipation dip 80 ms, then jump `translateY(-8px) scale(1.06, 0.94 → 0.96, 1.04)`, 420 ms spring | confetti burst (canvas-confetti, 40 particles, `disableForReducedMotion: true`) on Brilliant or a streak of 5+ |
| happy | Best, Excellent | smile, raised brows | nod `rotate(-4deg → 3deg → 0)`, 320 ms | grade badge pop `scale(0.6 → 1.08 → 1)` |
| thinking | Good, Book | eyes to the side, flat mouth | head tilt `rotate(6deg)` held, slow blink | "..." dots fading in the speech bubble |
| worried | Inaccuracy | brows up, small mouth | small shrink `scale(0.97)` + 2 px sway, 400 ms | none |
| shocked | Mistake, Blunder | round eyes, "O" mouth | recoil `translateY(4px) scale(1.05, 0.92)` then settle, 300 ms; 3-step shake ±3 px on Blunder | badge shake; no sound by default |

Timing: reactions 250–450 ms, ease-out spring `cubic-bezier(.34,1.56,.64,1)`; exits 150 ms ease-in. Speech text fades in 60 ms after the face moves, so the face leads.

Sound: optional, off by default, a setting in the side panel. Use short local `.ogg` files under 10 KB each, made by us or CC0.

### Verification

- Chrome Performance panel: idle CPU near 0% with the panel open (only the blink CSS animation runs).
- Rapid moves (10 moves in 2 s): no stacked animations, no layout shifts.
- `prefers-reduced-motion` on: no bounce, shake or confetti.
- Bundle: `du -sh extension/coaches` under 300 KB; confetti adds 25 KB.

## Sources

- DiceBear licences: https://www.dicebear.com/licenses/
- Microsoft Fluent Emoji (MIT): https://github.com/microsoft/fluentui-emoji
- Rive web runtime: https://rive.app/docs/runtimes/web ; package `@rive-app/canvas` (MIT)
- canvas-confetti (ISC): https://github.com/catdad/canvas-confetti
- lottie-web (MIT): https://github.com/airbnb/lottie-web ; dotlottie-web (MIT): https://github.com/LottieFiles/dotlottie-web
- OpenMoji: https://openmoji.org ; FSF licence list on CC BY-SA 4.0: https://www.gnu.org/licenses/license-list.html#ccbysa
