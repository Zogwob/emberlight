// The screenshot scenes behind ?shot=title|play|upgrade|over|win. Each one
// plays the real rules forward from a fresh world for a fixed number of steps,
// steered by an autopilot, so the frame is what a short game really looks like
// and the same seed always gives the same frame. The menu and settings scenes
// stage the ambient field behind the new first screens instead.
//
// The play pilot moves toward the nearest shadow while keeping clear of the
// others and fires at the closest one; the end pilot is careless, so it is
// caught out once the shadows speed up, as a hurried player is. The win scene
// stages a strong keeper at wave 10 and lets the pilot clear it, which is how
// the dawn screen is really reached.
import { ENEMY_KINDS, FIELD, STEP, WIN_WAVE } from './config.js';
import { SCREEN_MENU, SCREEN_OVER, SCREEN_PLAY, SCREEN_SETTINGS, SCREEN_STATS, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WON } from './render.js';

/** Stage one shadow by hand (mirroring spawnEnemy): the staged scenes need a
 * dense field at once, not the slow trickle of the spawn timer. `hpFrac`
 * wounds it, so an elite's small health bar reads. */
function stageEnemy(state, kind, x, y, elite, hpFrac = 1) {
  const def = ENEMY_KINDS[kind];
  const hpScale = 1 + (state.wave - 1) * 0.08;
  const hp = Math.max(1, Math.round(def.hp * hpScale)) * (elite ? 2 : 1);
  const e = {
    kind,
    elite: elite ? 'ghost' : null,
    x, y,
    hp: Math.max(1, Math.round(hp * hpFrac)),
    maxHp: hp,
    radius: def.radius,
    speed: def.speed * (elite ? 1.5 : 1),
    damage: def.damage,
    score: def.score * (elite ? 2 : 1),
    wobbleT: 0,
    shootT: 1,
    flash: 0,
    born: state.time,
  };
  if (kind === 'dasher') { e.lungeT = 2; e.lungeWindup = 0; e.dashT = 0; }
  if (kind === 'shieldbearer') { e.shield = Math.max(1, Math.round(def.shield * hpScale)); e.shieldMax = e.shield; }
  state.enemies.push(e);
  return e;
}

/** Stage one enemy projectile, aimed at (tx, ty) — the bullet-hell. */
function stageOrb(state, x, y, tx, ty, speed = 220) {
  const a = Math.atan2(ty - y, tx - x);
  state.orbs.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, radius: 8, life: 4 });
}

/** A keeper loaded for the showcase scenes: leveled cards, bought items, a
 * full lantern, so the panel and the HUD have something to show. */
function loadKeeper(world, keeper) {
  world.selectCharacter(keeper);
  world.reset();
  const s = world.state;
  s.coins = 999;
  for (const id of ['wideShot', 'glass', 'overcharge', 'halo', 'orbit', 'refresh', 'meteor', 'mend']) {
    world.applyUpgrade(id);
  }
  // Buy what the shelf offers, a few times over, so the Items tab fills.
  // The shelf must be set on the state first: buyShopItem looks the key up
  // on state.shopOffer, and a fresh re-offer might not list it.
  for (let i = 0; i < 4; i += 1) {
    const shelf = world.offerShop();
    s.shopOffer = shelf;
    const item = shelf.find((o) => o.kind === 'buy' || o.item);
    if (item) world.buyShopItem(item.key);
  }
  s.lantern = 100;
  return s;
}

const TITLE_SECONDS = 6;
const PLAY_SECONDS = 9;
const UPGRADE_SECONDS = 40;
const WIN_LIMIT_SECONDS = 600;

