// Emberlight's simulation: one wisp, a lantern, and the shadows that come for
// it. Everything here is pure numbers and the seeded random source — no DOM, no
// sound, no canvas — so a screenshot scene can play the real rules forward and
// land on the same frame every time.
//
// Waves: each wave spawns a mix of three shadow kinds; clearing a wave opens
// the upgrade choice; clearing wave 10 breaks the dawn and wins the night.

import {
  DROPS,
  ENEMY_KINDS,
  FIELD,
  PLAYER,
  WIN_WAVE,
  spawnInterval,
  waveComposition,
} from './config.js';
import { COIN_LIFE, LEVEL_UP, LOOT_RADIUS_BASE, MAGNET_DROP_CHANCE, REFRESH_MAX, REFRESH_PRICES, WAVE_CLEAR_COINS, coinDropsFor, xpNeedFor } from './economy.js';
import { fireWeapon } from './weapons.js';
import { applyCard, drawRewardCards, offerCards } from './cards.js';
import { buyShopItem, offerShop } from './shop.js';
import { fireUltimate } from './ultimates.js';
import { bossDefFor, makeBoss, secondBossDefFor } from './bosses.js';
import { CHARACTER_DEFS, keeperBaseStats } from './characters.js';

const TAU = Math.PI * 2;

/** Where a shadow steps in: a random point just inside the field's edge. */
function spawnPoint(random) {
  const side = random.int(0, 3);
  const margin = 30;
  if (side === 0) return { x: random.range(margin, FIELD.width - margin), y: margin };
  if (side === 1) return { x: random.range(margin, FIELD.width - margin), y: FIELD.height - margin };
  if (side === 2) return { x: margin, y: random.range(margin, FIELD.height - margin) };
  return { x: FIELD.width - margin, y: random.range(margin, FIELD.height - margin) };
}

