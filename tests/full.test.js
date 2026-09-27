'use strict';
// Full verification for Bank Job. Runs the REAL www/index.html inside an isolated vm sandbox (no browser needed),
// then statically checks the assets, configs and docs. Run from anywhere:  node apk/tests/full.test.js
const fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

// ---------- tiny test runner ----------
let pass = 0, fail = 0; const failures = []; let sec = '', secPass = 0, secFail = 0; const summary = [];
function section(name) { if (sec) summary.push([sec, secPass, secFail]); sec = name; secPass = secFail = 0; }
function check(name, cond, detail = '') {
  if (cond) { pass++; secPass++; } else { fail++; secFail++; failures.push(`[${sec}] ${name}${detail ? ' -- ' + detail : ''}`); }
}

// ---------- sandbox factory: a fresh, isolated game per call ----------
const html = read('www/index.html');
const parts = html.split('<script>');
const SCRIPT = parts[1].split('</script>')[0];
const LETS = ['state', 'level', 'lives', 'score', 'hi', 'maxLvl', 'banner', 'drones', 'ice', 'dSpawn', 'P', 'barrels', 'coins', 'key',
  'particles', 'floaters', 'tick', 'spawnT', 'stateT', 'govThrow', 'combo', 'boss', 'levelStats', 'clearSummary', 'isDaily',
  'revivesUsed', 'doubleClaimed', 'shopReturn', 'coinBank', 'owned', 'equipped', 'botName', 'muted', 'cfg', 'plats', 'ladders',
  'GOV', 'EXIT', 'shake'];
const FUNCS = ['update', 'draw', 'startLevel', 'onPress', 'enterClear', 'finishClear', 'endGame', 'die', 'award', 'comboMult', 'genLayout',
  'getCfg', 'dailySeed', 'todayStr', 'shopTap', 'shopLayout', 'renameBot', 'toggleMute', 'beep', 'heistSting', 'buzz', 'wrapText', 'surf',
  'inP', 'landing', 'clearLines', 'clearChoiceLayout', 'spawnBarrel', 'shopItem', 'isOwned'];
const CONSTS = ['FACTS', 'SHOP', 'LEVELS', 'FIXED_PLATS', 'FIXED_LADDERS', 'FIXED_EXIT', 'FIXED_GOV', 'FIXED_KEYS', 'FIXED_COIN_SPOTS',
  'LAYOUT_Y', 'COMBO_TIERS', 'FIAT', 'CRYPTO', 'Ads', 'W', 'H'];
const EXPOSE = `;globalThis.G = {};` +
  LETS.map(n => `Object.defineProperty(G,'${n}',{get:()=>${n},set:v=>{${n}=v},enumerable:true});`).join('') +
  FUNCS.map(n => `G.${n}=${n};`).join('') + CONSTS.map(n => `G.${n}=${n};`).join('');

class FakeAC {
  constructor() { this.sampleRate = 44100; this.currentTime = 0; this.destination = {}; this.state = 'running'; }
  createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { this.audio.nodes++; return { connect() {}, start() {}, stop() {} }; }
  createBiquadFilter() { return { frequency: {}, Q: {}, connect() {} }; }
  createGain() { return { gain: { linearRampToValueAtTime() {} }, connect() {} }; }
  createOscillator() { this.audio.nodes++; return { frequency: { linearRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
  resume() {}
}

function boot(opts = {}) {
  const store = opts.store || {}, texts = [], rich = [], winL = {}, cvL = {}, audio = { nodes: 0 }, vib = { n: 0 }, promptBox = { v: opts.prompt };
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return s => ({ width: String(s).length * 6.2 });
      if (k === 'fillText') return (s, x, y) => {
        texts.push(String(s));
        const m = String(t.font || '').match(/(\d+(?:\.\d+)?)px/);
        rich.push({ s: String(s), x, y, size: m ? parseFloat(m[1]) : 0 });   // where and how big each string was drawn
      };
      if (k in t) return t[k];
      return () => ({ addColorStop() {} });
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const canvas = { getContext: () => ctx, addEventListener: (n, f) => { cvL[n] = f; }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 720 }) };
  class AC extends FakeAC { constructor() { super(); this.audio = audio; } }
  const sandbox = {
    document: { getElementById: id => id === 'c' ? canvas : { classList: { add() {}, remove() {} } }, querySelectorAll: () => [],
      addEventListener() {}, createElement: () => ({ getContext: () => ctx }) },
    window: { addEventListener: (n, f) => { winL[n] = f; }, focus() {}, devicePixelRatio: 1, AudioContext: AC },
    addEventListener() {}, navigator: { vibrate: () => { vib.n++; } }, location: { protocol: 'file:' }, performance: { now: () => 0 },
    requestAnimationFrame() {}, matchMedia: () => ({ matches: !!opts.touch }), setTimeout() {}, console,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    prompt: () => promptBox.v,
  };
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT + EXPOSE, sandbox, { filename: 'index.html<script>' });
  const G = sandbox.G, ev = k => ({ key: k, code: k === ' ' ? 'Space' : k, preventDefault() {} });
  return Object.assign(G, {
    store, audio, vib, promptBox,
    text: () => texts.slice(), textRich: () => rich.slice(), resetText: () => { texts.length = 0; rich.length = 0; },
    run(n, drawEvery = 0) { for (let i = 0; i < n; i++) { G.update(); if (drawEvery && i % drawEvery === 0) G.draw(); } },
    hold: k => winL.keydown(ev(k)), release: k => winL.keyup(ev(k)),
    tap: (x, y) => cvL.pointerdown({ clientX: x, clientY: y }),
    start() { G.onPress('Enter'); return G; },
    // put the player on the ground platform, safe from nothing -- caller decides invulnerability
    invulnerable() { G.P.inv = 100000; },
    // walk into the portal with everything needed to open it
    finishLevelViaPortal() {
      if (G.boss) G.boss.dead = true;
      G.key.forEach(k => { if (!k.got) { k.got = true; G.levelStats.keysGot++; } });
      G.P.x = G.EXIT.x + G.EXIT.w / 2; G.P.y = 150; G.P.ground = true; G.P.climb = null;
      G.update();
    },
  });
}

const near = (a, b, t = 1) => Math.abs(a - b) <= t;

// =====================================================================================================
section('1. Boot & title screen');
{
  const g = boot();
  check('game boots to the title screen', g.state === 'title');
  check('default bot name is UNIT-7', g.botName === 'UNIT-7');
  check('not muted by default', g.muted === false);
  check('starts on level 1 with 3 lives', g.level === 1 && g.lives === 3);
  g.draw();
  const t = g.text();
  check('title shows the BANK JOB logo', t.includes('BANK JOB'));
  check('title shows the bot name', t.includes('UNIT-7'));
  check('title offers a daily challenge and the garage', t.some(s => /daily challenge/i.test(s)) && t.some(s => /garage/i.test(s)));
  check('script tag count is exactly one', parts.length === 2);
}

// =====================================================================================================
section('2. Fixed layout (levels 1-5) is unchanged');
{
  const g = boot();
  check('6 platforms', g.FIXED_PLATS.length === 6);
  check('original ladder x positions', JSON.stringify(g.FIXED_LADDERS.map(l => l.x)) === JSON.stringify([120, 520, 140, 500, 300]));
  check('original portal x=340, government x=12', g.FIXED_EXIT.x === 340 && g.FIXED_GOV.x === 12);
  check('16 hand-placed coins', g.FIXED_COIN_SPOTS.length === 16);
  for (let L = 1; L <= 5; L++) {
    g.level = L; g.startLevel();
    check(`level ${L} uses the fixed layout`, g.plats === g.FIXED_PLATS && g.ladders === g.FIXED_LADDERS && g.EXIT === g.FIXED_EXIT);
    check(`level ${L} has 16 coins`, g.coins.length === 16);
    check(`level ${L} key count is ${L === 5 ? 3 : 1}`, g.key.length === (L === 5 ? 3 : 1));
  }
  const feat = L => { const c = g.getCfg(L); return [!!c.fire, !!c.drones, !!c.ice, !!c.boss]; };
  check('level 1: no extras', JSON.stringify(feat(1)) === '[false,false,false,false]');
  check('level 2: fireballs', JSON.stringify(feat(2)) === '[true,false,false,false]');
  check('level 3: + drones', JSON.stringify(feat(3)) === '[true,true,false,false]');
  check('level 4: + ice', JSON.stringify(feat(4)) === '[true,true,true,false]');
  check('level 5: + boss', JSON.stringify(feat(5)) === '[true,true,true,true]');
}

