# Business Requirements Document — Bank Job

| | |
|---|---|
| **Product** | Bank Job (Android app / installable web app) |
| **App ID** | `com.thebankjob.game` |
| **Repo** | https://github.com/masukundani-png/thebankjob |
| **Status** | Living document — reflects what's built as of `CHANGELOG.md`'s latest entry. Update it alongside the product, not after the fact. |
| **Document owner** | Product owner (you) |
| **Prepared by** | Development (this session's assistant), from the requirements given in conversation |

This document was drafted retrospectively, from a sequence of feature
requests rather than an upfront spec. Section 8 (Functional Requirements)
is written as a checklist of what's actually implemented and verified,
which doubles as an acceptance record. Anything not yet built is marked
explicitly in Section 11.

## 1. Executive summary

Bank Job is a Donkey Kong-style arcade climbing game with a crypto-vs-fiat
satirical theme: a robot climbs a tower collecting crypto coins while
dodging rolling fiat-currency boulders thrown by a caricatured government
building, fighting toward a "FREEDOM" portal at the top of each level. It
ships as an installable web app (PWA) and as a sideloadable Android APK,
built from one shared codebase with no paid game engine, art assets, or
licensed audio.

## 2. Business objectives

1. Ship a free-to-play mobile arcade game with broad, immediate
   replayability (endless levels, daily challenge, a persistent high
   score) rather than a fixed-length experience.
2. Build a monetization path that does not compromise the core game feel —
   no forced interstitials, no pay-to-win. Ads are optional and
   opt-in; cosmetics are the only thing money-adjacent currency buys.
3. Keep the build pipeline simple enough for a non-team, low-overhead
   operation to maintain: no dedicated build machine, no manual signing
   ceremony for test builds, reproducible from a fresh clone.
4. Establish a visual and tonal identity (the crypto/government satire,
   the heist framing, "Bank Job" naming) consistently across the game,
   the app icon, and the store-facing copy.

## 3. Background

The project started as a single-session request for "a Donkey Kong-like
game" and grew, request by request, into its current scope. There was no
upfront market analysis or competitive study commissioned — this BRD
formalizes what emerged from iterative, conversational requirements
gathering. If this product moves toward a public store release, a proper
market/competitive review is recommended before that step (see §11).

## 4. Scope

### In scope (built)

- Core arcade gameplay loop (climb, collect, dodge, escape).
- Endless level progression with procedurally generated content.
- A scoring system with a skill-expression mechanic (combo multiplier).
- A boss encounter cadence.
- A cosmetic customization system with its own in-game currency.
- Player identity (bot naming).
- Offline play (PWA) and a native Android package.
- A monetization scaffold (banner placement + two optional rewarded-ad
  moments), not yet connected to a live ad network.

### Out of scope (not built, not currently planned unless requested)

- iOS.
- A signed, store-ready release build (current APK output is debug-only).
- Real advertising SDK integration (AdMob or equivalent) — see §11.
- Real in-app purchases / billing integration.
- A backend, user accounts, or any server-side component — all state is
  local to the device (`localStorage`), nothing syncs across devices.
- Multiplayer or social/leaderboard features beyond the local high score
  and the (locally-scoped) daily-challenge best score.
- Localization — all copy is English only.
- Accessibility audit (screen reader support, colorblind-safe palette
  review, etc. have not been evaluated).

## 5. Stakeholders

| Role | Who |
|---|---|
| Product owner / decision-maker | You |
| Development | This session's assistant, working from your direct requests |
| End users | Installed-app players (Android sideload) and PWA players |

There is currently no QA function separate from development — verification
has been done by the developer via headless scripted tests and manual
play, described in `ARCHITECTURE.md § Testing approach`. There is no
dedicated design or audio function — all art and sound are produced
procedurally by the developer as part of implementation.

## 6. Target audience

Casual mobile/web arcade players who enjoy short, replayable, skill-based
sessions (the Donkey Kong/endless-runner audience), with a secondary appeal
to players who find the crypto/regulation satire funny or relatable. No
formal audience research has been conducted; this is an assumption, not a
validated persona.

## 7. Success metrics

No analytics are currently instrumented — there is no way today to measure
any of the below from the app itself. Recommended before treating these as
real KPIs:

- **Engagement**: session length, sessions per day (would require adding
  an analytics SDK — not present today).
- **Retention**: Daily Challenge is specifically designed to give a reason
  to return; day-over-day return rate would validate that, but again isn't
  measured yet.
- **Monetization** (once real ads/IAP are integrated): rewarded-ad opt-in
  rate, ad-free conversion rate.

Until analytics exist, success is being judged qualitatively — does a
requested feature work as intended, verified by the tests described in
`ARCHITECTURE.md`.

## 8. Functional requirements

Each item reflects a requirement that was requested and implemented.
Referenced commit is the one that introduced it (see `CHANGELOG.md` for
full context).

### 8.1 Core gameplay
- [x] Robot character climbs platforms via ladders, jumps hazards.
- [x] Crypto coins (BTC/ETH/SOL/DOGE) are the primary collectible/score
      source.
- [x] Fiat-currency (USD/EUR/ZAR) rolling boulders are the primary hazard,
      rendered as solid rock-textured spheres.
- [x] A "self-custody" temporary shield (from a KEY pickup) lets the
      player destroy hazards instead of avoiding them, for a larger score
      reward.
- [x] A FREEDOM portal at the top of each level is the level-completion
      condition.

### 8.2 Progression
- [x] Levels 1–5: hand-built, each introducing exactly one new mechanic.
- [x] Level 6+: endless, procedurally generated — theme, hazard mix, *and*
      the platform layout itself (`genLayout()`), seeded so a given level
      number always generates the same layout.
- [x] Every 5th level is a boss level: portal locked behind 3 keys plus a
      defeatable government boss.
- [x] Daily Challenge: a date-seeded endless run with its own separate
      best score, independent of the main high score.
- [x] Furthest level reached and high score both persist locally and are
      selectable/resumable from the title screen.

### 8.3 Scoring
- [x] A combo multiplier (x1 → x3) rewards chaining successful actions
      (coin/key/hazard-play) without taking a hit; resets on a hit.
- [x] Level-clear skill bonuses: Perfect Level (no hits + full coin
      collection), Key Master (all keys collected), Speed Bonus (time-based,
      decaying), 10-level Milestone.
- [x] A full reward breakdown is shown on the level-clear screen rather
      than a flat total.

### 8.4 Customization
- [x] A cosmetic-only shop ("GARAGE"), accessible from the title screen or
      from the pause menu without losing an in-progress run.
- [x] Its own currency (a lifetime coin wallet), separate from and not
      inflated by the combo-multiplied score.
- [x] Four cosmetic categories: robot skin, trail effect, boulder skin,
      coin skin. Confirmed requirement: **cosmetic only, must never affect
      difficulty or scoring** (see `ARCHITECTURE.md`).
- [x] Player-chosen bot name, shown on the title, garage, and game-over
      screens.

### 8.5 App shell / platform
- [x] Installable as an offline-capable PWA (manifest + service worker).
- [x] Packaged as a sideloadable Android APK via Capacitor, built
      automatically by CI on every push.
- [x] Touch controls (on-screen d-pad + jump) in addition to keyboard.
- [x] Pause (freezes all game logic) and a full mute (audio + haptics)
      toggle, both reachable via keyboard and touch.
- [x] All audio synthesized in-browser (Web Audio API) — no licensed or
      external audio assets, avoiding audio licensing risk entirely.

### 8.6 Monetization (scaffold — not connected to a real ad network)
- [x] A persistent ad banner, rendered outside the canvas so it can never
      cover gameplay.
- [x] One optional rewarded-ad revive per run (only offered after all
      lives are lost — never a forced interstitial on an ordinary death).
- [x] One optional rewarded-ad score-double per level clear.
- [x] An `adFree` flag that hides the banner (no purchase flow implemented
      behind it — see §11).
- [ ] **Not implemented**: an actual ad SDK. Both rewarded flows currently
      run a simulated timer in place of a real ad. See `ARCHITECTURE.md §
      Ads stub`.

## 9. Non-functional requirements

- **Performance**: fixed-timestep 60fps game loop; must remain playable on
  mid-range Android hardware inside a Capacitor WebView.
- **Offline**: the PWA must be fully playable with no network connection
  after first load (service worker cache-first strategy).
- **No paid dependencies**: no licensed game engine, no purchased art or
  audio assets, no paid font — everything is generated procedurally or
  drawn with Canvas primitives, by design, to keep the project's cost
  structure at zero beyond developer time.
- **Build reproducibility**: a fresh clone of the repo must be able to
  produce an identical APK via the documented CI pipeline with no manual
  environment setup beyond what's declared in the workflow file.

## 10. Assumptions & constraints

- Single-developer, conversational-request workflow — there is no product
  spec written in advance of a feature; this BRD is retrospective and
  should be kept current going forward rather than treated as fixed.
- No dedicated design, QA, or audio resource — the developer performs all
  of these functions.
- No budget assumed for paid services (ad networks, analytics, app store
  fees) — anything requiring one is flagged as future scope, not silently
  built around a placeholder that could be mistaken for the real thing.
- Distribution today is sideloading only; no Play Store listing exists.

## 11. Open items / future scope

These are known gaps, not committed roadmap items — bring any of them back
as a new request when you want them prioritized:

1. **Real ad SDK integration** (e.g. AdMob's Capacitor plugin) — required
   before real ad revenue is possible. Needs an ad network account and ad
   unit IDs, which only you can create.
2. **Real in-app purchase / billing** for the ad-free pass — needs Google
   Play Billing (and, if ever built for iOS, StoreKit) integration, which
   is tied to a Play Console developer account.
3. **Signed release build** for a Play Store submission — needs a signing
   keystore managed as a CI secret, plus a Play Console listing (store
   copy, screenshots, content rating, privacy policy).
4. **Analytics** — nothing is instrumented today; §7's metrics can't
   actually be measured until this exists.
5. **iOS build** — not attempted; would need a Mac-based build environment
   (Capacitor supports it, but the current CI pipeline is Android-only).
6. **A change-request template/log**, if you want new feature asks to
   follow a consistent written format before development starts — happy
   to add one alongside this BRD if useful.

## 12. Sign-off

| | Name | Date | Notes |
|---|---|---|---|
| Product owner approval | | | |

*(This document was authored by development from conversational
requirements. Formal sign-off is a placeholder for you to complete or
discard, per however formal you want the process going forward.)*
