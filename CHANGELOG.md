# Changelog

All notable changes, newest first. Commit hashes refer to
https://github.com/masukundani-png/thebankjob.

## 2026-09-23

- **`2c09a6f`** New app icon: the robot, about 25% larger, on the orange→pink
  gradient from the title screen (replacing the small robot on a dark tile,
  which was hard to spot on a dark wallpaper). Android now gets proper
  adaptive-icon foreground/background layers so the gradient fills the whole
  masked shape instead of being shrunk inside a dark border. Splash screen
  unchanged.
- **`f80715f`** Show the bot's name on the pause screen. It previously only
  appeared on the title, garage and game-over screens.
- **`5bf90b5`** Add a branded Android launch splash screen (the robot + a
  pixel-font "BANK JOB" wordmark on the dark app background) in place of
  Capacitor's generic default. `make_icons.py` now generates the splash
  images too, sharing one robot drawing with the icons (refactor verified
  byte-identical for all four existing icons); added the official
  `@capacitor/splash-screen` plugin and configured it; CI's asset step
  builds the splash screens. Not yet verified on a physical device — see
  BRD §8.5 for the Android 12+ caveat.

## 2026-09-22

- **`d73a96a`** Add crypto trivia to the level-clear screen — a "DID YOU
  KNOW?" line, randomly picked from a ~25-fact bank (Bitcoin, Ethereum,
  Dogecoin, Solana, general blockchain trivia), shown only on levels
  divisible by 3.
- **`b27b2bc`** Add `docs/BRD.md` — the business requirements document.
- **`bd7f5ff`** Add GARAGE access from the pause menu — `G` or a new row on
  the pause card; closing it returns you to wherever it was opened from
  (title, or back to the paused run) instead of always going to the title
  screen.
- **`7434323`** App icon: dropped the gold-coin backdrop, robot alone.
- **`568482e`** New app icon: robot standing in front of a gold coin
  (superseded by the above the same day).
- **`bdb0bb0`** Procedurally generate the platform layout itself for level
  6+ (`genLayout()`) — not just the color theme and hazards like before.
  Levels 1–5 keep their exact original hand-built layout. Verified with a
  structural check across 294 generated seeds plus a simulated playthrough
  of levels 6–40.
- **`6459294`** Let players name their bot from the GARAGE (native
  `prompt()`, 12-char cap). While building/testing this, found and fixed two
  real bugs: the `G` key never actually opened the garage (an early `return`
  in `onPress()` was swallowing it), and the garage row on the title screen
  had no tap zone at all, so touch users could never reach it either way.
- **`a95f3ce`** Added the GARAGE: a cosmetic-only shop (robot skins, trail
  effects, boulder/coin skins) spent from a lifetime coin wallet that's
  separate from run score. Deliberately never touches difficulty or scoring.
- **`53bb257`** Full mute toggle on the pause card (`M`) — silences SFX, the
  drum sting, and phone vibration together; persists.
- **`47b5da4`** Tuned level-1 difficulty (longer grace period, slower early
  hazards, looser hitboxes); redrew fiat hazards as solid rock-textured
  boulders instead of coins; added pause (`P`/`Esc`); added an original
  percussive "heist" drum sting on level start (explicitly *not* a
  reproduction of the copyrighted Mission: Impossible theme).
- **`1b720b4`** Added a reserved ad banner (outside the canvas, can never
  cover gameplay) plus two optional rewarded-ad prompts: one revive per run
  after all lives are lost, and a level-clear 2x-score choice. No forced
  interstitials anywhere. Both ad flows are currently simulated — see
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#ads-stub).
- **`44d359d`** Built the risk/reward scoring system: the FREEDOM combo
  multiplier (x1→x3, chains coins/keys/hazard-plays, breaks on a hit), a real
  boss fight (3-HP GOVERNMENT boss on every 5th level, required to unlock
  the portal), and the level-clear skill bonuses (Perfect Level, Key
  Master, Speed Bonus, 10-level Milestone). The level-clear screen shows the
  full reward breakdown instead of a bare banner.
- **`faddacc`** Swapped the collectibles/hazards: crypto (BTC/ETH/SOL/DOGE)
  is now what you collect; fiat (USD/EUR/ZAR) is what you jump over. Full
  visual redesign (glass-morphism HUD, gradient title screen, a proper
  skyline background, redesigned robot/government/portal art).

## 2026-09-21

- **`fa5bf9d`** Renamed the app from "Crypto Bot Climb" to "Bank Job".
- **`2727a52`** Initial commit: the game itself (endless procedurally-
  generated levels, level 1–5 hand-built intro, Daily Challenge), plus the
  Capacitor Android wrapper and the GitHub Actions build workflow.

---

*Earlier prototyping (the original "Crypto Bot Climb" single-file game, PWA
manifest/service worker/touch controls, the first version of the endless
level generator) happened before this repository existed and isn't captured
here in commit form — see the session that built this project for that
history if it's ever needed.*