// =====================================================================================================
section('3. Procedural layouts (level 6+)');
{
  const g = boot();
  const bad = [];
  let distinct = new Set();
  for (let seed = 6; seed <= 600; seed++) {
    const L = g.genLayout(seed);
    distinct.add(JSON.stringify(L.plats[2]));
    L.ladders.forEach((lad, i) => {
      const lo = L.plats[i], hi = L.plats[i + 1];
      if (lad.x < lo.x1 || lad.x > lo.x2 || lad.x < hi.x1 || lad.x > hi.x2) bad.push(`seed ${seed}: ladder ${i} unreachable`);
      if (!(lad.top < lad.bot)) bad.push(`seed ${seed}: ladder ${i} top not above bottom`);
    });
    const top = L.plats[5];
    if (top.x1 !== 0) bad.push(`seed ${seed}: top platform doesn't start at 0`);
    if (top.x2 < 340) bad.push(`seed ${seed}: top platform too short (${top.x2})`);
    if (L.EXIT.x < L.GOV.x + L.GOV.w || L.EXIT.x + L.EXIT.w > top.x2) bad.push(`seed ${seed}: portal overlaps government or overhangs`);
    L.coinSpots.forEach(([pi, x], i) => { const p = L.plats[pi]; if (x < p.x1 || x > p.x2) bad.push(`seed ${seed}: coin ${i} off its platform`); });
    L.keys.forEach(([x, pi], i) => { const p = L.plats[pi]; if (x < p.x1 || x > p.x2) bad.push(`seed ${seed}: key ${i} off its platform`); });
    L.plats.forEach((p, i) => {
      const y = Math.max(p.yl, p.yr);
      if (y !== g.LAYOUT_Y[i]) bad.push(`seed ${seed}: platform ${i} height ${y} != ${g.LAYOUT_Y[i]}`);
      if (i >= 1 && ((i % 2 === 1) !== (p.yr > p.yl))) bad.push(`seed ${seed}: platform ${i} slopes the wrong way for the zig-zag`);
      if (p.x2 - p.x1 < 300) bad.push(`seed ${seed}: platform ${i} too narrow`);
    });
    if (L.coinSpots.length !== 16) bad.push(`seed ${seed}: expected 16 coins, got ${L.coinSpots.length}`);
  }
  check('595 generated layouts are structurally valid', bad.length === 0, bad.slice(0, 5).join(' | ') + (bad.length > 5 ? ` (+${bad.length - 5} more)` : ''));
  check('layout heights match the fixed vertical rhythm', JSON.stringify(g.LAYOUT_Y) === '[690,580,500,370,290,150]');
  check('layouts actually vary between levels', distinct.size > 100, `only ${distinct.size} distinct`);
  check('same seed gives the same layout (deterministic)', JSON.stringify(g.genLayout(77)) === JSON.stringify(g.genLayout(77)));
  check('different seeds give different layouts', JSON.stringify(g.genLayout(77)) !== JSON.stringify(g.genLayout(78)));
  g.level = 6; g.startLevel();
  check('level 6 uses a generated layout', g.plats !== g.FIXED_PLATS && g.plats.length === 6);
  check('generated levels have 16 coins (2 + 3x4 + 2)', g.coins.length === 16);
  g.level = 3; g.startLevel();
  check('going back to level 3 restores the fixed layout', g.plats === g.FIXED_PLATS);
  // ice zones are clamped to the platform they sit on
  let iceBad = 0;
  for (let L = 6; L <= 120; L++) { g.level = L; g.startLevel(); g.ice.forEach(z => { const p = g.plats[z.p]; if (z.x1 < p.x1 || z.x2 > p.x2 || z.x2 - z.x1 <= 40) iceBad++; }); }
  check('ice patches never extend past their platform (levels 6-120)', iceBad === 0, `${iceBad} bad zones`);
  // boss cadence for generated levels
  let bossOk = true;
  for (let L = 6; L <= 100; L++) { const c = g.getCfg(L); if (!!c.boss !== (L % 5 === 0) || !!c.lock !== !!c.boss) bossOk = false; }
  check('boss + key lock exactly on every 5th level', bossOk);
  check('generated levels use every hazard type', (c => c.fire && c.drones)(g.getCfg(7)));
}

// =====================================================================================================
section('4. Movement, jumping, ladders, ice, pause');
{
  const g = boot().start();
  check('Enter starts level 1', g.state === 'play' && g.level === 1);
  check('robot spawns standing on the ground', g.P.ground === true && near(g.P.y, g.surf(g.plats[0], g.P.x), 2));
  g.invulnerable();
  let x0 = g.P.x; g.hold('ArrowRight'); g.run(30); g.release('ArrowRight');
  check('holding right moves the robot right', g.P.x > x0 + 60, `${x0} -> ${g.P.x}`);
  x0 = g.P.x; g.hold('ArrowLeft'); g.run(20); g.release('ArrowLeft');
  check('holding left moves it left', g.P.x < x0 - 40);
  const gy = g.P.y; g.onPress(' ');
  check('space makes the robot jump', g.P.vy < 0 && g.P.ground === false);
  g.run(8); check('robot rises while jumping', g.P.y < gy - 30);
  g.run(80); check('robot lands again', g.P.ground === true && near(g.P.y, g.surf(g.plats[0], g.P.x), 3));
  g.P.ground = false; g.P.vy = 3; g.onPress(' ');
  check('cannot double-jump in mid-air', g.P.vy === 3);
  // ladder climb, ground -> platform 1
  const lad = g.ladders[0];
  g.P.x = lad.x; g.P.y = g.surf(g.plats[0], lad.x); g.P.ground = true; g.P.vy = 0;
  g.hold('ArrowUp'); g.run(10);
  check('holding up next to a ladder starts climbing', g.P.climb !== null);
  const y1 = g.P.y; g.run(10); check('climbing moves the robot up', g.P.y < y1);
  g.run(160); g.release('ArrowUp');
  check('robot reaches the top of the ladder and stands on platform 1', g.P.climb === null && g.P.ground && near(g.P.y, g.surf(g.plats[1], g.P.x), 3), `y=${g.P.y} climb=${!!g.P.climb}`);
  // climbing down again
  g.hold('ArrowDown'); g.run(200); g.release('ArrowDown');
  check('holding down climbs back down to the ground platform', g.P.ground && near(g.P.y, g.surf(g.plats[0], g.P.x), 3), `y=${g.P.y}`);
  // walk off a platform edge and fall
  g.P.x = g.plats[1].x2 - 4; g.P.y = g.surf(g.plats[1], g.P.x); g.P.ground = true;
  g.hold('ArrowRight'); g.run(6); g.release('ArrowRight');
  check('walking off a platform edge starts a fall', g.P.ground === false && g.P.vy > 0);
  g.run(120); check('the fall ends on a lower platform', g.P.ground && g.P.y > 600);
  // pause
  g.onPress('p'); check('P pauses', g.state === 'paused');
  const t = g.tick; g.run(60); check('nothing advances while paused (tick frozen)', g.tick === t);
  g.onPress('Escape'); check('Esc resumes', g.state === 'play');
  g.run(1); check('the game clock runs again after resuming', g.tick === t + 1);
  // ice: slippery only on frozen patches
  const g4 = boot().start(); g4.level = 4; g4.startLevel(); g4.invulnerable();
  g4.P.x = 210; g4.P.y = g4.surf(g4.plats[1], 210); g4.P.ground = true;
  g4.hold('ArrowRight'); g4.run(30); g4.release('ArrowRight'); g4.run(1);
  check('on ice the robot keeps sliding after you let go', g4.P.vx > 0.3, `vx=${g4.P.vx}`);
  const g1 = boot().start(); g1.invulnerable();
  g1.P.x = 300; g1.hold('ArrowRight'); g1.run(30); g1.release('ArrowRight'); g1.run(1);
  check('on normal ground it stops immediately', g1.P.vx === 0);
}