/** Steer the keeper: flee the closest threat, chase the nearest shadow. */
function autopilot(state, cautious) {
  const p = state.player;
  let threat = null;
  let threatDist = Infinity;
  let prey = null;
  let preyDist = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < threatDist) {
      threatDist = d;
      threat = e;
    }
    if (d < preyDist) {
      preyDist = d;
      prey = e;
    }
  }
  let mx = 0;
  let my = 0;
  if (threat && threatDist < (cautious ? 190 : 110)) {
    mx = (p.x - threat.x) / threatDist;
    my = (p.y - threat.y) / threatDist;
  } else if (prey) {
    const want = cautious ? 300 : 220;
    if (preyDist > want + 40) {
      mx = (prey.x - p.x) / preyDist;
      my = (prey.y - p.y) / preyDist;
    } else if (preyDist < want - 60) {
      mx = (p.x - prey.x) / preyDist;
      my = (p.y - prey.y) / preyDist;
    }
  } else {
    mx = (FIELD.width / 2 - p.x) / 400;
    my = (FIELD.height / 2 - p.y) / 400;
  }
  const len = Math.hypot(mx, my) || 1;
  const aim = prey
    ? { x: prey.x, y: prey.y }
    : { x: p.x + Math.cos(p.aim) * 100, y: p.y + Math.sin(p.aim) * 100 };
  return { move: { x: mx / len, y: my / len }, aim, firing: true };
}

/** Run the world forward with the autopilot until `stop` says enough. */
function playForward(world, seconds, cautious, stop) {
  const steps = Math.ceil(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = autopilot(world.state, cautious);
    world.step(STEP, input);
    if (stop && stop(world.state)) break;
  }
}

/**
 * Set `world` to the named scene (title, play, upgrade, over, win, select,
 * panel, highwave, ultimate, hud, menu or settings; any other name is title)
 * and return the screen to draw over it and the best score.
 */
