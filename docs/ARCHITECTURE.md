# Architecture

Everything is in [`www/index.html`](../www/index.html) — no bundler, no
framework, no build step. It's a `<canvas>` game loop with sections marked by
`// ---------- name ----------` comments. Line numbers below will drift as
the file grows; use them as a starting point, not a promise.

```
audio            beep()/drumHit()/heistSting() -- everything is synthesized, no audio files
level geometry   FIXED_PLATS/FIXED_LADDERS/... (levels 1-5) + genLayout() (level 6+)
shop             SHOP registry, wallet, equip/purchase logic (cosmetic only)
state            all mutable game state as module-scoped `let`s
ads (stub)       Ads.adFree flag -- see "Ads stub" below
update           physics, collisions, scoring, state-machine transitions
drawing          everything canvas-drawn, split into background/world/robot/HUD
loop             the fixed-60fps requestAnimationFrame loop
```

## State machine

There's one `state` variable driving both `update()` and `draw()`. Every
frame calls `update(state)` then `draw(state)` unconditionally, including on
the title screen — `draw()` runs from the very first frame, before the player
has ever pressed anything (this is why `plats`/`ladders`/`GOV`/`EXIT` must
have a valid default value from the moment they're declared, not just after
the first `startLevel()` call).

States: `title → play ⇄ paused ⇄ shop`, `play → dying → play | reviveOffer →
reviveAd → play | over`, `play → clearChoice → clearAd → clear → play (next
level)`.

The `shop` state remembers `shopReturn` (`'title'` or `'paused'`) so closing
the GARAGE goes back to wherever it was opened from — opening it mid-run via
pause must not lose the run.

## Level geometry: fixed vs. generated

The vertical rhythm (`LAYOUT_Y` — six platform heights) **never changes**.
Everything that assumes a specific height (jump/gravity tuning, the boss's
platform, drone spawn heights) depends only on that, not on any platform's
horizontal extent. Only x-spans, slopes, ladder x, coin x, and key x vary
between layouts.

- **Levels 1–5**: `FIXED_PLATS`, `FIXED_LADDERS`, `FIXED_GOV`, `FIXED_EXIT`,
  `FIXED_COIN_SPOTS`, `FIXED_KEYS` — the original hand-built layout. Never
  touch these casually; a huge amount of hand-tuned feel lives here.
- **Level 6+**: `genLayout(seedN)` — deterministic (seeded by the effective
  level number, so a given level always generates the same layout, and Daily
  Challenge runs are reproducible for everyone playing that day). Generates
  platform spans, ladder positions (guaranteed to sit within the x-overlap of
  the two platforms they connect — see the loop in `genLayout`), the
  portal's position on the top platform (always clear of the government
  building), coin spots, and key spots.

`startLevel()` picks one or the other by comparing the effective level number
against `LEVELS.length` (5), and reassigns the module-scoped `plats`,
`ladders`, `GOV`, `EXIT` variables — every other function (`surf()`,
`landing()`, `inP()`, drawing, boss/drone/ice logic) reads those by closure,
so they automatically pick up whichever layout is active.

**If you change `genLayout`**, re-run the structural check pattern used
during its development (see [Testing approach](#testing-approach) below)
before shipping: every ladder must be reachable from both platforms it
connects, the portal must never overlap the government building, every
coin/key must sit within its platform's bounds.

## Scoring & the combo system

`award(base, x, y, color, tag)` is the single chokepoint for any points that
should scale with the combo multiplier (coins, hazard jump-overs, hazard/
drone smashes). It reads the current `comboMult()` (a lookup against
`COMBO_TIERS`), applies it, increments `combo`, and spawns the floating
score text. Boss defeat, the portal bonus, and the level-clear skill bonuses
(perfect/key-master/speed/milestone) are **not** run through `award()` — they
're flat bonuses by design, computed once in `enterClear()`.

`combo` resets to 0 on `die()` and at the start of every level.

## Shop / GARAGE (cosmetic only)

`SHOP` is a flat array of items tagged by `cat` (`robot`/`trail`/`boulder`/
`coin`). `coinBank` (persisted as `tbj_bank`) is a separate currency from
score — it increments by exactly 1 per real crypto coin collected,
independent of the combo multiplier, so score inflation never inflates the
shop currency. `owned` (`tbj_owned`) and `equipped` (`tbj_equipped`) persist
to `localStorage`.

**This must stay cosmetic-only.** Every skin lookup (`shopItem(equipped.X)`)
feeds purely into drawing code (`drawRobotAt`, `drawBarrel`, `drawCoin`) —
none of it touches physics, hitboxes, spawn rates, or scoring. If you extend
the shop, keep that boundary; it's what keeps the wallet from turning into
pay-to-win.

## Ads stub

Search for `Ads` in `index.html`. There is **no real ad SDK integrated** —
`Ads.adFree` is a `localStorage`-backed flag that only hides the banner
(`#adBanner` in the DOM, rendered *outside* the canvas so it can never cover
gameplay) and gates nothing else. The two "watch ad" flows
(`reviveOffer`→`reviveAd` for one optional extra life per run, and
`clearChoice`→`clearAd` for an optional level-clear score double) are
currently a **simulated timer** (`drawAdPlaying()` shows "PLAYING SIMULATED
AD" — the label is kept on purpose so nobody mistakes it for a real ad, and
the earlier on-screen developer note about swapping in an SDK was removed
once the game went public on the web; the swap-in point is documented here
and in the code comment above `Ads`). There is deliberately no ad shown on a
normal death — only these two explicitly optional prompts, and the passive
banner.

Before shipping to real users with real monetization: replace the `stateT`
countdown in the `reviveAd`/`clearAd` branches of `update()` with an actual
SDK call (e.g. AdMob's Capacitor plugin), calling the existing
grant-the-reward code in the success callback instead of unconditionally
after the timer. The `adFree` flag has no purchase flow behind it yet either
— that needs native App/Play Store billing (StoreKit / Play Billing), which
is a platform-account-specific integration, not something that can be
stubbed generically.

## Testing approach

There's no formal test suite. The pattern used throughout this project's
history, for anything beyond a pure CSS/copy change:

1. Extract the script: `sed -n '/<script>/,/<\/script>/p' www/index.html |
   sed '1d;$d' > check.js`
2. `node --check check.js` — catches syntax errors immediately.
3. For logic changes, write a small throwaway Node script that stubs the
   browser globals the game touches (`document.getElementById`,
   `window.addEventListener`, `localStorage`, `navigator.vibrate`,
   `AudioContext`, `requestAnimationFrame`), `eval()`s the extracted script
   with a trailing `global.G = { ...expose the internals you need... }`, and
   asserts on `G`'s behavior after calling `G.update()` / `G.onPress()` /
   etc. directly. This has caught real bugs before shipping (see
   `CHANGELOG.md` — the GARAGE tap-zone bug and the `onPress` ordering bug
   were both found exactly this way, before either reached a real device).
4. For visual changes, serve locally (`python -m http.server`) and check in
   an actual browser — canvas rendering can't be verified from Node.

Delete these throwaway test scripts before committing; they're a
verification step, not part of the shipped project.