// =====================================================================================================
section('5. Scoring, combo, coins, wallet');
{
  const g = boot().start();
  g.invulnerable();
  const tiers = [[0, 1], [2, 1], [3, 1.25], [5, 1.25], [6, 1.5], [9, 1.5], [10, 2], [14, 2], [15, 2.5], [19, 2.5], [20, 3], [99, 3]];
  tiers.forEach(([c, m]) => { g.combo = c; check(`combo ${c} -> x${m}`, g.comboMult() === m); });
  g.combo = 0; g.score = 0;
  let p = g.award(100, 0, 0, '#fff'); check('first action is worth base points', p === 100 && g.combo === 1 && g.score === 100);
  g.combo = 6; g.levelStats.comboBonus = 0; p = g.award(100, 0, 0, '#fff');
  check('at combo 6 the same action pays x1.5', p === 150 && g.levelStats.comboBonus === 50);
  // real coin pickup
  const g2 = boot().start(); g2.invulnerable();
  const c = g2.coins[0]; const bank0 = g2.coinBank;
  g2.P.x = c.x; g2.P.y = c.y + 18; g2.update();
  check('touching a coin collects it', c.got === true && g2.levelStats.coinsGot === 1);
  check('a coin is worth 100 points', g2.score === 100);
  check('a coin adds exactly 1 to the shop wallet', g2.coinBank === bank0 + 1);
  check('the wallet is saved to storage', g2.store.tbj_bank === String(g2.coinBank));
  g2.update(); check('a coin cannot be collected twice', g2.coinBank === bank0 + 1);
  // wallet is independent of combo multiplier
  const g3 = boot().start(); g3.invulnerable(); g3.combo = 20;
  const c3 = g3.coins[1]; const b3 = g3.coinBank; g3.P.x = c3.x; g3.P.y = c3.y + 18; g3.update();
  check('at x3 combo the coin pays 300 points but still only 1 wallet coin', g3.score === 300 && g3.coinBank === b3 + 1);
  // death breaks combo
  const g4 = boot().start(); g4.combo = 12; g4.die();
  check('dying resets the combo and marks the level as not perfect', g4.combo === 0 && g4.levelStats.hitTaken === true && g4.state === 'dying');
  g4.run(89); check('the death animation lasts ~90 frames', g4.state === 'dying');
  g4.run(2); check('then the robot respawns with one life fewer', g4.state === 'play' && g4.lives === 2 && g4.P.x === 40);
}

// =====================================================================================================
section('6. Hazards: boulders, fireballs, drones, self-custody');
{
  const g = boot().start();
  g.run(110);
  check('the government throws a boulder within ~2 seconds', g.barrels.length >= 1);
  const mk = (gg, over = {}) => Object.assign({ x: gg.P.x, y: gg.P.y, vy: 0, dir: 1, fall: false, fire: false, p: 0, label: '', fiat: gg.FIAT[0], rot: 0, scored: false }, over);
  const a = boot().start(); a.barrels = []; a.spawnT = 99999; a.barrels.push(mk(a));
  a.update();
  check('touching a boulder kills the robot', a.state === 'dying');
  // shielded smash
  const b = boot().start(); b.barrels = []; b.spawnT = 99999; b.P.inv = 500; b.barrels.push(mk(b));
  b.update();
  check('with self-custody the boulder is destroyed instead', b.state === 'play' && b.barrels.length === 0);
  check('smashing a boulder scores +200', b.score === 200 && b.levelStats.hazardPts === 200);
  // hop bonus: airborne over a boulder
  const h = boot().start(); h.barrels = []; h.spawnT = 99999;
  const bx = h.P.x; const by = h.surf(h.plats[0], bx);
  h.barrels.push(mk(h, { x: bx, y: by, dir: -1 })); h.P.ground = false; h.P.vy = 0; h.P.y = by - 30; h.update();
  check('jumping over a boulder pays a +50 hop bonus (once)', h.score === 50 && h.state === 'play');
  h.update(); check('the hop bonus is not paid twice for the same boulder', h.score === 50);
  // fireball bounces
  const f = boot().start(); f.level = 2; f.startLevel(); f.invulnerable(); f.barrels = []; f.spawnT = 99999;
  f.spawnBarrel(true);
  let up = false, down = false, bounced = false;
  for (let i = 0; i < 260; i++) { f.update(); const fb = f.barrels[0]; if (!fb) break; if (fb.vy > 1) down = true; if (down && fb.vy < -3) bounced = true; if (fb.vy < -3) up = true; }
  check('a fireball actually bounces after landing', up && down && bounced);
  // drone
  const d = boot().start(); d.level = 3; d.startLevel(); d.spawnT = 99999; d.dSpawn = 99999; d.barrels = [];
  d.P.x = 300; d.P.y = d.surf(d.plats[1], 300); d.P.ground = true;
  d.drones.push({ pi: 1, x: 300, dir: 1, warn: 0, y: 0 }); d.update();
  check('touching an IRS drone kills the robot', d.state === 'dying');
  const d2 = boot().start(); d2.level = 3; d2.startLevel(); d2.spawnT = 99999; d2.dSpawn = 99999; d2.barrels = []; d2.P.inv = 500;
  d2.P.x = 300; d2.P.y = d2.surf(d2.plats[1], 300); d2.P.ground = true;
  d2.drones.push({ pi: 1, x: 300, dir: 1, warn: 0, y: 0 }); d2.update();
  // (a hand-placed coin sits at this spot too, so compare the hazard points rather than the total score)
  check('a shielded robot smashes a drone for +200', d2.state === 'play' && d2.levelStats.hazardPts === 200 && d2.drones.length === 0, 'score ' + d2.score);
  const w = boot().start(); w.level = 3; w.startLevel(); w.spawnT = 99999; w.dSpawn = 0; w.barrels = [];
  w.invulnerable(); w.run(3);
  check('drones give a warning before they fly in', w.drones.length === 1 && w.drones[0].warn > 0);
  // long soak: hazards never pile up, positions stay finite
  const s = boot().start(); s.lives = 999; let maxB = 0, nan = false;
  for (let i = 0; i < 4000; i++) { s.update(); if (s.state === 'reviveOffer' || s.state === 'over') s.onPress('Enter'); s.lives = 999; maxB = Math.max(maxB, s.barrels.length);
    if (!isFinite(s.P.x) || !isFinite(s.P.y) || s.barrels.some(x => !isFinite(x.x) || !isFinite(x.y))) nan = true; }
  check('boulders clear off-screen instead of piling up (max on screen)', maxB < 20, `max ${maxB}`);
  check('no NaN/Infinity positions over 4000 frames', !nan);
}

// =====================================================================================================
section('7. Keys, boss fight, portal gating');
{
  const g = boot().start(); g.level = 5; g.startLevel();
  check('level 5 has a 3-HP boss', g.boss && g.boss.hp === 3 && g.boss.maxHp === 3);
  check('level 5 has 3 keys', g.key.length === 3);
  g.spawnT = 99999; g.dSpawn = 99999; g.barrels = [];
  const atPortal = () => { g.P.x = g.EXIT.x + g.EXIT.w / 2; g.P.y = 150; g.P.ground = true; g.P.climb = null; g.P.inv = Math.max(g.P.inv, 1); g.update(); };
  atPortal(); check('portal is sealed with no keys and a live boss', g.state === 'play');
  g.key.forEach(k => { g.P.x = k.x; g.P.y = k.y + 24; g.P.ground = true; g.P.inv = 0; g.update(); });
  check('all 3 keys can be picked up', g.key.every(k => k.got) && g.levelStats.keysGot === 3);
  check('a key grants self-custody', g.P.inv > 0);
  atPortal(); check('portal is STILL sealed while the boss lives', g.state === 'play');
  // hit the boss three times
  const bx = g.GOV.x + g.GOV.w / 2; let s0 = g.score;
  for (let hit = 3; hit >= 1; hit--) {
    g.P.x = bx; g.P.y = g.surf(g.plats[5], bx); g.P.ground = true; g.P.inv = 5000; g.update();
    check(`boss hit -> ${hit - 1} HP left`, g.boss.hp === hit - 1 || (hit === 1 && g.boss.dead));
    g.run(51);
  }
  check('boss is defeated after 3 hits', g.boss.dead === true);
  check('defeating the boss pays +1000', g.score >= s0 + 1000 && g.levelStats.bossBonus === 1000);
  atPortal(); check('portal opens once keys + boss are done', g.state === 'clearChoice');
  // non-boss level: keys are optional
  const n = boot().start(); n.spawnT = 99999; n.barrels = [];
  n.P.x = n.EXIT.x + 30; n.P.y = 150; n.P.ground = true; n.update();
  check('on a normal level the portal opens without the key', n.state === 'clearChoice');
  // a shielded robot cannot damage the boss from the wrong place
  const w = boot().start(); w.level = 5; w.startLevel(); w.spawnT = 99999; w.dSpawn = 99999; w.barrels = [];
  w.P.x = 60; w.P.y = w.surf(w.plats[4], 60); w.P.ground = true; w.P.inv = 5000; w.update();
  check('standing under the boss (wrong platform) does no damage', w.boss.hp === 3);
  const w2 = boot().start(); w2.level = 5; w2.startLevel(); w2.spawnT = 99999; w2.dSpawn = 99999; w2.barrels = [];
  w2.P.x = 60; w2.P.y = w2.surf(w2.plats[5], 60); w2.P.ground = true; w2.P.inv = 0; w2.update();
  check('touching the boss without self-custody does no damage', w2.boss.hp === 3);
  // generated boss level
  const b10 = boot().start(); b10.level = 10; b10.startLevel();
  check('level 10 (generated) is a boss level with 3 keys inside its platforms',
    b10.boss && b10.key.length === 3 && b10.key.every((k, i) => { const p = b10.plats[[2, 3, 4][i]]; return k.x >= p.x1 && k.x <= p.x2; }));
}