export function createWorld(random) {
  const state = {
    rng: random,
    character: 'ember',
    player: null,
    bullets: [],
    orbs: [],
    enemies: [],
    particles: [],
    pickups: [],
    floaters: [],
    embers: [],
    wave: 0,
    waveState: 'title',
    endless: false,
    score: 0,
    kills: 0,
    time: 0,
    shake: 0,
    banner: '',
    bannerTime: 0,
    upgradesTaken: {},
    coins: 0,
    coinsCollected: 0,
    shopOffer: [],
    offer: [],
    cardPicked: false,
    pickedId: null,
    // Boss waves grant 3 free cards (shown on the upgrade screen); the
    // offer can be re-rolled with coins, at most 3 times a wave, and the
    // Second Look card hands out free re-rolls each wave.
    bossReward: [],
    refreshesUsed: 0,
    freeRefreshes: 0,
    shotsFired: 0,
    hits: 0,
    orbitPos: null,
    lantern: 0,
    ultimates: [],
    flash: 0,
    // Time Stop: a rare hourglass pickup freezes every shadow and every
    // projectile for 5 seconds. The keeper keeps moving and shooting.
    timeStop: 0,
    // Ultimate spectacle: expanding rings of light (Dawn Burst) and the
    // full-screen frost wash (Still Light). Rings grow and fade; the frost
    // washes in and out over ~1.5s. Both are pure visuals — no gameplay.
    rings: [],
    frost: 0,
  };

  function freshPlayer() {
    // The keeper's light is their character's colour, and they start with
    // their own light beside the Light Bolts. The radar numbers on the
    // select screen are the keeper's real base stats (keeperBaseStats):
    // Move -> speed, Health -> max hearts, DPS -> damage, Range -> reach.
    const char = CHARACTER_DEFS[state.character] ?? CHARACTER_DEFS.ember;
    const base = keeperBaseStats(char);
    return {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      hp: base.maxHp,
      maxHp: base.maxHp,
      speed: base.speed,
      fireRate: PLAYER.fireRate,
      damage: PLAYER.bulletDamage,
      shots: 1,
      pierce: 0,
      lanternRadius: PLAYER.lanternRadius,
      fireCooldown: 0,
      invulnerable: 0,
      shieldUntil: 0,
      rapidUntil: 0,
      aim: 0,
      tint: { wisp: char.color, flame: char.flame, bolt: char.bolt },
      // v2: the keeper's purse and pull. lootRadius is the coin magnet's
      // reach; dmgMul / rateMul lift every weapon; coinMul lifts coin value;
      // wardLevel shields the keeper when a wave begins. bonusProjectiles
      // (bullet-spread cards) adds shots to bullet weapons; bulletSpeedMul
      // (bullet-speed cards) quickens every bullet. shieldRecharge / halo /
      // orbit / slowOnHit come from the survival cards; lifestealThreshold,
      // secondWindRate and dropMul from the shop items.
      lootRadius: LOOT_RADIUS_BASE,
      dmgMul: base.dmgMul,
      rangeMul: base.rangeMul,
      // The keeper's level: every coin dropped feeds the gauge as well as
      // the purse (spending never drains it), and each level raises damage
      // and max health only — speed and range come from cards.
      level: 1,
      xp: 0,
      xpNeed: xpNeedFor(1),
      rateMul: 1,
      coinMul: 1,
      wardLevel: 0,
      bonusProjectiles: 0,
      bulletSpeedMul: 1,
      shieldRecharge: 0,
      shieldReady: false,
      shieldTimer: 0,
      slowOnHit: null,
      halo: null,
      orbit: null,
      lifestealThreshold: 0,
      lifeAcc: 0,
      secondWindRate: 0,
      regenAcc: 0,
      hurtAt: -99,
      dropMul: 1,
      items: {},
      weapons: [
        { id: 'bolts', level: 1, cooldown: 0 },
        { id: char.signature, level: 1, cooldown: 0 },
      ],
    };
  }

  function freshEmbers() {
    const embers = [];
    for (let i = 0; i < 42; i += 1) {
      embers.push({
        x: random.range(0, FIELD.width),
        y: random.range(0, FIELD.height),
        vy: random.range(6, 22),
        sway: random.range(0, TAU),
        size: random.range(1, 3.2),
        twinkle: random.range(0, TAU),
      });
    }
    return embers;
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random.range(0, TAU);
      const v = random.range(speed * 0.3, speed);
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: random.range(0.3, 0.7),
        maxLife: 0.7,
        size: random.range(2, 5),
        color,
      });
    }
  }

  function floater(x, y, text, color) {
    // Floaters stack instead of printing on top of each other: a new one
    // starts a line above any still alive near the same spot (a coin and
    // the wave bonus landing together used to read as one garbled line).
    let stack = 0;
    for (const f of state.floaters) {
      if (Math.abs(f.x - x) < 80) stack += 1;
    }
    state.floaters.push({ x, y: y - stack * 16, text, color, life: 0.9 });
  }

  /** One level-up: damage and max health only, a banner, a golden flare. */
  function applyLevelUp(events) {
    const p = state.player;
    p.level += 1;
    p.xpNeed = xpNeedFor(p.level);
    p.dmgMul *= 1 + LEVEL_UP.damage;
    p.maxHp += LEVEL_UP.maxHp;
    p.hp = Math.min(p.maxHp, p.hp + LEVEL_UP.maxHp);
    // The banner is a combat moment: at a wave clear the upgrade screen is
    // already talking, so the floater and the flare carry it there instead.
    if (state.waveState === 'fighting') {
      state.banner = `LEVEL ${p.level}! The light grows stronger.`;
      state.bannerTime = 2.2;
    }
    burst(p.x, p.y, p.tint.wisp, 26, 260);
    floater(p.x, p.y - 40, `LEVEL ${p.level}!`, '#ffd700');
    events.push('levelUp');
  }

  /**
   * Feed XP into the keeper's level gauge; levels up (possibly more than
   * once on a big haul) and returns how many levels were gained. The gauge
   * is cumulative: spending coins in the shop never drains it.
   */
  function addXp(amount, events) {
    const p = state.player;
    if (!p || amount <= 0) return 0;
    p.xp += amount;
    let gained = 0;
    while (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed;
      applyLevelUp(events);
      gained += 1;
    }
    return gained;
  }

  /**
   * One shadow of a kind. `at` is an explicit spawn point (a Splitter's
   * children burst out where it died); without it, a random edge point.
   * Minions never roll elite.
   */
  function spawnEnemy(kind, at) {
    const def = ENEMY_KINDS[kind];
    const pos = at ?? spawnPoint(random);
    // Monster health climbs with the waves, and so does their pace a little;
    // the keeper's damage and health climb too, through cards and the shop.
    const hpScale = 1 + (state.wave - 1) * 0.08;
    const speedScale = 1 + Math.min(0.25, (state.wave - 1) * 0.02);
    const hp = Math.max(1, Math.round(def.hp * hpScale));
    // Elites: from wave 2, a ghost-like shadow — translucent, fast, tougher.
    const elite = !at && state.wave >= 2 && random.chance(0.12);
    const enemy = {
      kind,
      elite: elite ? 'ghost' : null,
      x: pos.x,
      y: pos.y,
      hp: elite ? hp * 2 : hp,
      maxHp: elite ? hp * 2 : hp,
      radius: def.radius,
      speed: def.speed * random.range(0.9, 1.1) * speedScale * (elite ? 1.5 : 1),
      damage: def.damage,
      score: def.score * (elite ? 2 : 1),
      wobbleT: random.range(0, def.wobble ?? 1),
      shootT: random.range(1, def.shootEvery ?? 2),
      flash: 0,
      born: state.time,
    };
    // A Dasher stalks, winds up, then lunges; a Shieldbearer carries its
    // front shield, which soaks hits from the keeper's side until it breaks.
    if (kind === 'dasher') {
      enemy.lungeT = random.range(1.5, 2.5);
      enemy.lungeWindup = 0;
      enemy.dashT = 0;
    }
    if (kind === 'shieldbearer') {
      enemy.shield = Math.max(1, Math.round(def.shield * hpScale));
      enemy.shieldMax = enemy.shield;
    }
    state.enemies.push(enemy);
    burst(pos.x, pos.y, elite ? '#cfd8ff' : '#6a5acd', 6, 60);
  }

  /**
   * Boss waves (5, 10, 15, ...) bring a boss, stepping in with the regular
   * shadows; endless boss waves (30, 35, ...) bring two at once.
   */
  function spawnBoss(wave) {
    if (wave % 5 !== 0) return;
    const def = bossDefFor(wave);
    const at = spawnPoint(random);
    state.enemies.push(makeBoss(def, at, ENEMY_KINDS[def.kind].speed));
    burst(at.x, at.y, def.color, 24, 220);
    state.banner = `Wave ${wave} — ${def.name} rises!`;
    state.bannerTime = 2.2;
    if (wave > WIN_WAVE) {
      const def2 = secondBossDefFor(wave);
      const at2 = spawnPoint(random);
      state.enemies.push(makeBoss(def2, at2, ENEMY_KINDS[def2.kind].speed));
      burst(at2.x, at2.y, def2.color, 24, 220);
      state.banner = `Wave ${wave} — ${def.name} and ${def2.name} rise!`;
      state.bannerTime = 2.2;
    }
  }

  /** A boss's extra tricks, on top of its base kind's movement. */
  function stepBoss(e, dt, events) {
    const p = state.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const ring = (count, speed = 190) => {
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * TAU;
        state.orbs.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, radius: 8, life: 4 });
      }
      events.push('spit');
    };
    const fan = (count, spreadAngle, speed = 190) => {
      const base = Math.atan2(dy, dx);
      for (let i = 0; i < count; i += 1) {
        const a = base + (i - (count - 1) / 2) * spreadAngle;
        state.orbs.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, radius: 8, life: 4 });
      }
      events.push('spit');
    };
    // A dashing boss lunges at the keeper.
    if (e.dashT > 0) {
      e.dashT -= dt;
      e.x += nx * e.speed * 3 * dt;
      e.y += ny * e.speed * 3 * dt;
    }
    e.bossT -= dt;
    e.bossT2 -= dt;
    e.bossT3 -= dt;
    const m = e.mechanic;
    // Dash (charge / twin / slam) and blink share the first timer.
    if ((m === 'charge' || m === 'twin' || m === 'slam') && e.bossT <= 0 && dist < 560) {
      e.bossT = m === 'slam' ? 5 : 4;
      e.dashT = 0.5;
    }
    if ((m === 'blink' || m === 'blinkspread' || m === 'final') && e.bossT <= 0) {
      e.bossT = 3.5;
      // Blink away and reappear elsewhere, away from the keeper.
      const a = random.range(0, TAU);
      const r = random.range(250, 400);
      e.x = Math.max(30, Math.min(FIELD.width - 30, p.x + Math.cos(a) * r));
      e.y = Math.max(30, Math.min(FIELD.height - 30, p.y + Math.sin(a) * r));
      burst(e.x, e.y, '#b78cff', 16, 160);
    }
    // Fan of orbs (spread / twin / blinkspread) and summons share the second.
    if ((m === 'spread' || m === 'twin' || m === 'blinkspread') && e.bossT2 <= 0 && dist < 520) {
      e.bossT2 = 2.5;
      fan(3, 0.25);
    }
    if ((m === 'summon' || m === 'final') && e.bossT2 <= 0 && state.enemies.length < 25) {
      e.bossT2 = 6;
      spawnEnemy('skitter');
      spawnEnemy('skitter');
    }
    // Ring of orbs (radial / slam / final) on the third timer.
    if ((m === 'radial' || m === 'slam' || m === 'final') && e.bossT3 <= 0) {
      e.bossT3 = 3;
      ring(8);
    }
  }

  function dropRoll(x, y) {
    for (const [kind, chance] of DROPS) {
      if (random.chance(chance * state.player.dropMul)) {
        state.pickups.push({ kind, x, y, life: 9 });
        return;
      }
    }
  }

  function killEnemy(index, events) {
    const e = state.enemies[index];
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.score += e.score;
    state.shake = Math.min(10, state.shake + (e.kind === 'brute' ? 4 : 2));
    burst(e.x, e.y, '#8a7bd8', e.kind === 'brute' ? 22 : 10, 170);
    burst(e.x, e.y, '#ffb347', 6, 120);
    floater(e.x, e.y - 10, `+${e.score}`, '#ffd98a');
    dropRoll(e.x, e.y);
    // v2: every slain shadow pays coins, and a brute may also drop the
    // loot-all magnet that sweeps the whole field when picked up. Elites
    // pay two extra coins for the trouble.
    for (const drop of coinDropsFor(e.kind, random)) {
      state.pickups.push({ kind: 'coin', x: e.x + drop.dx, y: e.y + drop.dy, value: drop.value, life: COIN_LIFE });
    }
    if (e.elite) {
      for (let i = 0; i < 2; i += 1) {
        state.pickups.push({ kind: 'coin', x: e.x + random.range(-30, 30), y: e.y + random.range(-30, 30), value: 2, life: COIN_LIFE });
      }
    }
    // A Splitter bursts into two skitters where it died.
    if (e.kind === 'splitter') {
      for (let i = 0; i < 2; i += 1) {
        spawnEnemy('skitter', { x: e.x + random.range(-16, 16), y: e.y + random.range(-16, 16) });
      }
    }
    if (e.kind === 'brute' && random.chance(MAGNET_DROP_CHANCE * state.player.dropMul)) {
      state.pickups.push({ kind: 'magnet', x: e.x, y: e.y, life: 12 });
    }
    // A boss pays out: a shower of coins, a heart, and a loot-all magnet.
    if (e.boss) {
      for (let i = 0; i < 10; i += 1) {
        state.pickups.push({ kind: 'coin', x: e.x + random.range(-40, 40), y: e.y + random.range(-40, 40), value: 2, life: COIN_LIFE });
      }
      state.pickups.push({ kind: 'heart', x: e.x, y: e.y + 20, life: 12 });
      state.pickups.push({ kind: 'magnet', x: e.x, y: e.y - 20, life: 12 });
      floater(e.x, e.y - 30, 'Boss down!', '#ffd700');
      events.push('bossDie');
    }
    // Every kill fills the lantern; a boss fills it much faster.
    const wasFull = state.lantern >= 100;
    state.lantern = Math.min(100, state.lantern + (e.boss ? 25 : 8));
    if (state.lantern >= 100 && !wasFull) {
      floater(state.player.x, state.player.y - 24, 'Lantern full — press Q!', '#ffd700');
    }
    events.push('enemyDie');
  }

  function hurtPlayer(damage, events) {
    const p = state.player;
    if (p.invulnerable > 0 || state.time < p.shieldUntil) return;
    // Aegis: a ready shield swallows the hit whole, then starts recharging.
    if (p.shieldReady) {
      p.shieldReady = false;
      p.shieldTimer = p.shieldRecharge;
      p.invulnerable = 0.5;
      // The shield is the keeper's own light closing around them.
      burst(p.x, p.y, p.tint.wisp, 12, 180);
      events.push('shield');
      return;
    }
    p.hp -= damage;
    p.hurtAt = state.time;
    p.regenAcc = 0;
    p.invulnerable = PLAYER.invulnerable;
    // Getting hurt shakes the screen, but never as hard as an ultimate.
    state.shake = Math.min(14, state.shake + 5);
    burst(p.x, p.y, '#ff5d73', 14, 200);
    events.push('hurt');
    if (p.hp <= 0) {
      p.hp = 0;
      state.waveState = 'over';
      // The keeper's light goes out in their own colour.
      burst(p.x, p.y, p.tint.wisp, 40, 260);
      events.push('over');
    }
  }

  /** Frost rounds: a bullet hit chills the shadow, slowing it a while. */
  function applySlow(e) {
    const slow = state.player.slowOnHit;
    if (slow) {
      e.slowT = slow.dur;
      e.slowMul = slow.mul;
    }
  }

  /** Ember Leech: damage dealt slowly mends the keeper, a heart at a time. */
  function trackDamage(amount) {
    const p = state.player;
    if (!p.lifestealThreshold) return;
    p.lifeAcc += amount;
    while (p.lifeAcc >= p.lifestealThreshold) {
      p.lifeAcc -= p.lifestealThreshold;
      if (p.hp < p.maxHp) {
        p.hp += 1;
        floater(p.x, p.y - 24, '+1 heart', '#ff6b81');
      }
    }
  }

  /** Burning Halo: the lantern's light scorches shadows that come close. */
  function stepHalo(dt, events) {
    const p = state.player;
    if (!p.halo || state.waveState !== 'fighting') return;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const reach = p.halo.radius + e.radius;
      if (dx * dx + dy * dy < reach * reach) {
        const dmg = p.halo.dps * dt;
        e.hp -= dmg;
        trackDamage(dmg);
        if (e.hp <= 0) killEnemy(i, events);
      }
    }
  }

  /** Orbiting Light: a bright orb circles the keeper, burning what it touches. */
  function stepOrbit(dt, events) {
    const p = state.player;
    if (!p.orbit || state.waveState !== 'fighting') return;
    p.orbit.angle += dt * 3;
    const ox = p.x + Math.cos(p.orbit.angle) * 110;
    const oy = p.y + Math.sin(p.orbit.angle) * 110;
    state.orbitPos = { x: ox, y: oy };
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const dx = e.x - ox;
      const dy = e.y - oy;
      const reach = 14 + e.radius;
      if (dx * dx + dy * dy < reach * reach && state.time - (e.orbitHitT ?? -99) > 0.4) {
        e.hp -= p.orbit.level;
        e.orbitHitT = state.time;
        e.flash = 0.12;
        trackDamage(p.orbit.level);
        burst(ox, oy, p.tint.wisp, 3, 80);
        events.push('enemyHit');
        if (e.hp <= 0) killEnemy(i, events);
      }
    }
  }

  /** What the ultimates need from the world: hurt everything, clear orbs, rain meteors, freeze. */
  const ultCtx = {
    state,
    events: [],
    randomX() {
      return random.range(40, FIELD.width - 40);
    },
    damageAll(amount) {
      for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
        const e = state.enemies[i];
        e.hp -= amount;
        e.flash = 0.12;
        trackDamage(amount);
        if (e.hp <= 0) killEnemy(i, ultCtx.events);
      }
    },
    clearOrbs() {
      state.orbs.length = 0;
    },
    spawnMeteor(x, damage) {
      state.bullets.push({
        kind: 'meteor',
        x,
        y: -20,
        vx: random.range(-40, 40),
        vy: 900,
        radius: 12,
        damage,
        pierce: 0,
        life: 2,
        splash: 0,
      });
    },
    freezeAll(seconds) {
      for (const e of state.enemies) e.frozen = seconds;
    },
    /** An expanding ring of light, from (x, y) out to maxR over life seconds. */
    spawnRing(x, y, color, maxR, life) {
      state.rings.push({ x, y, r: 12, maxR, life, maxLife: life, color });
    },
    /** The full-screen frost wash Still Light leaves behind. */
    frostWash(seconds) {
      state.frost = seconds;
    },
    /** A burst of particles, for an ultimate's spectacle. */
    burst(x, y, color, count, speed) {
      burst(x, y, color, count, speed);
    },
  };

  /** v2: the lantern fires on its own — each held weapon on its own cooldown. */
  function fireWeapons(dt, events) {
    const p = state.player;
    for (const weapon of p.weapons) {
      weapon.cooldown = Math.max(0, weapon.cooldown - dt);
      fireWeapon(state, weapon, events);
    }
  }

  /**
   * Damage a shadow, in hit points. A Shieldbearer's front shield soaks
   * hits that come from the keeper's side first — the shield always faces
   * the keeper, since it chases them — and shatters when it is spent.
   * Returns the hit points actually dealt to the body.
   */
  function damageEnemy(e, damage, fromX, fromY) {
    if ((e.shield ?? 0) > 0) {
      const fx = state.player.x - e.x;
      const fy = state.player.y - e.y;
      const fl = Math.hypot(fx, fy) || 1;
      const hx = fromX - e.x;
      const hy = fromY - e.y;
      const hl = Math.hypot(hx, hy) || 1;
      const facing = (fx * hx + fy * hy) / (fl * hl);
      if (facing > 0) {
        const soaked = Math.min(e.shield, damage);
        e.shield -= soaked;
        damage -= soaked;
        if (e.shield <= 0) burst(e.x, e.y, '#7dd7ff', 8, 120);
      }
    }
    if (damage > 0) e.hp -= damage;
    return damage;
  }

  function stepBullets(dt, events) {
    // Impact sparks burst in the keeper's own light colour.
    const tint = state.player.tint;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      if (b.orbit) {
        // An orbiting blade circles the keeper instead of flying straight.
        // It never spends itself on a hit; the flash gate keeps its damage
        // to one hit per shadow per flash, like any other weapon.
        b.angle += b.orbitSpeed * dt;
        b.x = state.player.x + Math.cos(b.angle) * b.orbitRadius;
        b.y = state.player.y + Math.sin(b.angle) * b.orbitRadius;
        b.life -= dt;
        let dead = b.life <= 0;
        if (!dead) {
          for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
            const e = state.enemies[j];
            const dx = e.x - b.x;
            const dy = e.y - b.y;
            if (e.flash <= 0 && dx * dx + dy * dy < (e.radius + b.radius) * (e.radius + b.radius)) {
              const dealt = damageEnemy(e, b.damage, b.x, b.y);
              e.flash = 0.12;
              applySlow(e);
              trackDamage(dealt);
              state.hits += 1;
              burst(b.x, b.y, tint.wisp, 3, 80);
              events.push('enemyHit');
              if (e.hp <= 0) killEnemy(j, events);
            }
          }
        }
        if (dead) state.bullets.splice(i, 1);
        continue;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const e = state.enemies[j];
          // A piercing round must not spend itself twice on the same shadow:
          // it stays in range for a step or two after the first hit.
          if (b.hitSet?.has(e)) continue;
          const dx = e.x - b.x;
          const dy = e.y - b.y;
          if (dx * dx + dy * dy < (e.radius + b.radius) * (e.radius + b.radius)) {
            (b.hitSet ??= new Set()).add(e);
            if (b.splash > 0) {
              // A shell bursts: every shadow inside the blast takes the hit.
              // A Glacier shell bursts blue like its ice; a grenade or
              // rocket bursts orange, like any explosion.
              const blastColor = b.kind === 'glacier' ? '#8ac8ff' : '#ff8a3d';
              for (let k = state.enemies.length - 1; k >= 0; k -= 1) {
                const t = state.enemies[k];
                const tdx = t.x - b.x;
                const tdy = t.y - b.y;
                if (tdx * tdx + tdy * tdy < (t.radius + b.splash) * (t.radius + b.splash)) {
                  const dealt = damageEnemy(t, b.damage, b.x, b.y);
                  t.flash = 0.12;
                  applySlow(t);
                  trackDamage(dealt);
                  // A Glacier shell chills every shadow its blast touches.
                  if (b.kind === 'glacier') {
                    t.slowT = 2;
                    t.slowMul = 0.6;
                  }
                  state.hits += 1;
                  burst(t.x, t.y, blastColor, 4, 110);
                  events.push('enemyHit');
                  if (t.hp <= 0) killEnemy(k, events);
                }
              }
              burst(b.x, b.y, blastColor, 14, 180);
              dead = true;
            } else {
              const dealt = damageEnemy(e, b.damage, b.x, b.y);
              e.flash = 0.12;
              applySlow(e);
              trackDamage(dealt);
              state.hits += 1;
              burst(b.x, b.y, tint.wisp, 4, 90);
              events.push('enemyHit');
              if (e.hp <= 0) killEnemy(j, events);
              if (b.pierce > 0) {
                b.pierce -= 1;
              } else {
                dead = true;
              }
            }
            break;
          }
        }
      }
      if (dead) {
        // An Emberfall meteor bursts when it lands — on a hit or on the
        // ground — a fireball of embers, not a quiet fade.
        if (b.kind === 'meteor') {
          burst(b.x, b.y, '#ff8a3d', 18, 220);
          burst(b.x, b.y, tint.wisp, 8, 140);
          state.shake = Math.min(10, state.shake + 3);
        }
        state.bullets.splice(i, 1);
      }
    }
  }

  function stepOrbs(dt, events) {
    const p = state.player;
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const o = state.orbs[i];
      // Time Stop: projectiles hang frozen in the air — they do not move,
      // and they cannot hurt the keeper while time is held. Their life
      // still ticks down, so a stop never preserves an orb forever.
      if (state.timeStop <= 0) {
        o.x += o.vx * dt;
        o.y += o.vy * dt;
      }
      o.life -= dt;
      let dead = o.life <= 0 || o.x < -20 || o.x > FIELD.width + 20 || o.y < -20 || o.y > FIELD.height + 20;
      if (!dead && state.timeStop <= 0) {
        const dx = p.x - o.x;
        const dy = p.y - o.y;
        if (dx * dx + dy * dy < (PLAYER.radius + o.radius) * (PLAYER.radius + o.radius)) {
          hurtPlayer(1, events);
          dead = true;
        }
      }
      if (dead) state.orbs.splice(i, 1);
    }
  }

  function stepEnemies(dt, events) {
    const p = state.player;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const def = ENEMY_KINDS[e.kind];
      e.flash = Math.max(0, e.flash - dt);
      // Still Light: a frozen shadow stands harmless until it thaws.
      if (e.frozen > 0) {
        e.frozen -= dt;
        continue;
      }
      // Frost rounds: a chilled shadow moves at a fraction of its speed.
      if (e.slowT > 0) e.slowT -= dt;
      // Time Stop: every shadow freezes in place — no movement, no attacks,
      // no orbs. Their own timers (frozen, slow) still tick down above, so
      // a stop never extends a freeze.
      if (state.timeStop > 0) continue;
      const moveSpeed = e.speed * (e.slowT > 0 ? (e.slowMul ?? 1) : 1);
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      if (e.kind === 'skitter') {
        e.wobbleT += dt;
        const wob = Math.sin(e.wobbleT * 4) * 0.55;
        const mx = nx - ny * wob;
        const my = ny + nx * wob;
        const len = Math.hypot(mx, my) || 1;
        e.x += (mx / len) * moveSpeed * dt;
        e.y += (my / len) * moveSpeed * dt;
      } else if (e.kind === 'spitter' || e.kind === 'lobber' || e.kind === 'sniper') {
        if (dist > def.standOff + 40) {
          e.x += nx * moveSpeed * dt;
          e.y += ny * moveSpeed * dt;
        } else if (dist < def.standOff - 40) {
          e.x -= nx * moveSpeed * dt;
          e.y -= ny * moveSpeed * dt;
        } else {
          e.x += -ny * moveSpeed * 0.5 * dt;
          e.y += nx * moveSpeed * 0.5 * dt;
        }
        e.shootT -= dt;
        // A Sniper fires one fast, precise bolt from far away; the others
        // turn bullet-hell at high waves, fanning their orbs.
        const shootRange = e.kind === 'sniper' ? (def.shootRange ?? 520) : 520;
        if (e.shootT <= 0 && dist < shootRange) {
          const pace = Math.max(0.55, 1 - state.wave * 0.03);
          e.shootT = def.shootEvery * pace * random.range(0.9, 1.15);
          const count = e.kind === 'sniper' ? 1 : state.wave >= 8 ? 3 : state.wave >= 6 ? 2 : 1;
          const base = Math.atan2(dy, dx);
          for (let i = 0; i < count; i += 1) {
            const a = base + (i - (count - 1) / 2) * 0.18;
            state.orbs.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(a) * def.orbSpeed,
              vy: Math.sin(a) * def.orbSpeed,
              radius: def.orbRadius,
              life: 4,
            });
          }
          events.push('spit');
        }
      } else if (e.kind === 'dasher') {
        // A Dasher stalks slowly, winds up (flashing, telegraphing the
        // lunge), then lunges at the keeper at several times its pace.
        if (e.dashT > 0) {
          e.dashT -= dt;
          e.x += nx * moveSpeed * (def.lungeSpeed ?? 3.2) * dt;
          e.y += ny * moveSpeed * (def.lungeSpeed ?? 3.2) * dt;
        } else if (e.lungeWindup > 0) {
          e.lungeWindup -= dt;
          e.flash = Math.max(e.flash, 0.05);
          if (e.lungeWindup <= 0) e.dashT = def.lungeDash ?? 0.35;
        } else {
          e.x += nx * moveSpeed * dt;
          e.y += ny * moveSpeed * dt;
          e.lungeT -= dt;
          if (e.lungeT <= 0 && dist < (def.lungeRange ?? 280)) {
            e.lungeWindup = def.lungeWindup ?? 0.4;
            e.lungeT = 2 + random.range(0, 0.5);
          }
        }
      } else {
        e.x += nx * moveSpeed * dt;
        e.y += ny * moveSpeed * dt;
      }
      // A boss fights with its base kind's movement plus its own tricks.
      if (e.boss) stepBoss(e, dt, events);
      e.x = Math.max(10, Math.min(FIELD.width - 10, e.x));
      e.y = Math.max(10, Math.min(FIELD.height - 10, e.y));
      const pdx = p.x - e.x;
      const pdy = p.y - e.y;
      const touch = e.radius + PLAYER.radius - 2;
      if (pdx * pdx + pdy * pdy < touch * touch) {
        hurtPlayer(e.damage, events);
        const push = 26;
        e.x -= nx * push;
        e.y -= ny * push;
        if (state.waveState === 'over') return;
      }
    }
  }

  function stepPickups(dt, events) {
    const p = state.player;
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      pk.life -= dt;
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (pk.kind === 'coin') {
        // Coins drift to the keeper once inside the loot radius — a generous
        // pull, so nobody has to hug each coin to collect it.
        if (dist < p.lootRadius) {
          pk.x += (dx / dist) * 300 * dt;
          pk.y += (dy / dist) * 300 * dt;
        }
        const d2 = Math.hypot(p.x - pk.x, p.y - pk.y);
        let taken = pk.life <= 0;
        if (!taken && d2 < PLAYER.radius + 14) {
          taken = true;
          const value = Math.max(1, Math.round(pk.value * p.coinMul));
          state.coins += value;
          state.coinsCollected += value;
          // The same drop feeds the level gauge as well as the purse.
          addXp(value, events);
          state.score += value;
          floater(p.x, p.y - 24, `+${value} coins`, '#ffd98a');
          events.push('coin');
        }
        if (taken) state.pickups.splice(i, 1);
        continue;
      }
      if (pk.kind === 'magnet') {
        if (dist < p.lanternRadius * 0.7) {
          pk.x += (dx / dist) * 220 * dt;
          pk.y += (dy / dist) * 220 * dt;
        }
        const d2 = Math.hypot(p.x - pk.x, p.y - pk.y);
        let taken = pk.life <= 0;
        if (!taken && d2 < PLAYER.radius + 16) {
          taken = true;
          // The loot-all tool sweeps every coin on the field at once.
          let sum = 0;
          for (let j = state.pickups.length - 1; j >= 0; j -= 1) {
            if (state.pickups[j].kind === 'coin') {
              sum += Math.max(1, Math.round(state.pickups[j].value * p.coinMul));
              state.pickups.splice(j, 1);
              if (j < i) i -= 1;
            }
          }
          state.coins += sum;
          state.coinsCollected += sum;
          // The swept coins feed the level gauge too.
          addXp(sum, events);
          state.score += sum;
          burst(p.x, p.y, '#ffd700', 18, 200);
          floater(p.x, p.y - 24, sum > 0 ? `Magnet! +${sum} coins` : 'Magnet!', '#ffd700');
          events.push('pickup');
        }
        if (taken) state.pickups.splice(i, 1);
        continue;
      }
      if (dist < p.lanternRadius * 0.7) {
        pk.x += (dx / dist) * 220 * dt;
        pk.y += (dy / dist) * 220 * dt;
      }
      let taken = pk.life <= 0;
      if (!taken && dist < PLAYER.radius + 16) {
        taken = true;
        if (pk.kind === 'heart') {
          p.hp = Math.min(p.maxHp, p.hp + 1);
          floater(p.x, p.y - 24, '+1 heart', '#ff6b81');
        } else if (pk.kind === 'shield') {
          p.shieldUntil = state.time + 3;
          floater(p.x, p.y - 24, 'Shield!', '#7dd7ff');
        } else if (pk.kind === 'rapid') {
          p.rapidUntil = state.time + 5;
          floater(p.x, p.y - 24, 'Rapid fire!', '#ffe066');
        } else if (pk.kind === 'timestop') {
          // Time Stop: every shadow and every projectile freezes for 5
          // seconds. It does not stack — picking another hourglass while
          // one is already active does nothing extra (no extension).
          if (state.timeStop <= 0) {
            state.timeStop = 5;
            floater(p.x, p.y - 24, 'TIME STOP!', '#8ac8ff');
            burst(p.x, p.y, '#8ac8ff', 20, 200);
            events.push('timeStop');
          } else {
            floater(p.x, p.y - 24, 'Time is already stopped', '#8ac8ff');
          }
        } else {
          state.score += 50;
          floater(p.x, p.y - 24, '+50', '#ffd98a');
        }
        events.push('pickup');
      }
      if (taken) state.pickups.splice(i, 1);
    }
  }

  function stepSpawning(dt) {
    if (state.waveState !== 'fighting') return;
    state.spawnTimer -= dt;
    if (state.spawnTimer > 0) return;
    const queue = state.spawnQueue;
    // Spawn in roster order, so the new kinds join the mix as they unlock.
    for (const kind of Object.keys(ENEMY_KINDS)) {
      if ((queue[kind] ?? 0) > 0) {
        queue[kind] -= 1;
        spawnEnemy(kind);
        state.spawnTimer = spawnInterval(state.wave);
        return;
      }
    }
  }

  function offerUpgrades() {
    return offerCards(state, random);
  }

  const world = {
    state,
    reset() {
      state.player = freshPlayer();
      state.bullets = [];
      state.orbs = [];
      state.enemies = [];
      state.particles = [];
      state.pickups = [];
      state.floaters = [];
      state.embers = freshEmbers();
      state.wave = 0;
      state.waveState = 'title';
      state.endless = false;
      state.score = 0;
      state.kills = 0;
      state.time = 0;
      state.shake = 0;
      state.banner = '';
      state.bannerTime = 0;
      // The keeper's ultimate is innate: they start the run with their own,
      // at level I. Its upgrade card can appear in any wave's offer.
      const char = CHARACTER_DEFS[state.character] ?? CHARACTER_DEFS.ember;
      state.upgradesTaken = { [char.ultimate]: 1 };
      state.ultimates = [char.ultimate];
      state.coins = 0;
      state.coinsCollected = 0;
      state.shopOffer = [];
      state.cardPicked = false;
      state.pickedId = null;
      state.bossReward = [];
      state.refreshesUsed = 0;
      state.freeRefreshes = 0;
      state.shotsFired = 0;
      state.hits = 0;
      state.orbitPos = null;
      state.lantern = 0;
      state.flash = 0;
      state.timeStop = 0;
      state.rings = [];
      state.frost = 0;
      state.spawnQueue = { skitter: 0, spitter: 0, brute: 0, lobber: 0, dasher: 0, splitter: 0, shieldbearer: 0, sniper: 0 };
      state.spawnTimer = 0;
      state.offer = [];
    },
    /** After dawn, waves keep coming with no second victory screen. */
    setEndless(value) {
      state.endless = value;
    },
    /** Pick a keeper for the next run; the title screen calls this. */
    selectCharacter(id) {
      if (CHARACTER_DEFS[id]) state.character = id;
    },
    /** Begin wave n (1-based): fill the spawn queue and raise the banner. */
    beginWave(n) {
      state.wave = n;
      state.spawnQueue = waveComposition(n);
      state.spawnTimer = 0.6;
      state.waveState = 'fighting';
      state.banner = n === 1 ? 'Night falls — Wave 1' : `Wave ${n}`;
      state.bannerTime = 2.2;
      // A fresh wave: the offer may be re-rolled up to 3 times, and the
      // Second Look card hands out its free re-rolls for this wave.
      state.refreshesUsed = 0;
      state.freeRefreshes = state.upgradesTaken.refresh ?? 0;
      state.bossReward = [];
      // One boss per wave, stepping in with the regular shadows.
      spawnBoss(n);
      // v2: a warded keeper starts each wave shielded.
      const p = state.player;
      if (p.wardLevel > 0) p.shieldUntil = state.time + 2 * p.wardLevel;
    },
    /** The four cards offered between waves. */
    offerUpgrades,
    /** Take a card: raise its level and apply that level's effect. */
    applyUpgrade(id) {
      applyCard(state, id);
    },
    /**
     * Re-roll the card offer with coins (or a free refresh): 'ok' when the
     * offer was re-drawn, 'picked' once a card is chosen, 'maxed' past 3
     * refreshes in the wave, 'coins' when the purse is too light.
     */
    refreshOffer() {
      if (state.cardPicked) return 'picked';
      if (state.refreshesUsed >= REFRESH_MAX) return 'maxed';
      const price = REFRESH_PRICES[state.refreshesUsed];
      if (state.freeRefreshes <= 0 && state.coins < price) return 'coins';
      if (state.freeRefreshes > 0) state.freeRefreshes -= 1;
      else state.coins -= price;
      state.refreshesUsed += 1;
      state.offer = offerUpgrades();
      return 'ok';
    },
    /** The shop's current items (recomputed from the keeper's purse). */
    offerShop() {
      return offerShop(state);
    },
    /** Buy one shop item by its key; true when the purchase landed. */
    buyShopItem(key) {
      return buyShopItem(state, key);
    },
    /**
     * Feed XP straight into the keeper's gauge (a test hook and a debug
     * handle); returns how many levels were gained.
     */
    addXp(amount) {
      return addXp(amount, []);
    },
    /** Drift the background embers; used on the title screen. */
    stepAmbient(dt) {
      state.time += dt;
      for (const e of state.embers) {
        e.y -= e.vy * dt;
        e.sway += dt;
        e.x += Math.sin(e.sway) * 8 * dt;
        e.twinkle += dt * 2;
        if (e.y < -6) {
          e.y = FIELD.height + 6;
          e.x = random.range(0, FIELD.width);
        }
      }
    },
    /**
     * Advance the fight one fixed step. `input` is { move: {x, y}, aim: {x, y}
     * in field coordinates, firing: boolean — v2 ignores firing, the lantern
     * shoots on its own }. Returns the sound/event names raised this step
     * (shoot, enemyHit, enemyDie, pickup, coin, hurt, spit, waveClear, win,
     * over, ult, bossDie, levelUp).
     */
    step(dt, input) {
      const events = [];
      const p = state.player;
      state.time += dt;
      state.shake = Math.max(0, state.shake - dt * 26);
      state.bannerTime = Math.max(0, state.bannerTime - dt);
      state.flash = Math.max(0, state.flash - dt);
    // Time Stop: the held time ticks down — when it reaches zero, the
    // shadows and their projectiles move again.
    state.timeStop = Math.max(0, state.timeStop - dt);
      p.invulnerable = Math.max(0, p.invulnerable - dt);
      // Aegis shield recharges while the keeper fights.
      if (!p.shieldReady && p.shieldRecharge > 0) {
        p.shieldTimer -= dt;
        if (p.shieldTimer <= 0) p.shieldReady = true;
      }
      // Second Wind: five quiet seconds, then the keeper starts mending.
      if (p.secondWindRate > 0 && state.time - p.hurtAt >= 5 && p.hp < p.maxHp) {
        p.regenAcc += dt;
        if (p.regenAcc >= p.secondWindRate) {
          p.regenAcc = 0;
          p.hp += 1;
          floater(p.x, p.y - 24, '+1 heart', '#ff6b81');
        }
      }

      p.aim = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
      p.x = Math.max(20, Math.min(FIELD.width - 20, p.x + input.move.x * p.speed * dt));
      p.y = Math.max(20, Math.min(FIELD.height - 20, p.y + input.move.y * p.speed * dt));
      // v2: auto-fire — the lantern shoots on its own while the fight runs.
      // The player's click / Space still counts as firing input, harmlessly.
      if (state.waveState === 'fighting') fireWeapons(dt, events);
      // Q, with a full lantern, fires every ultimate the keeper owns.
      if (state.waveState === 'fighting' && input.ult && state.lantern >= 100 && state.ultimates.length > 0) {
        ultCtx.events = events;
        for (const id of state.ultimates) fireUltimate(ultCtx, id, state.upgradesTaken[id] ?? 1);
        state.lantern = 0;
        // The ultimate is the strongest shake in the game — nothing else
        // shakes this hard, so the player feels it above every other hit.
        state.shake = Math.min(14, state.shake + 12);
        floater(p.x, p.y - 24, 'ULTIMATE!', '#ffd700');
        events.push('ult');
      }

      stepSpawning(dt);
      stepEnemies(dt, events);
      if (state.waveState === 'over') return events;
      stepHalo(dt, events);
      stepOrbit(dt, events);
      stepBullets(dt, events);
      stepOrbs(dt, events);
      stepPickups(dt, events);

      for (let i = state.particles.length - 1; i >= 0; i -= 1) {
        const pt = state.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= 0.96;
        pt.vy *= 0.96;
        pt.life -= dt;
        if (pt.life <= 0) state.particles.splice(i, 1);
      }
      // An expanding ring grows toward its max radius and fades; the frost
      // wash fades over its own timer. Both are pure spectacle.
      for (let i = state.rings.length - 1; i >= 0; i -= 1) {
        const r = state.rings[i];
        r.life -= dt;
        const f = 1 - r.life / r.maxLife;
        r.r = 12 + (r.maxR - 12) * f * f;
        if (r.life <= 0) state.rings.splice(i, 1);
      }
      state.frost = Math.max(0, state.frost - dt);
      for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
        const f = state.floaters[i];
        f.y -= 34 * dt;
        f.life -= dt;
        if (f.life <= 0) state.floaters.splice(i, 1);
      }
      for (const e of state.embers) {
        e.y -= e.vy * dt;
        e.sway += dt;
        e.x += Math.sin(e.sway) * 8 * dt;
        e.twinkle += dt * 2;
        if (e.y < -6) {
          e.y = FIELD.height + 6;
          e.x = random.range(0, FIELD.width);
        }
      }

      if (state.waveState === 'fighting') {
        const queue = state.spawnQueue;
        const pending = Object.values(queue).reduce((a, b) => a + (b ?? 0), 0);
        if (pending === 0 && state.enemies.length === 0) {
          if (state.wave >= WIN_WAVE && !state.endless) {
            state.waveState = 'won';
            state.score += 500;
            events.push('win');
          } else {
            state.waveState = 'upgrade';
            // Boss waves (5, 10, 15, ...): beating the boss grants 3 free
            // random cards, applied on the spot and shown on the upgrade
            // screen. The offer below is drawn after, so it reflects them.
            if (state.wave % 5 === 0) {
              const reward = drawRewardCards(state, random, 3);
              state.bossReward = reward.map((c) => ({ id: c.id, name: c.name, level: c.level + 1, max: c.max }));
              for (const c of reward) applyCard(state, c.id);
            } else {
              state.bossReward = [];
            }
            state.offer = offerUpgrades();
            // v2: the shop opens beside the card pick, and clearing a wave
            // pays a coin bonus on top of what fell.
            state.shopOffer = offerShop(state);
            state.cardPicked = false;
            state.pickedId = null;
            state.coins += WAVE_CLEAR_COINS;
            // The wave bonus feeds the level gauge like any coin income.
            addXp(WAVE_CLEAR_COINS, events);
            floater(p.x, p.y - 24, `Wave bonus +${WAVE_CLEAR_COINS} coins`, '#ffd98a');
            state.score += 100;
            events.push('waveClear');
          }
        }
      }
      return events;
    },
  };

  world.reset();
  return world;
}
