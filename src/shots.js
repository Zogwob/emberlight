// The screenshot scenes behind ?shot=title|play|upgrade|over|win. Each one
// plays the real rules forward from a fresh world for a fixed number of steps,
// steered by an autopilot, so the frame is what a short game really looks like
// and the same seed always gives the same frame.
//
// The play pilot moves toward the nearest shadow while keeping clear of the
// others and fires at the closest one; the end pilot is careless, so it is
// caught out once the shadows speed up, as a hurried player is. The win scene
// stages a strong keeper at wave 10 and lets the pilot clear it, which is how
// the dawn screen is really reached.

import { FIELD, STEP, WIN_WAVE } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, SCREEN_WON } from './render.js';

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
 * Set `world` to the named scene (title, play, upgrade, over or win; any other
 * name is title) and return the screen to draw over it and the best score.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'title' || !name) {
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) world.stepAmbient(STEP);
    return { screen: SCREEN_TITLE, best: 1240 };
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