// =====================================================================================================
section('8. Level clear: reward breakdown & bonuses');
{
  const run = (level, prep) => { const g = boot().start(); g.level = level; g.startLevel(); g.spawnT = 99999; g.dSpawn = 99999; g.barrels = []; g.invulnerable(); if (prep) prep(g); return g; };
  // perfect run: every coin + the key, fast
  const g = run(1, gg => {
    gg.coins.forEach(c => { gg.P.x = c.x; gg.P.y = c.y + 18; gg.P.ground = true; gg.update(); });
    gg.key.forEach(k => { gg.P.x = k.x; gg.P.y = k.y + 24; gg.update(); });
  });
  check('all 16 coins collected', g.levelStats.coinsGot === 16);
  const before = g.score;
  g.finishLevelViaPortal();
  const s = g.clearSummary;
  check('reaching the portal opens the clear/double choice', g.state === 'clearChoice' && !!s);
  check('portal bonus = 500 + 20 per coin', s.portalBase === 500 + 16 * 20);
  check('Perfect Level +500 (no hits, all coins)', s.perfectBonus === 500);
  check('Key Master +300', s.keyBonus === 300);
  check('Speed bonus is the max +250 for a fast clear', s.speedBonus === 250);
  check('no milestone on level 1', s.milestone === 0);
  const parts = s.cryptoPts + s.hazardPts + s.bossBonus + s.portalBase + s.perfectBonus + s.keyBonus + s.speedBonus + s.milestone;
  check('summary total equals the sum of its lines', s.total === parts);
  check('score rose by exactly the bonus lines added at the portal', g.score - before === s.portalBase + s.perfectBonus + s.keyBonus + s.speedBonus + s.milestone);
  check('crypto points reflect the combo multiplier (> 16 x 100)', s.cryptoPts > 1600, `${s.cryptoPts}`);
  // slow clear
  const slow = run(1, gg => { gg.tick += 60 * 70; });
  slow.finishLevelViaPortal(); check('a clear slower than 60s earns no speed bonus', slow.clearSummary.speedBonus === 0);
  const mid = run(1, gg => { gg.tick += 60 * 37; }); mid.finishLevelViaPortal();
  check('speed bonus decays smoothly in between', mid.clearSummary.speedBonus > 0 && mid.clearSummary.speedBonus < 250, `${mid.clearSummary.speedBonus}`);
  // hit taken -> no perfect
  const hit = run(1, gg => { gg.levelStats.hitTaken = true; gg.coins.forEach(c => { c.got = true; }); gg.levelStats.coinsGot = 16; });
  hit.finishLevelViaPortal(); check('taking a hit forfeits Perfect Level', hit.clearSummary.perfectBonus === 0);
  // missing coins -> no perfect
  const some = run(1); some.finishLevelViaPortal(); check('an incomplete coin run has no Perfect Level', some.clearSummary.perfectBonus === 0);
  // milestone
  const m = run(10); m.finishLevelViaPortal(); check('level 10 pays the +2500 milestone', m.clearSummary.milestone === 2500 && m.state === 'clearChoice');
  const m20 = run(20); m20.finishLevelViaPortal(); check('level 20 pays the milestone too', m20.clearSummary.milestone === 2500);
  const m5 = run(5); m5.finishLevelViaPortal(); check('level 5 (boss, not a 10) has no milestone', m5.clearSummary.milestone === 0);
  // claim vs double
  const c1 = run(2); c1.finishLevelViaPortal(); const tot = c1.clearSummary.total, sc = c1.score;
  c1.onPress('Enter');
  check('plain claim keeps the total and moves on', c1.state === 'clear' && c1.clearSummary.total === tot && c1.score === sc && !c1.clearSummary.doubled);
  const c2 = run(2); c2.finishLevelViaPortal(); const tot2 = c2.clearSummary.total, sc2 = c2.score;
  c2.onPress('w'); check('choosing the ad enters the (simulated) ad screen', c2.state === 'clearAd');
  c2.run(91);
  check('after the ad the reward is doubled', c2.state === 'clear' && c2.clearSummary.total === tot2 * 2 && c2.clearSummary.doubled === true);
  check('the doubling adds the extra points to the score exactly once', c2.score === sc2 + tot2);
  c2.finishClear(); check('finishClear cannot double twice', c2.clearSummary.total === tot2 * 2 && c2.score === sc2 + tot2);
  // advancing to the next level
  const nx = run(2); nx.finishLevelViaPortal(); nx.onPress('Enter'); nx.run(171);
  check('the clear screen advances to the next level automatically', nx.level === 3 && nx.state === 'play');
  check('the next level starts fresh (combo 0, keys reset)', nx.combo === 0 && nx.key.every(k => !k.got) && nx.levelStats.coinsGot === 0);
  // furthest level saved
  check('reaching a new level saves the furthest level', nx.store.cbc_max === '3' && nx.maxLvl === 3);
}

// =====================================================================================================
section('9. Crypto facts (every 3rd level)');
{
  const g0 = boot();
  check('there is a healthy bank of facts', g0.FACTS.length >= 20);
  check('every fact is a non-empty string', g0.FACTS.every(f => typeof f === 'string' && f.length > 20));
  check('no duplicate facts', new Set(g0.FACTS).size === g0.FACTS.length);
  check('facts are short enough to fit the card (<=3 wrapped lines)', g0.FACTS.every(f => g0.wrapText(f, 400, 11).length <= 3));
  const bad = [];
  for (let L = 1; L <= 30; L++) {
    const g = boot().start(); g.level = L; g.startLevel(); g.spawnT = 99999; g.dSpawn = 99999; g.barrels = []; g.invulnerable();
    g.finishLevelViaPortal(); g.onPress('Enter');
    const has = !!g.clearSummary.fact, want = L % 3 === 0;
    if (has !== want) bad.push(`L${L}: fact=${has} want=${want}`);
    if (has && !g.FACTS.includes(g.clearSummary.fact)) bad.push(`L${L}: fact not from the bank`);
    if ((g.stateT > 170) !== want && g.state === 'clear' && (g.stateT !== (want ? 260 : 170))) bad.push(`L${L}: wrong display time ${g.stateT}`);
    g.resetText(); g.draw(); const t = g.text();
    if (t.includes('DID YOU KNOW?') !== want) bad.push(`L${L}: DID YOU KNOW? text ${t.includes('DID YOU KNOW?')} want ${want}`);
    if (!t.some(s => /CLEARED/.test(s))) bad.push(`L${L}: clear screen missing`);
  }
  check('a fact appears on exactly levels 3,6,9,... (1-30) and is drawn', bad.length === 0, bad.slice(0, 4).join(' | '));
  const seen = new Set();
  for (let i = 0; i < 400; i++) { const g = boot().start(); g.level = 3; g.startLevel(); g.spawnT = 99999; g.invulnerable(); g.finishLevelViaPortal(); seen.add(g.clearSummary.fact); }
  check('facts are actually random (many different ones over 400 clears)', seen.size >= Math.min(g0.FACTS.length, 20), `${seen.size} distinct`);
}

// =====================================================================================================
section('10. Lives, revive ad, game over, high scores');
{
  const g = boot().start(); g.spawnT = 99999; g.barrels = [];
  for (let i = 0; i < 2; i++) { g.die(); g.run(91); }
  check('two deaths leave 1 life and the game continues', g.lives === 1 && g.state === 'play');
  g.die(); g.run(91);
  check('losing the last life offers the (optional) revive ad', g.state === 'reviveOffer' && g.lives === 0);
  g.onPress('w'); check('choosing the ad plays it', g.state === 'reviveAd');
  g.run(91); check('after the ad: back in play with 1 life, revive used', g.state === 'play' && g.lives === 1 && g.revivesUsed === 1);
  g.die(); g.run(91);
  check('the SECOND time all lives are lost there is no second revive offer', g.state === 'over');
  // declining
  const d = boot().start(); d.lives = 1; d.die(); d.run(91); d.onPress('Enter');
  check('declining the revive ends the run', d.state === 'over');
  // ad-free skips it entirely
  const a = boot().start(); a.Ads.adFree = true; a.lives = 1; a.die(); a.run(91);
  check('with adFree set there is never a revive prompt', a.state === 'over');
  // over -> new run
  a.onPress('Enter'); check('Enter after game over starts a fresh run (3 lives, score 0)', a.state === 'play' && a.lives === 3 && a.score === 0 && a.revivesUsed === 0);
  // high score
  const h = boot({ store: { cbc_hi: '500' } }); h.start(); h.score = 1234; h.endGame();
  check('a new high score is saved', h.hi === 1234 && h.store.cbc_hi === '1234');
  const h2 = boot({ store: { cbc_hi: '5000' } }); h2.start(); h2.score = 100; h2.endGame();
  check('a lower score does not overwrite the high score', h2.hi === 5000 && h2.store.cbc_hi === '5000');
  // reload keeps it
  const h3 = boot({ store: h.store });
  check('the high score survives a reload', h3.hi === 1234);
  // game-over screen text
  h.resetText(); h.draw(); const t = h.text();
  check('game-over screen shows the score, the bot name and a retry prompt', t.includes('1234') && t.includes('UNIT-7') && t.some(s => /ENTER|RETRY/.test(s)));
}

