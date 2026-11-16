// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between seven screens: title, play,
// the between-wave upgrade choice, paused, the status panel, game over and
// dawn (victory).
//
// ?seed=N fixes the night's pattern. ?shot=title|play|upgrade|over|win|select|panel|highwave|ultimate (with
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
  SCREEN_STATS,
  SCREEN_TITLE,
  SCREEN_UPGRADE,
  SCREEN_WON,
  characterLayout,
  createRenderer,
  keeperIconRect,
  statsPanelLayout,
  statsToggleRect,
  upgradeLayout,
} from './render.js';
import { CHARACTER_DEFS, CHARACTER_ORDER } from './characters.js';
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
  // The status panel's open tab; kept between openings.
  let statsTab = 'upgrades';

  // A handle for automated play-testing (and the finalist review): the live
  // world state and the current screen, read-only from outside the game.
  window.__emberlight = {
    get state() {
      return world.state;
    },
    get screen() {
      return screen;
    },
    get statsTab() {
      return statsTab;
    },
    /** The status toggle and panel rectangles, in field coordinates. */
    statsLayout() {
      return { toggle: statsToggleRect(), panel: statsPanelLayout() };
    },
    /** The keeper's corner of the bottom HUD bar, in field coordinates. */
    keeperIconRect() {
      return keeperIconRect();
    },
    /** The between-wave screen rectangles, in field coordinates. */
    upgradeLayout() {
      return upgradeLayout(world.state);
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
    else if (event === 'coin') audio.coin();
    else if (event === 'buy') audio.buy();
    else if (event === 'shield') audio.shield();
    else if (event === 'ult') audio.ult();
    else if (event === 'levelUp') audio.levelUp();
    else if (event === 'bossDie') audio.boss();
    else if (event === 'bossSpawn') audio.bossSpawn();
    else if (event === 'timeStop') audio.timeStop();
    else if (event === 'hurt') audio.hurt();
    else if (event === 'waveClear') audio.waveClear();
    else if (event === 'win') audio.win();
    else if (event === 'over') audio.lose();
  }

  function selectCharacter(index) {
    const id = CHARACTER_ORDER[index];
    if (!id) return;
    world.selectCharacter(id);
    audio.setKeeper(id);
    audio.click();
    const def = CHARACTER_DEFS[id];
    announce(`Keeper: ${def.name}. ${def.desc}`);
  }

  function startGame() {
    audio.unlock();
    audio.confirm();
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
    if (world.state.cardPicked) return;
    const chosen = offer[index];
    world.applyUpgrade(chosen.id);
    world.state.cardPicked = true;
    world.state.pickedId = chosen.id;
    audio.confirm();
    audio.upgrade();
    announce(`Upgrade: ${chosen.name}. Shop with your coins, then press Enter for the next wave.`);
  }

  /** Spend coins on one shop item; true when the purchase landed. */
  function buyShop(index) {
    const offer = world.state.shopOffer;
    if (!offer || index < 0 || index >= offer.length) return false;
    const item = offer[index];
    if (!world.buyShopItem(item.key)) {
      audio.click();
      announce(`Not enough coins for ${item.name}.`);
      return false;
    }
    audio.confirm();
    audio.buy();
    announce(`Bought ${item.name} for ${item.price} coins. ${world.state.coins} left.`);
    return true;
  }

  /** Re-roll the card offer with coins or a free refresh (R / the button). */
  function doRefresh() {
    audio.click();
    const res = world.refreshOffer();
    if (res === 'ok') {
      audio.buy();
      announce('Offer refreshed.');
    } else if (res === 'picked') announce('A card is already picked — refresh before you choose.');
    else if (res === 'maxed') announce('No refreshes left this wave.');
    else announce('Not enough coins to refresh.');
  }

  /** Leave the between-wave screen for the next wave. */
  function nextWave() {
    if (!world.state.cardPicked) return;
    audio.confirm();
    world.beginWave(world.state.wave + 1);
    // A boss wave gets the deep horn; any other wave gets the wave horn.
    if (world.state.wave % 5 === 0) audio.bossSpawn();
    else audio.waveHorn();
    screen = SCREEN_PLAY;
    announce(`Wave ${world.state.wave}. Keep the lantern lit.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const pick = input.takeUpgradePick();
    const shopPick = input.takeShopPick();
    const statsKey = input.takeStats();
    const refreshKey = input.takeRefresh();
    if (screen === SCREEN_TITLE) {
      // The title is the keeper select: 1/2/3 picks a keeper, Enter begins.
      // Clicks never begin here — they pick a card or press Begin instead.
      if (actions & ACTION_CONFIRM) audio.unlock();
      if (pick >= 1 && pick <= 3) selectCharacter(pick - 1);
      if (input.takeConfirmKey()) startGame();
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (pick > 0) pickUpgrade(pick - 1);
      if (shopPick > 0) buyShop(shopPick - 1);
      if (refreshKey) doRefresh();
      // Enter (keyboard only, never a click) moves on once a card is picked.
      if (input.takeConfirmKey() && world.state.cardPicked) nextWave();
      return;
    }
    if (screen === SCREEN_STATS) {
      // P, Escape or Enter closes the panel and play resumes. A mouse click
      // never closes it here — clicks switch tabs or press Close instead.
      if (actions & ACTION_PAUSE || input.takeConfirmKey() || statsKey) {
        audio.click();
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    // I opens the status panel from play (the game pauses while it is open).
    if (statsKey && screen === SCREEN_PLAY) {
      audio.click();
      screen = SCREEN_STATS;
      announce('Status panel. Paused.');
      return;
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_CONFIRM && screen === SCREEN_OVER) startGame();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_WON) {
      audio.confirm();
      endless = true;
      world.setEndless(true);
      world.beginWave(world.state.wave + 1);
      if (world.state.wave % 5 === 0) audio.bossSpawn();
      else audio.waveHorn();
      screen = SCREEN_PLAY;
      announce('The endless night begins.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      audio.click();
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      audio.click();
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  /** Clicks on the title screen pick a keeper or press Begin. */
  function handleTitleClick(aim) {
    const layout = characterLayout();
    const inside = (r) => aim.x >= r.x && aim.x <= r.x + r.w && aim.y >= r.y && aim.y <= r.y + r.h;
    for (let i = 0; i < layout.cards.length; i += 1) {
      if (inside(layout.cards[i])) {
        selectCharacter(i);
        return;
      }
    }
    if (inside(layout.begin)) startGame();
  }

  /**
   * Clicks in play and on the panels. The click is consumed once here, so a
   * click that resumes from pause or restarts from game over cannot leak
   * into the next screen and pop the status panel open by accident.
   */
  function handleClick() {
    if (!input.takeClick()) return;
    const aim = renderer.fieldFromClient(input.aim().x, input.aim().y);
    const inside = (r) => aim.x >= r.x && aim.x <= r.x + r.w && aim.y >= r.y && aim.y <= r.y + r.h;
    if (screen === SCREEN_TITLE) {
      handleTitleClick(aim);
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (inside(statsToggleRect())) {
        audio.click();
        screen = SCREEN_STATS;
        announce('Status panel. Paused.');
      } else if (inside(keeperIconRect())) {
        // Clicking the keeper's corner of the HUD bar opens the panel on
        // the Stats tab, so the player sees their live numbers at once.
        audio.click();
        statsTab = 'stats';
        screen = SCREEN_STATS;
        announce('Character stats. Paused.');
      }
      return;
    }
    if (screen === SCREEN_STATS) {
      const layout = statsPanelLayout();
      for (const t of layout.tabs) {
        if (inside(t.rect)) {
          audio.click();
          statsTab = t.id;
          return;
        }
      }
      if (inside(layout.close) || inside(statsToggleRect())) {
        audio.click();
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen !== SCREEN_UPGRADE) return;
    const layout = upgradeLayout(world.state);
    for (let i = 0; i < layout.cards.length; i += 1) {
      if (inside(layout.cards[i])) {
        pickUpgrade(i);
        return;
      }
    }
    for (let i = 0; i < layout.shop.length; i += 1) {
      if (inside(layout.shop[i])) {
        buyShop(i);
        return;
      }
    }
    if (inside(layout.refresh)) {
      doRefresh();
      return;
    }
    if (inside(layout.nextWave)) nextWave();
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
      // v2: auto-fire — the lantern shoots on its own; the click / Space
      // the player still holds is read as firing input, harmlessly.
      firing: true,
      // Q fires the ultimates when the lantern gauge is full.
      ult: input.takeUlt(),
    });
    for (const event of events) playSound(event);
    if (events.includes('over')) endGame();
    else if (events.includes('win') && !endless) winGame();
    else if (events.includes('waveClear')) {
      screen = SCREEN_UPGRADE;
      announce('Wave cleared. Choose a card, spend coins in the shop, then press Enter.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    handleClick();
    // The boss layer: a heartbeat while a boss lives, silent once it dies.
    audio.setBoss(world.state.enemies.some((e) => e.boss));
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, statsTab);
  }

  // Leaving the tab pauses a running game rather than letting shadows close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberlight. Choose a keeper with 1, 2 or 3, then press Enter or click Begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
