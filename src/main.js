// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, the
// between-wave upgrade choice, paused, game over and dawn (victory).
//
// ?seed=N fixes the night's pattern. ?shot=title|play|upgrade|over|win (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_UPGRADE,
  SCREEN_WON,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let endless = false;

  // A handle for automated play-testing (and the finalist review): the live
  // world state and the current screen, read-only from outside the game.
  window.__emberlight = {
    get state() {
      return world.state;
    },
    get screen() {
      return screen;
    },
  };

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function playSound(event) {
    if (event === 'shoot') audio.shoot();
    else if (event === 'enemyHit') audio.enemyHit();
    else if (event === 'enemyDie') audio.enemyDie();
    else if (event === 'pickup') audio.pickup();
    else if (event === 'hurt') audio.hurt();
    else if (event === 'waveClear') audio.upgrade();
    else if (event === 'win') audio.win();
    else if (event === 'over') audio.lose();
  }

  function startGame() {
    audio.unlock();
    world.reset();
    endless = false;
    world.beginWave(1);
    screen = SCREEN_PLAY;
    audio.waveHorn();
    announce('Playing. Wave 1. Keep the lantern lit.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function winGame() {
    screen = SCREEN_WON;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Dawn breaks. Score ${world.state.score}. Best ${best}.`);
  }

  function pickUpgrade(index) {
    const offer = world.state.offer;
    if (!offer || index < 0 || index >= offer.length) return;
    const chosen = offer[index];
    world.applyUpgrade(chosen.id);
    audio.upgrade();
    announce(`Upgrade: ${chosen.name}. Wave ${world.state.wave + 1} next.`);
    world.beginWave(world.state.wave + 1);
    audio.waveHorn();
    screen = SCREEN_PLAY;
  }

  function handleActions() {
    const actions = input.takeActions();
    const pick = input.takeUpgradePick();
    if (screen === SCREEN_UPGRADE && pick > 0) {
      pickUpgrade(pick - 1);
      return;
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_WON) {
      endless = true;
      world.setEndless(true);
      world.beginWave(world.state.wave + 1);
      audio.waveHorn();
      screen = SCREEN_PLAY;
      announce('The endless night begins.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  /** A click on an upgrade card picks it; anywhere else confirms. */
  function handleClick() {
    if (screen !== SCREEN_UPGRADE) return;
    if (!input.takeClick()) return;
    const aim = renderer.fieldFromClient(input.aim().x, input.aim().y);
    const cards = world.state.offer;
    const cw = 250;
    const gap = 20;
    const total = cards.length * cw + (cards.length - 1) * gap;
    let x = 640 - total / 2;
    for (let i = 0; i < cards.length; i += 1) {
      if (aim.x >= x && aim.x <= x + cw && aim.y >= 260 && aim.y <= 480) {
        pickUpgrade(i);
        return;
      }
      x += cw + gap;
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.stepAmbient(STEP);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const fieldAim = renderer.fieldFromClient(input.aim().x, input.aim().y);
    const events = world.step(STEP, {
      move: input.moveVector(),
      aim: fieldAim,
      firing: input.firing(),
    });
    for (const event of events) playSound(event);
    if (events.includes('over')) endGame();
    else if (events.includes('win') && !endless) winGame();
    else if (events.includes('waveClear')) {
      screen = SCREEN_UPGRADE;
      announce('Wave cleared. Choose an upgrade.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleClick();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting shadows close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberlight. Press Enter or click to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