// =====================================================================================================
section('11. Daily challenge');
{
  const store = {}; const g = boot({ store });
  const ds = g.dailySeed();
  check('daily seed is in range 6..405', ds >= 6 && ds <= 405);
  check('daily seed is stable within a day', g.dailySeed() === ds);
  g.onPress('t');
  check('T on the title starts a daily run', g.state === 'play' && g.isDaily === true && g.level === 1);
  check('daily level 1 is a generated level, not the hand-built one', g.plats !== g.FIXED_PLATS && g.cfg.name === g.getCfg(ds).name);
  g.level = 2; g.startLevel(); check('daily level 2 uses the next seed', g.cfg.name === g.getCfg(ds + 1).name);
  g.score = 4321; g.endGame();
  check('a daily score is saved under the dated key', store['tbj_daily_' + g.todayStr()] === '4321');
  check('a daily run never touches the normal high score', store.cbc_hi === undefined && g.hi === 0);
  const g2 = boot({ store }); g2.onPress('Enter');
  check('a normal run afterwards is not a daily run', g2.isDaily === false && g2.plats === g2.FIXED_PLATS);
  g2.score = 50; g2.endGame(); check('normal runs save to the normal high score', store.cbc_hi === '50');
  g.resetText(); g.state = 'over'; g.isDaily = true; g.draw();
  check('daily game-over screen says DAILY', g.text().some(s => /DAILY/.test(s)));
  g.resetText(); const t = boot({ store }); t.draw();
  check('title screen shows today\'s daily best', t.text().some(s => /best 4321/.test(s)));
  // a run started from continue/level-select is not daily
  const c = boot({ store: { cbc_max: '4' } }); c.onPress('c');
  check('C continues at the furthest level (level 4)', c.level === 4 && c.state === 'play' && !c.isDaily);
  const c2 = boot({ store: { cbc_max: '4' } }); c2.onPress('3');
  check('number keys pick an unlocked level', c2.level === 3 && c2.state === 'play');
  const c3 = boot({ store: { cbc_max: '2' } }); c3.onPress('5');
  check('locked levels cannot be picked', c3.state === 'title');
}

// =====================================================================================================
section('12. Garage / shop / bot name');
{
  const store = { tbj_bank: '1000' }; const g = boot({ store });
  check('wallet loads from storage', g.coinBank === 1000);
  g.onPress('g'); check('G opens the garage from the title', g.state === 'shop');
  g.resetText(); g.draw(); check('the garage screen shows the wallet and bot name', g.text().includes('GARAGE') && g.text().some(s => s.includes('UNIT-7')) && g.text().some(s => /WALLET\s+1000/.test(s)));
  check('12 shop swatches (4 robot + 3 trail + 3 boulder + 2 coin)', g.shopLayout().length === 12);
  {
    // layout: heading / equipped ring (r+4) / item name must not collide (found in a real browser)
    g.resetText(); g.draw(); const gr = g.textRich(), lay = g.shopLayout(), R = lay[0].r;
    const rows = [...new Set(lay.map(s => s.y))].sort((a, b) => a - b);
    const heads = ['ROBOT SKIN', 'TRAIL EFFECT', 'BOULDER SKIN', 'COIN SKIN'].map(s => gr.find(t => t.s === s));
    const problems = [];
    rows.forEach((y, i) => {
      const h = heads[i]; if (!h) { problems.push('missing heading ' + i); return; }
      if (!(h.y + 3 < y - R - 4)) problems.push(`heading ${i} baseline ${h.y} touches the ring top ${y - R - 4}`);
      if (i > 0 && !(h.y - h.size > rows[i - 1] + R + 14 + 2)) problems.push(`heading ${i} top ${h.y - h.size} collides with the names above (${rows[i - 1] + R + 14})`);
    });
    check('garage: every heading clears the equipped ring below it and the item names above it', problems.length === 0, problems.join(' | '));
    check('garage: first heading sits below the rename pill (which ends at y=312)', heads[0].y - heads[0].size > 312, `top ${heads[0].y - heads[0].size}`);
    const hint = gr.find(t => /Click a skin|Tap a skin/.test(t.s)), lastName = rows[rows.length - 1] + R + 14;
    check('garage: the hint line sits below the last row of names and inside the card', hint && hint.y > lastName + 6 && hint.y < 700, `hint ${hint && hint.y}, last name ${lastName}`);
  }
  check('free items are owned by default', g.SHOP.filter(i => i.price === 0).every(i => g.isOwned(i)));
  g.shopTap('robot_stealth');
  check('buying a skin deducts its price and equips it', g.coinBank === 750 && g.owned.has('robot_stealth') && g.equipped.robot === 'robot_stealth');
  check('purchases and equipment are saved', JSON.parse(store.tbj_owned).includes('robot_stealth') && JSON.parse(store.tbj_equipped).robot === 'robot_stealth' && store.tbj_bank === '750');
  g.shopTap('robot_classic'); check('re-equipping a free skin costs nothing', g.coinBank === 750 && g.equipped.robot === 'robot_classic');
  g.shopTap('robot_stealth'); check('re-equipping an owned skin is free', g.coinBank === 750 && g.equipped.robot === 'robot_stealth');
  g.coinBank = 10; g.shopTap('robot_neon');
  check('cannot buy what you cannot afford', !g.owned.has('robot_neon') && g.coinBank === 10 && g.equipped.robot === 'robot_stealth');
  g.coinBank = 5000; ['trail_spark', 'boulder_molten', 'coin_neon'].forEach(id => g.shopTap(id));
  check('every category can be bought and equipped', g.equipped.trail === 'trail_spark' && g.equipped.boulder === 'boulder_molten' && g.equipped.coin === 'coin_neon');
  check('prices match the shop (250/300/400/300)', g.coinBank === 5000 - 300 - 400 - 300);
  g.onPress('Escape'); check('Esc closes the garage back to the title', g.state === 'title');
  // reload keeps it all
  const g2 = boot({ store });
  check('owned/equipped/wallet survive a reload', g2.equipped.robot === 'robot_stealth' && g2.owned.has('coin_neon') && g2.coinBank === g.coinBank);
  // cosmetics really are cosmetic: gameplay identical with any skin
  const a = boot().start(), b = boot({ store }).start();
  check('equipping skins does not change lives/score/hitboxes/spawn rate', a.lives === b.lives && a.spawnT === b.spawnT && a.P.x === b.P.x);
  b.draw(); check('the game still draws with a bought skin, trail, boulder and coin skin', b.text().length > 0);
  // trail particles
  const t = boot({ store }).start(); t.invulnerable(); t.hold('ArrowRight'); t.run(20); t.release('ArrowRight');
  check('an equipped trail leaves particles while running', t.particles.length > 0);
  const nt = boot().start(); nt.invulnerable(); nt.hold('ArrowRight'); nt.run(20); nt.release('ArrowRight');
  check('with no trail there are no extra particles', nt.particles.length === 0);
  // from pause
  const p = boot().start(); p.onPress('p'); p.onPress('g');
  check('G from the pause menu opens the garage', p.state === 'shop' && p.shopReturn === 'paused');
  p.onPress('Enter'); check('closing it returns to PAUSE (the run is not lost)', p.state === 'paused');
  p.onPress('p'); check('and the run resumes', p.state === 'play');
  // run untouched
  const r = boot().start(); r.score = 777; r.lives = 2; r.onPress('p'); r.onPress('g'); r.onPress('Escape'); r.onPress('p');
  check('opening the garage mid-run keeps score and lives', r.score === 777 && r.lives === 2 && r.level === 1);
  // ---- naming ----
  const n = boot({ prompt: '  the vault runner  ' });
  n.onPress('g'); n.onPress('n');
  check('renaming trims, upper-cases and caps at 12 chars', n.botName === 'THE VAULT RU', n.botName);
  check('the name is saved', n.store.tbj_name === 'THE VAULT RU');
  n.promptBox.v = null; n.onPress('n'); check('cancelling the prompt keeps the name', n.botName === 'THE VAULT RU');
  n.promptBox.v = '   '; n.onPress('n'); check('a blank name falls back to UNIT-7', n.botName === 'UNIT-7');
  n.promptBox.v = 'abc'; n.onPress('n'); check('short names work', n.botName === 'ABC');
  n.promptBox.v = 'X'.repeat(40); n.onPress('n'); check('very long names are capped at 12', n.botName.length === 12);
  n.promptBox.v = '<b>hi</b> & "q"'; n.onPress('n'); n.onPress('Escape'); n.resetText(); n.draw();
  check('odd characters are safe (drawn as plain canvas text)', n.text().includes(n.botName));
  const n2 = boot({ store: n.store }); check('the name survives a reload', n2.botName === n.botName);
  const nm = boot({ prompt: 'VAULT RUNNER' }); nm.onPress('g'); nm.onPress('n'); nm.onPress('Escape');
  nm.resetText(); nm.draw(); check('name shows on the title', nm.text().includes('VAULT RUNNER'));
  nm.start(); nm.onPress('p'); nm.resetText(); nm.draw(); const pt = nm.text();
  check('name shows on the PAUSE screen', pt.includes('VAULT RUNNER') && pt.includes('PAUSED'));
  nm.onPress('g'); nm.resetText(); nm.draw(); check('name shows in the garage', nm.text().some(s => s.includes('VAULT RUNNER')));
  nm.onPress('Escape'); nm.onPress('p'); nm.lives = 1; nm.die(); nm.run(91); nm.onPress('Enter'); nm.resetText(); nm.draw();
  check('name shows on the game-over screen', nm.state === 'over' && nm.text().includes('VAULT RUNNER'));
}

