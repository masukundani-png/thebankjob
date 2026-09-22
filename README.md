# Bank Job

A Donkey Kong-style climbing game: a robot collects crypto coins, dodges rolling
fiat-currency boulders, and breaks into the GOVERNMENT'S vault at the top of
each level. Built as a single-file web game, wrapped for Android with
Capacitor, and built into an APK automatically on every push via GitHub
Actions.

- **App ID:** `com.thebankjob.game`
- **Repo:** https://github.com/masukundani-png/thebankjob
- **Play it in a browser:** open [`www/index.html`](www/index.html) (see
  [docs/BUILDING.md](docs/BUILDING.md) for how to run it locally)
- **Get the Android build:** [Actions tab](https://github.com/masukundani-png/thebankjob/actions) →
  newest successful run → Artifacts → `the-bank-job-apk`

If you're picking this project up to make a change, start with
[docs/BUILDING.md](docs/BUILDING.md) — it's the step-by-step procedure for
editing, testing, and shipping a new build. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
explains how the code is organized. [CHANGELOG.md](CHANGELOG.md) has the
full history of what's been built and why.

## What's in the game

| System | Summary |
|---|---|
| Core loop | Collect crypto (score), jump over or smash fiat boulders (self-custody), climb to the FREEDOM portal |
| Combo | Chaining pickups/hazard-plays without getting hit builds a x1→x3 score multiplier; breaks on a hit |
| Boss fights | Every 5th level locks the portal behind 3 keys + a GOVERNMENT boss you smash while shielded |
| Levels 1-5 | Hand-built, each introducing one mechanic (boulders → fireballs → drones → ice → boss) |
| Levels 6+ | Endless, procedurally generated — theme, hazards, *and* the platform layout itself (`genLayout()`) |
| Daily Challenge | A date-seeded endless run with its own separate best score |
| GARAGE | Cosmetic-only shop (robot skins, trail effects, boulder/coin skins) spent from a lifetime coin wallet — never affects difficulty or score. Opens from the title screen or the pause menu |
| Pause / mute | `P`/`Esc` to pause (tap the HUD button on touch); `M` fully mutes SFX, the drum sting, and vibration |
| Ads | A reserved banner outside the play area, plus two **optional** rewarded prompts (one revive per run, a level-clear 2x). Currently simulated — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#ads-stub) before shipping to real users |
| Bot naming | Rename from the GARAGE (`N`, native `prompt()`) |

## Tech stack

- **Game:** vanilla HTML5 Canvas + JavaScript, no framework, no build step —
  the entire game is one file, [`www/index.html`](www/index.html).
- **Audio:** synthesized in-browser with the Web Audio API. There are no
  audio asset files.
- **Offline/installable (PWA):** [`www/manifest.webmanifest`](www/manifest.webmanifest)
  + [`www/sw.js`](www/sw.js) (a cache-first service worker).
- **Icons:** generated procedurally by [`make_icons.py`](make_icons.py)
  (pure Python stdlib — writes raw PNGs, no image libraries or external
  assets).
- **Android:** [Capacitor](https://capacitorjs.com/) wraps `www/` into a
  native Android project.
- **CI:** [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml)
  builds a debug APK on every push to `main`.

## Repo layout

```
.
├── www/                          # the game itself -- Capacitor builds the APK from this folder
│   ├── index.html                   #   the whole game (HTML + CSS + JS in one file)
│   ├── sw.js                        #   offline cache (bump VERSION when any cached file changes)
│   ├── manifest.webmanifest         #   PWA metadata
│   └── icon-*.png                   #   app icons (generated -- see make_icons.py)
├── assets/
│   └── icon-only.png              # source image @capacitor/assets uses to build the native launcher icon
├── make_icons.py                  # regenerates every icon file above (pure stdlib, no deps)
├── capacitor.config.json          # app id, app name, web dir
├── package.json                   # Capacitor dependencies (installed fresh by CI each run)
├── .github/workflows/build-apk.yml   # the CI build
└── android/                       # NOT committed -- generated fresh by CI every run (see .gitignore)
```

There is exactly **one** copy of the game (`www/index.html`) — edit it in
place. See [docs/BUILDING.md](docs/BUILDING.md) for the full procedure.
