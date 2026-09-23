# Build procedure

This is the step-by-step process for changing the game and shipping a new
Android build. It assumes you've cloned
https://github.com/masukundani-png/thebankjob and are working from the repo
root.

No local Android/Java toolchain is required for the normal workflow — the
APK is built by GitHub Actions on every push. You only need Python 3 (for
icons) and a way to serve static files (for local testing) on your machine.

## 1. Make the change

Edit [`www/index.html`](../www/index.html) directly — it's the entire game
(markup, CSS, and JavaScript in one file, split into clearly commented
sections: audio, level geometry, state, input, update, drawing, game loop).
See [ARCHITECTURE.md](ARCHITECTURE.md) for a map of how it's organized before
making a non-trivial change.

If your change touches anything else the app caches offline —
[`www/manifest.webmanifest`](../www/manifest.webmanifest) or the icons — edit
those too.

## 2. Bump the service worker version (if you touched a cached file)

[`www/sw.js`](../www/sw.js) caches `index.html`, the manifest, and the icons
for offline play. A returning player's browser/APK will keep serving the
**old cached copy** until the cache key changes. If you edited any of those
files, bump `VERSION` at the top of `sw.js`:

```js
const VERSION = 'tbj-v11';   // was tbj-v10 -- always increment this
```

If you forget this step, your change will still build fine, but players who
already have the app installed may not see it until they force-clear the
app's storage.

## 3. Test locally (no Android needed)

```bash
python -m http.server 8765
```

Then open `http://localhost:8765/www/index.html` in a browser. This is the
real game running exactly as it will in the APK's WebView — no build step,
no Capacitor, just the static files.

Before committing, at minimum run a syntax check on the script:

```bash
sed -n '/<script>/,/<\/script>/p' www/index.html | sed '1d;$d' > /tmp/check.js
node --check /tmp/check.js
```

For anything touching game logic (scoring, level generation, state
transitions), prefer writing a small headless Node test over eyeballing it —
see [ARCHITECTURE.md § Testing approach](ARCHITECTURE.md#testing-approach)
for the pattern used throughout this project's history (stub out `document`/
`window`/`localStorage`, `eval()` the extracted script, call the internal
functions directly). This project has no formal test suite or CI test step —
every change so far has been verified this way by hand before pushing.

## 4. Regenerate icons / splash screen (only if you changed them)

The icons and the launch splash screen are generated code, not hand-edited
image files — see [`make_icons.py`](../make_icons.py). To change either,
edit the pixel-drawing logic in that file (a small procedural pixel-art
renderer, no image libraries; the robot is drawn once in `robot_px()` and
shared by the icons and the splash), then from the repo root:

```bash
python make_icons.py
```

This writes `www/icon-192.png`, `www/icon-512.png`, `www/icon-maskable-512.png`
(the PWA/manifest icons), `assets/icon-only.png` (the source image the CI
build feeds to `@capacitor/assets` to generate the native Android launcher
icon set), and `assets/splash.png` + `assets/splash-dark.png` (the source
for the Android launch splash screen — the robot and a "BANK JOB" wordmark
on the app's dark background). Regenerating rewrites all of them, even for a
small change. Keep the splash artwork inside the central ~1200px of its
2732×2732 canvas: `@capacitor/assets` crops the edges for tall/wide phones.

If you change the splash background colour, change it in three places:
`SPLASH_BG` in `make_icons.py`, `backgroundColor` under
`plugins.SplashScreen` in `capacitor.config.json`, and the
`--splashBackgroundColor` flags in the workflow.

## 5. Commit and push to `main`

```bash
git add -A
git commit -m "Describe what changed and why"
git push
```

A push to `main` is what triggers the build — there's no separate "release"
step to remember.

## 6. Let CI build the APK

[`.github/workflows/build-apk.yml`](../.github/workflows/build-apk.yml) runs
automatically on every push to `main`. It:

1. Checks out the repo, sets up Node 22 and Java 21 (Temurin).
2. `npm install` — installs the Capacitor dependencies from `package.json`.
3. `npx cap add android` — generates the native Android project fresh (it's
   not committed; see `.gitignore`).
4. `npx @capacitor/assets generate` — builds the full Android launcher icon
   set from `assets/icon-only.png` and the launch splash screens from
   `assets/splash.png`.
5. `npx cap sync android` — copies `www/` into the native project.
6. `./gradlew assembleDebug` — builds `app-debug.apk`.
7. Uploads it as a workflow artifact named **`the-bank-job-apk`**.

Takes about 2–5 minutes. Watch it at
https://github.com/masukundani-png/thebankjob/actions.

## 7. Download and install

1. Open the newest **successful** run (green check) on the Actions tab —
   don't grab an old run's artifact by mistake, each push makes a new one.
2. Scroll to **Artifacts**, download `the-bank-job-apk`, unzip it to get
   `app-debug.apk`.
3. **Uninstall any previously installed copy of the app on the test device
   first**, then sideload the new APK. Installing directly over an existing
   copy very often leaves Android's launcher showing the *old* cached icon
   even though the app itself updated correctly — this has bitten this
   project before and is an OS/launcher quirk, not a build bug. A full
   uninstall-then-install, or a device reboot after installing, clears it.

## Known limitations of this pipeline

- **Debug build only.** `assembleDebug` produces an unsigned debug APK,
  fine for installing on your own device but not what the Play Store
  accepts. A store release needs: a signing keystore (kept as a GitHub
  Actions secret, never committed), a `assembleRelease` step, and Play
  Console setup. None of that exists yet.
- **No automated tests run in CI.** Verification today is manual — run the
  headless Node checks described above and/or play-test locally before
  pushing. If this project grows, adding a CI test step (even just the
  `node --check` syntax gate) would be a reasonable next investment.
- **`android/` is regenerated from scratch every run**, not incrementally
  built. This makes builds slower than they need to be but avoids any drift
  between the committed config and the generated native project. Don't
  "optimize" this without a reason — it's deliberate.