// =====================================================================================================
section('13. Mute, pause, sounds');
{
  const g = boot();
  g.beep(440); check('sound effects make audio nodes when unmuted', g.audio.nodes === 1);
  g.audio.nodes = 0; g.heistSting(); check('the drum sting makes audio', g.audio.nodes > 10);
  g.buzz(10); check('vibration works when unmuted', g.vib.n === 1);
  g.onPress('m'); check('M mutes', g.muted === true && g.store.tbj_muted === '1');
  g.audio.nodes = 0; g.vib.n = 0; g.beep(440); g.heistSting(); g.buzz(10);
  check('muted: no sound effects, no drum sting, no vibration', g.audio.nodes === 0 && g.vib.n === 0);
  g.start(); g.run(5); g.onPress(' '); check('muted: jumping is silent too', g.audio.nodes === 0);
  check('starting a level while muted is silent (level sting)', g.audio.nodes === 0);
  const g2 = boot({ store: g.store }); check('mute survives a reload', g2.muted === true);
  g2.onPress('M'); check('M again unmutes (works from the title)', g2.muted === false && g2.store.tbj_muted === '0');
  const g3 = boot().start(); g3.onPress('p'); g3.onPress('m'); check('mute works from the pause screen', g3.muted === true && g3.state === 'paused');
  const g4 = boot(); g4.start(); check('every level start plays the drum sting when unmuted', g4.audio.nodes > 10);
  g3.resetText(); g3.draw(); check('pause screen shows the current mute state', g3.text().some(s => /UNMUTE/.test(s)));
  const g5 = boot(); g5.start(); g5.onPress('p'); g5.resetText(); g5.draw();
  check('pause screen offers RESUME, MUTE and GARAGE', g5.text().some(s => /resume/i.test(s)) && g5.text().some(s => /^MUTE/.test(s)) && g5.text().some(s => /GARAGE/.test(s)));
  check('pause screen shows the score', g5.text().some(s => /SCORE/.test(s)));
}

// =====================================================================================================
section('14. Touch controls (tap zones)');
{
  // title
  let g = boot({ touch: true }); g.tap(320, 300); check('tapping the title starts a game', g.state === 'play' && !g.isDaily);
  g = boot({ touch: true }); g.tap(320, 604); check('tapping DAILY CHALLENGE starts a daily run', g.state === 'play' && g.isDaily);
  g = boot({ touch: true }); g.tap(320, 640); check('tapping GARAGE (no continue row) opens it', g.state === 'shop');
  g = boot({ touch: true, store: { cbc_max: '3' } });
  g.tap(320, 604); check('with progress, the first row is CONTINUE at level 3', g.state === 'play' && g.level === 3);
  g = boot({ touch: true, store: { cbc_max: '3' } }); g.tap(320, 640); check('DAILY moves down one row when CONTINUE is shown', g.state === 'play' && g.isDaily);
  g = boot({ touch: true, store: { cbc_max: '3' } }); g.tap(320, 676); check('GARAGE moves down two rows when CONTINUE is shown', g.state === 'shop');
  g = boot({ touch: true }); g.resetText(); g.draw(); check('touch layout says TAP TO START', g.text().some(s => /TAP TO START/.test(s)));
  // in-game pause button
  g = boot({ touch: true }).start(); g.tap(610, 21); check('the HUD pause button pauses', g.state === 'paused');
  g.tap(320, 300); check('tapping the paused screen resumes', g.state === 'play');
  g.tap(300, 400); check('taps in the middle of the play area do nothing', g.state === 'play');
  // pause card zones
  g.tap(610, 21); g.tap(320, 440); check('tapping MUTE on the pause card mutes (and stays paused)', g.muted === true && g.state === 'paused');
  g.tap(320, 440); check('tapping it again unmutes', g.muted === false);
  g.tap(320, 480); check('tapping GARAGE on the pause card opens the garage', g.state === 'shop' && g.shopReturn === 'paused');
  // shop taps
  g.coinBank = 500; const sw = g.shopLayout().find(s => s.it.id === 'robot_stealth');
  g.tap(sw.x, sw.y); check('tapping a locked swatch buys and equips it', g.equipped.robot === 'robot_stealth' && g.coinBank === 250);
  const sw2 = g.shopLayout().find(s => s.it.id === 'robot_classic'); g.tap(sw2.x, sw2.y);
  check('tapping an owned swatch just equips it', g.equipped.robot === 'robot_classic' && g.coinBank === 250);
  g.promptBox.v = 'TAPPY'; g.tap(320, 300); check('tapping the name row renames the bot', g.botName === 'TAPPY');
  g.tap(20, 30); check('tapping elsewhere closes the garage back to pause', g.state === 'paused');
  // revive offer & clear choice
  g = boot({ touch: true }).start(); g.lives = 1; g.die(); g.run(91);
  g.tap(320, 424); check('tapping WATCH AD on the revive screen revives', g.state === 'reviveAd'); g.run(91); check('...and the run continues', g.state === 'play' && g.lives === 1);
  g.die(); g.run(91); check('second time: straight to game over', g.state === 'over');
  g.tap(320, 452); check('tapping the game-over screen starts a new run', g.state === 'play' && g.lives === 3);
  g = boot({ touch: true }).start(); g.lives = 1; g.die(); g.run(91); g.tap(320, 480);
  check('tapping "continue without watching" ends the run', g.state === 'over');
  g = boot({ touch: true }).start(); g.spawnT = 99999; g.finishLevelViaPortal();
  const lo = g.clearChoiceLayout(g.clearSummary);
  g.tap(320, lo.watchY); check('tapping the WATCH AD button on the clear screen doubles', g.state === 'clearAd');
  g = boot({ touch: true }).start(); g.spawnT = 99999; g.finishLevelViaPortal(); const lo2 = g.clearChoiceLayout(g.clearSummary);
  g.tap(320, lo2.continueY); check('tapping the plain-claim row claims without the ad', g.state === 'clear' && !g.clearSummary.doubled);
  // touch strings
  g = boot({ touch: true }); g.onPress('g'); g.resetText(); g.draw(); check('touch garage says TAP TO RENAME', g.text().some(s => /TAP TO RENAME/.test(s)));
}