export function stageShot(name, world) {
  world.reset();
  // menu: the main menu — the title, the tagline, Start and Settings.
  if (name === 'menu') {
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) world.stepAmbient(STEP);
    return { screen: SCREEN_MENU, best: 1240 };
  }
  // settings: the settings screen over the ambient field.
  if (name === 'settings') {
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) world.stepAmbient(STEP);
    return { screen: SCREEN_SETTINGS, best: 1240 };
  }
  if (name === 'title' || !name) {
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) world.stepAmbient(STEP);
    return { screen: SCREEN_TITLE, best: 1240 };
  }
  // select: the character selection — the title with Crimson chosen, so the
  // gold chosen marker reads on the middle card (the default is Ember).
  if (name === 'select') {
    world.selectCharacter('crimson');
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) world.stepAmbient(STEP);
    return { screen: SCREEN_TITLE, best: 1240 };
  }
  // panel: the status panel open over a live wave — a loaded keeper, so all
  // four tabs (Upgrades / Items / Ultimates / Stats) have something to show.
  if (name === 'panel') {
    const s = loadKeeper(world, 'ember');
    world.beginWave(3);
    playForward(world, 3, true, null);
    s.lantern = 100;
    return { screen: SCREEN_STATS, best: 1240 };
  }
  // highwave: wave 20 at full density — the Stormcaller boss (top-centre bar
  // + name), a crowd of all eight monster kinds, wounded ghost elites (small
  // health bars), a bullet-hell of enemy orbs, and the keeper's own bolts
  // flying. The keeper is strong, so the frame holds instead of ending.
  if (name === 'highwave') {
    const s = loadKeeper(world, 'ember');
    const p = s.player;
    p.damage = 2; p.fireRate = 7; p.shots = 2; p.pierce = 1; p.maxHp = 8; p.hp = 8;
    world.beginWave(20);
    const R = world.state.rng;
    const kinds = ['skitter', 'skitter', 'skitter', 'spitter', 'spitter', 'brute', 'lobber', 'dasher', 'splitter', 'shieldbearer', 'sniper'];
    for (let i = 0; i < 26; i += 1) {
      const kind = kinds[i % kinds.length];
      stageEnemy(s, kind, R.range(80, FIELD.width - 80), R.range(80, FIELD.height - 160), false);
    }
    // Wounded ghost elites: their small health bars read.
    for (let i = 0; i < 4; i += 1) {
      stageEnemy(s, ['brute', 'skitter', 'spitter', 'dasher'][i], R.range(200, FIELD.width - 200), R.range(150, FIELD.height - 250), true, 0.6);
    }
    // A bullet-hell: orbs converging on the keeper from all sides.
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      stageOrb(s, p.x + Math.cos(a) * R.range(280, 520), p.y + Math.sin(a) * R.range(280, 520), p.x, p.y, R.range(180, 260));
    }
    playForward(world, 2, true, null);
    // The frame is the fight, not the banner: a level-up or wave banner that
    // fires during the staging would cover the action.
    s.banner = '';
    s.bannerTime = 0;
    return { screen: SCREEN_PLAY, best: 1240 };
  }
  // ultimate: Emberfall at its WOW moment — Ember's meteors mid-sky, the
  // shockwave ring rolling out, the flash still strong. The ultimate fires
  // through the real Q path, then the world steps a blink forward (0.15s),
  // so the meteors are in the air and the flash has not yet faded.
  if (name === 'ultimate') {
    const s = loadKeeper(world, 'ember');
    const p = s.player;
    p.damage = 2; p.fireRate = 7; p.shots = 2; p.pierce = 1; p.maxHp = 8; p.hp = 8;
    world.beginWave(10);
    const R = world.state.rng;
    for (let i = 0; i < 8; i += 1) {
      stageEnemy(s, ['skitter', 'spitter', 'brute'][i % 3], R.range(150, FIELD.width - 150), R.range(120, FIELD.height - 200), false);
    }
    s.lantern = 100;
    world.step(STEP, { move: { x: 0, y: 0 }, aim: { x: 640, y: 200 }, firing: true, ult: true });
    for (let i = 0; i < Math.ceil(0.15 / STEP); i += 1) {
      world.step(STEP, { move: { x: 0, y: 0 }, aim: { x: 640, y: 200 }, firing: true });
    }
    // The frame is the ultimate, not the wave banner.
    s.banner = '';
    s.bannerTime = 0;
    return { screen: SCREEN_PLAY, best: 1240 };
  }
  // hud: the bottom-centre bar at a high level — the widest XP count the
  // game can show ("1425/1425", level 15) over the level gauge and the
  // widest lantern count that can render ("Lantern 99%" — at 100 the text
  // flips to "Q READY") over its gauge, so both numbers' place inside
  // their sections can be checked at a glance. The keeper is loaded, so
  // the item slots and the ultimate have something to show too.
  if (name === 'hud') {
    const s = loadKeeper(world, 'ember');
    world.beginWave(3);
    playForward(world, 2, true, null);
    s.player.level = 15;
    s.player.xp = 1425;
    s.player.xpNeed = 1425;
    s.lantern = 99;
    s.banner = '';
    s.bannerTime = 0;
    return { screen: SCREEN_PLAY, best: 1240 };
  }
  if (name === 'play') {
    world.beginWave(3);
    playForward(world, PLAY_SECONDS, true, (s) => s.waveState === 'over');
    return { screen: SCREEN_PLAY, best: 1240 };
  }
  if (name === 'upgrade') {
    world.beginWave(1);
    playForward(world, UPGRADE_SECONDS, true, (s) => s.waveState === 'upgrade' || s.waveState === 'over');
    if (world.state.waveState === 'upgrade') return { screen: SCREEN_UPGRADE, best: 1240 };
    return { screen: SCREEN_PLAY, best: 1240 };
  }
  if (name === 'win') {
    const p = world.state.player;
    p.damage = 2;
    p.fireRate = 7;
    p.shots = 2;
    p.pierce = 1;
    p.maxHp = 8;
    p.hp = 8;
    world.beginWave(WIN_WAVE);
    playForward(world, WIN_LIMIT_SECONDS, true, (s) => s.waveState === 'won' || s.waveState === 'over');
    if (world.state.waveState === 'won') return { screen: SCREEN_WON, best: 1240 };
    return { screen: SCREEN_PLAY, best: 1240 };
  }
  // over: a keeper who fought hard on wave 5 with a single heart left — one
  // touch ends the night. If the keeper somehow clears the wave, the next one
  // opens with a single heart again, so the fall always comes.
  world.beginWave(5);
  world.state.player.hp = 1;
  for (let wave = 5; wave <= 8; wave += 1) {
    playForward(world, 150, true, (s) => s.waveState === 'over' || s.waveState === 'upgrade');
    if (world.state.waveState === 'over') break;
    world.state.player.hp = 1;
    world.beginWave(wave + 1);
  }
  return { screen: SCREEN_OVER, best: 1240 };
}