// =====================================================================================================
section('15. Screens & on-screen text');
{
  const g = boot().start();
  g.resetText(); g.draw(); let t = g.text();
  check('HUD shows score, level and the crypto counter', t.some(s => /^0{6}$/.test(s)) && t.some(s => /LVL 1/.test(s)) && t.some(s => /^0\/16$/.test(s)));
  g.combo = 8; g.resetText(); g.draw(); check('HUD shows COMBO x1.5 at combo 8', g.text().some(s => /COMBO x1\.5/.test(s)));
  g.P.inv = 300; g.resetText(); g.draw(); check('HUD shows SELF-CUSTODY while shielded', g.text().some(s => /SELF-CUSTODY/.test(s)));
  g.resetText(); g.draw(); check('level banner is shown at the start of a level', g.text().some(s => /LOCAL REGULATOR/.test(s)));
  // reserved states all draw
  const states = ['title', 'play', 'paused', 'shop', 'over', 'reviveOffer', 'reviveAd', 'clearAd', 'clearChoice', 'clear'];
  const fail = [];
  for (const st of states) {
    const x = boot().start(); x.spawnT = 99999; x.finishLevelViaPortal(); x.state = st; if (st === 'reviveAd' || st === 'clearAd') x.stateT = 45;
    try { x.resetText(); x.draw(); if (x.text().length === 0) fail.push(st + ' drew nothing'); } catch (e) { fail.push(st + ': ' + e.message); }
  }
  check('every screen/state draws without error', fail.length === 0, fail.join(' | '));
  const ad = boot().start(); ad.state = 'reviveAd'; ad.stateT = 45; ad.resetText(); ad.draw(); const at = ad.text();
  check('simulated ad screen says PLAYING SIMULATED AD', at.some(s => /PLAYING SIMULATED AD/.test(s)));
  check('simulated ad screen no longer shows the developer note', !at.some(s => /swap in a real ad SDK/i.test(s)));
  check('the source has no leftover "swap in a real ad SDK" on-screen text', !/txt\([^)]*swap in a real ad SDK/.test(SCRIPT));
  const ro = boot().start(); ro.state = 'reviveOffer'; ro.resetText(); ro.draw();
  check('revive screen offers the ad and a no-thanks option', ro.text().some(s => /WATCH AD/.test(s)) && ro.text().some(s => /without watching/i.test(s)));
  const cc = boot().start(); cc.spawnT = 99999; cc.finishLevelViaPortal(); cc.resetText(); cc.draw();
  check('clear-choice screen shows the doubled amount', cc.text().some(s => new RegExp('CLAIM ' + cc.clearSummary.total * 2).test(s)));
  // layout: text must not collide (found in a real browser: the name once sat on top of the logo)
  const ti = boot(); ti.draw(); const tr = ti.textRich();
  const logo = tr.find(x => x.s === 'BANK JOB'), nm = tr.find(x => x.s === 'UNIT-7');
  check('title: the bot name clears the top of the BANK JOB logo (no overlap)', !!logo && !!nm && nm.y + 4 < logo.y - logo.size * 0.72, `name baseline ${nm && nm.y}, logo cap-top ${logo && (logo.y - logo.size * 0.72).toFixed(1)}`);
  check('title: the bot name sits below the robot preview (robot feet ~y=220)', nm.y - nm.size > 222, `name top ${nm.y - nm.size}`);
  const pz = boot().start(); pz.onPress('p'); pz.resetText(); pz.draw(); const pr = pz.textRich();
  const pt = pr.find(x => x.s === 'PAUSED'), pn = pr.find(x => x.s === 'UNIT-7');
  check('pause: the bot name clears the PAUSED heading', !!pt && !!pn && pn.y + 4 < pt.y - pt.size * 0.72, `name ${pn && pn.y} vs heading top ${pt && (pt.y - pt.size * 0.72).toFixed(1)}`);
  // the boss health bar must be visible, i.e. not hidden behind the HUD bar (y 6-36) or on top of the GOVERNMENT label
  const bl = boot().start(); bl.level = 5; bl.startLevel(); bl.banner = 0; bl.resetText(); bl.draw();
  const bossLbl = bl.textRich().find(x => x.s === 'BOSS'), govLbl = bl.textRich().find(x => x.s === 'GOVERNMENT');
  check('boss health bar label is below the HUD bar (not hidden behind it)', !!bossLbl && bossLbl.y - bossLbl.size > 40, `label y ${bossLbl && bossLbl.y}`);
  check('boss health bar does not sit on the GOVERNMENT label', !!govLbl && bossLbl.y - bossLbl.size > govLbl.y, `boss top ${bossLbl && bossLbl.y - bossLbl.size} vs government baseline ${govLbl && govLbl.y}`);
  bl.boss.dead = true; bl.resetText(); bl.draw(); const dead = bl.textRich().find(x => x.s === 'DEFEATED');
  check('the DEFEATED tag is also clear of the HUD bar', !!dead && dead.y - dead.size > 40, `y ${dead && dead.y}`);
  // higher-level HUD & banners
  const h = boot().start(); h.level = 42; h.startLevel(); h.resetText(); h.draw();
  check('a generated level shows its own name in the banner', h.text().some(s => s === h.cfg.name));
  // dying screen and stat states
  const dy = boot().start(); dy.die(); dy.resetText(); dy.draw(); check('the death frame still draws (no robot, no crash)', dy.text().length > 0);
}

// =====================================================================================================
section('16. Stress: random input across many levels');
{
  const allowed = new Set(['title', 'play', 'paused', 'shop', 'dying', 'over', 'reviveOffer', 'reviveAd', 'clearChoice', 'clearAd', 'clear']);
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', ' ', 'ArrowRight', 'ArrowUp'];
  let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const errs = [];
  const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 25, 30, 47, 60, 100, 250];
  let frames = 0, kills = 0, clears = 0;
  for (const L of levels) {
    try {
      const g = boot().start(); g.level = L; g.startLevel();
      const held = new Set();
      for (let f = 0; f < 2500; f++) {
        if (rnd() < 0.08) { const k = keys[(rnd() * keys.length) | 0]; if (held.has(k)) { g.release(k); held.delete(k); } else { g.hold(k); held.add(k); } }
        const before = g.state; g.update(); frames++;
        if (before === 'play' && g.state === 'dying') kills++;
        if (g.state === 'clearChoice') { clears++; g.onPress('Enter'); }
        if (g.state === 'reviveOffer' || g.state === 'over') g.onPress('Enter');
        if (g.state === 'play' && g.lives < 3) g.lives = 3;
        if (f % 7 === 0) g.draw();
        if (!allowed.has(g.state)) throw new Error('unknown state ' + g.state);
        if (g.P && (!isFinite(g.P.x) || !isFinite(g.P.y))) throw new Error('player position went non-finite');
        if (g.barrels && g.barrels.some(b => !isFinite(b.x) || !isFinite(b.y))) throw new Error('barrel position went non-finite');
        if (g.P && (g.P.x < 0 || g.P.x > 640 || g.P.y > 800)) throw new Error(`player out of bounds ${g.P.x},${g.P.y}`);
      }
    } catch (e) { errs.push(`level ${L}: ${e.message}`); }
  }
  check(`${frames.toLocaleString()} frames of random play across ${levels.length} levels: no crash, no NaN, always in bounds`, errs.length === 0, errs.slice(0, 3).join(' | '));
  check('the stress run actually exercised deaths (hazards do kill)', kills > 5, `${kills} deaths`);
  console.log(`   (stress run: ${frames.toLocaleString()} frames, ${kills} deaths, ${clears} random level clears)`);
}

// =====================================================================================================
section('17. Assets: PNG integrity');
{
  const readPng = rel => {
    const b = fs.readFileSync(path.join(root, rel)); const out = { ok: false };
    if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') return out;
    let pos = 8, idat = [];
    while (pos < b.length) {
      const len = b.readUInt32BE(pos), type = b.slice(pos + 4, pos + 8).toString(), data = b.slice(pos + 8, pos + 8 + len), crc = b.readUInt32BE(pos + 8 + len);
      if ((zlib.crc32(Buffer.concat([Buffer.from(type), data])) >>> 0) !== crc) return out;
      if (type === 'IHDR') { out.w = data.readUInt32BE(0); out.h = data.readUInt32BE(4); out.ct = data[9]; }
      if (type === 'IDAT') idat.push(data);
      pos += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat)); const bpp = out.ct === 6 ? 4 : 3;
    out.ok = raw.length === out.h * (1 + out.w * bpp); out.raw = raw; out.bpp = bpp; return out;
  };
  const expect = { 'www/icon-192.png': [192, 2], 'www/icon-512.png': [512, 2], 'www/icon-maskable-512.png': [512, 2], 'assets/icon-only.png': [1024, 2],
    'assets/icon-foreground.png': [1024, 6], 'assets/icon-background.png': [1024, 2], 'assets/splash.png': [2732, 2], 'assets/splash-dark.png': [2732, 2] };
  for (const [f, [dim, ct]] of Object.entries(expect)) {
    const p = readPng(f);
    check(`${f}: valid PNG, ${dim}x${dim}, ${ct === 6 ? 'RGBA' : 'RGB'}`, p.ok && p.w === dim && p.h === dim && p.ct === ct, JSON.stringify({ ok: p.ok, w: p.w, h: p.h, ct: p.ct }));
  }
  const fg = readPng('assets/icon-foreground.png');
  let transparent = 0, opaque = 0; for (let i = 0; i < fg.h; i += 8) { const row = 1 + i * (1 + fg.w * 4); for (let x = 0; x < fg.w; x += 8) { const a = fg.raw[row + x * 4 + 3]; if (a === 0) transparent++; else if (a === 255) opaque++; } }
  check('adaptive foreground is mostly transparent with an opaque robot', transparent > opaque * 3 && opaque > 100, `${transparent} clear / ${opaque} solid`);
  const px = (p, x, y) => { const s = 1 + y * (1 + p.w * p.bpp) + x * p.bpp; return [...p.raw.slice(y * (1 + p.w * p.bpp) + 1 + x * p.bpp, y * (1 + p.w * p.bpp) + 1 + x * p.bpp + 3)]; };
  const bg = readPng('assets/icon-background.png');
  const tl = px(bg, 5, 5), br = px(bg, 1018, 1018);
  check('adaptive background is the orange->pink gradient', tl[0] > 240 && tl[1] > 130 && br[2] > 100 && br[1] < 110, `tl=${tl} br=${br}`);
  const sp = readPng('assets/splash.png'), c0 = px(sp, 3, 3);
  check('splash background matches the app background #07090f', c0.join() === '7,9,15', c0.join());
  check('splash and splash-dark are identical', fs.readFileSync(path.join(root, 'assets/splash.png')).equals(fs.readFileSync(path.join(root, 'assets/splash-dark.png'))));
  const ic = readPng('www/icon-512.png'), ico = px(ic, 6, 6);
  check('PWA icon uses the gradient (not the old dark tile)', ico[0] > 200, ico.join());
}

// =====================================================================================================
section('18. Config, manifest, service worker, workflows');
{
  const jf = rel => JSON.parse(read(rel));
  const man = jf('www/manifest.webmanifest');
  check('manifest name/short_name', man.name === 'Bank Job' && man.short_name === 'Bank Job');
  check('manifest paths are relative (work under /thebankjob/)', man.start_url === './index.html' && man.scope === './');
  check('manifest colors match the app background', man.background_color === '#07090f' && man.theme_color === '#07090f');
  const dims = { 'icon-192.png': 192, 'icon-512.png': 512, 'icon-maskable-512.png': 512 };
  check('every manifest icon exists', man.icons.every(i => fs.existsSync(path.join(root, 'www', i.src))));
  check('manifest sizes match the real image sizes', man.icons.every(i => { const b = fs.readFileSync(path.join(root, 'www', i.src)); return b.readUInt32BE(16) === parseInt(i.sizes); }));
  check('manifest includes a maskable icon', man.icons.some(i => i.purpose === 'maskable'));
  const sw = read('www/sw.js');
  const files = [...sw.match(/const FILES = \[(.*?)\]/s)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  check('sw.js caches only files that exist', files.every(f => fs.existsSync(path.join(root, 'www', f === './' ? 'index.html' : f))), files.join(','));
  check('sw.js caches every icon, the manifest and index.html', ['./index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'].every(f => files.includes(f)));
  check('sw.js has a versioned cache name', /VERSION = 'tbj-v\d+'/.test(sw));
  check('the page registers sw.js with a relative path', /register\('sw\.js'\)/.test(html));
  check('the page links the manifest and icons relatively', /rel="manifest" href="manifest\.webmanifest"/.test(html) && /apple-touch-icon" href="icon-192\.png"/.test(html));
  check('no root-absolute paths anywhere in www (breaks sub-path hosting)', !/(href|src)="\/[^\/]|url\(\/|register\('\/|fetch\('\/|start_url": "\//.test(html + sw + read('www/manifest.webmanifest')));
  check('viewport is mobile-friendly', /name="viewport"[^>]*width=device-width/.test(html));
  // layout: the game must leave room for the controls AND the ad banner, or its top bar gets clipped on short windows
  const reserve = +(html.match(/:root\{--reserve:(\d+)px\}/) || [])[1];
  check('game height reserves room for controls (140px) + ad banner (~52px)', reserve >= 190, `--reserve is ${reserve}px`);
  check('the canvas size uses that reserve', /canvas\{width:min\(100vw, calc\(\(100dvh - var\(--reserve\)\)/.test(html));
  check('the reserve shrinks back when the ad banner is hidden (short screens / ad-free)', /max-height:640px\)\{[^@]*--reserve:150px/.test(html) && /body\.noads\{--reserve:150px\}/.test(html) && /classList\.add\('noads'\)/.test(html));
  check('page title is Bank Job', /<title>Bank Job<\/title>/.test(html));
  const cap = jf('capacitor.config.json');
  check('capacitor: appId and name', cap.appId === 'com.thebankjob.game' && cap.appName === 'Bank Job');
  check('capacitor: webDir exists', fs.existsSync(path.join(root, cap.webDir)));
  const ss = cap.plugins && cap.plugins.SplashScreen;
  check('capacitor: splash configured (dark background, no spinner)', ss && ss.backgroundColor === '#07090f' && ss.showSpinner === false && ss.launchShowDuration > 0);
  const pkg = jf('package.json');
  check('package.json lists capacitor core, android, assets, cli and splash-screen', ['@capacitor/core', '@capacitor/android', '@capacitor/splash-screen'].every(d => pkg.dependencies[d]) && ['@capacitor/assets', '@capacitor/cli'].every(d => pkg.devDependencies[d]));
  const mi = read('make_icons.py');
  check('make_icons.py splash background equals the config colour', /SPLASH_BG = \(7, 9, 15\)/.test(mi));
  const apk = read('.github/workflows/build-apk.yml'), web = read('.github/workflows/deploy-web.yml');
  check('APK workflow: builds on push to main and uploads the artifact', /push:/.test(apk) && /assembleDebug/.test(apk) && /the-bank-job-apk/.test(apk));
  check('APK workflow generates icons AND splash screens', /assets generate --android/.test(apk) && /--splashBackgroundColor '#07090f'/.test(apk));
  check('web workflow publishes www/ to Pages with the right permissions', /upload-pages-artifact/.test(web) && /path: www/.test(web) && /pages: write/.test(web) && /deploy-pages/.test(web));
  check('workflows contain no tab characters (invalid YAML)', !/\t/.test(apk) && !/\t/.test(web));
  check('.gitignore keeps generated folders out', /node_modules/.test(read('.gitignore')) && /android/.test(read('.gitignore')));
}

// =====================================================================================================
section('19. Documentation');
{
  const docs = ['README.md', 'CHANGELOG.md', 'docs/BRD.md', 'docs/BUILDING.md', 'docs/ARCHITECTURE.md'];
  const brokenLinks = [];
  for (const d of docs) {
    const text = read(d);
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      let l = m[1]; if (/^(https?:|mailto:|#)/.test(l)) continue;
      l = l.split('#')[0]; if (!l) continue;
      if (!fs.existsSync(path.resolve(path.dirname(path.join(root, d)), l))) brokenLinks.push(`${d} -> ${l}`);
    }
  }
  check('every relative link in the docs points at a real file', brokenLinks.length === 0, brokenLinks.join(' | '));
  check('README documents the web link', /masukundani-png\.github\.io\/thebankjob/.test(read('README.md')));
  check('README repo tree lists the adaptive icon layers and splash', /icon-foreground/.test(read('README.md')) && /splash/.test(read('README.md')));
  check('BUILDING.md covers the web version and Pages setup', /## Web version/.test(read('docs/BUILDING.md')) && /Source: GitHub Actions|Source:\*\* GitHub Actions/.test(read('docs/BUILDING.md')));
  check('BUILDING.md mentions bumping the service-worker version', /VERSION/.test(read('docs/BUILDING.md')));
  check('BRD lists the bot name on the pause screen', /pause/.test(read('docs/BRD.md').match(/Player-chosen bot name[\s\S]{0,200}/)[0]));
  const cl = read('CHANGELOG.md');
  check('CHANGELOG has no unfilled "(pending)" entry', !/\(pending\)/.test(cl), 'still says (pending) -- fill in the commit hash once the web version is live');
  const swVer = +read('www/sw.js').match(/tbj-v(\d+)/)[1];
  check('service worker version is at least v14 (bumped through recent changes)', swVer >= 14, `v${swVer}`);
}

// =====================================================================================================
section('');
console.log('\n================ RESULTS ================');
for (const [name, p, f] of summary) console.log(`${f ? 'FAIL' : ' ok '}  ${String(p).padStart(3)} passed${f ? ', ' + f + ' FAILED' : ''}   ${name}`);
console.log(`\nTOTAL: ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
