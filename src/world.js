// Emberlight's simulation: one wisp, a lantern, and the shadows that come for
// it. Everything here is pure numbers and the seeded random source — no DOM, no
// sound, no canvas — so a screenshot scene can play the real rules forward and
// land on the same frame every time.
//
// Waves: each wave spawns a mix of three shadow kinds; clearing a wave opens
// the upgrade choice; clearing wave 10 breaks the dawn and wins the night.

import {
  BULLET,
  DROPS,
  ENEMY_KINDS,
  FIELD,
  PLAYER,
  UPGRADES,
  WIN_WAVE,
  spawnInterval,
  waveComposition,
} from './config.js';

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
    shotsFired: 0,
    hits: 0,
  };

  function freshPlayer() {
    return {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      speed: PLAYER.speed,
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
    state.floaters.push({ x, y, text, color, life: 0.9 });
  }

  function spawnEnemy(kind) {
    const def = ENEMY_KINDS[kind];
    const at = spawnPoint(random);
    state.enemies.push({
      kind,
      x: at.x,
      y: at.y,
      hp: def.hp,
      maxHp: def.hp,
      radius: def.radius,
      speed: def.speed * random.range(0.9, 1.1),
      damage: def.damage,
      score: def.score,
      wobbleT: random.range(0, def.wobble ?? 1),
      shootT: random.range(1, def.shootEvery ?? 2),
      flash: 0,
      born: state.time,
    });
    burst(at.x, at.y, '#6a5acd', 6, 60);
  }

  function dropRoll(x, y) {
    for (const [kind, chance] of DROPS) {
      if (random.chance(chance)) {
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
    state.shake = Math.min(10, state.shake + (e.kind === 'brute' ? 6 : 2));
    burst(e.x, e.y, '#8a7bd8', e.kind === 'brute' ? 22 : 10, 170);
    burst(e.x, e.y, '#ffb347', 6, 120);
    floater(e.x, e.y - 10, `+${e.score}`, '#ffd98a');
    dropRoll(e.x, e.y);
    events.push('enemyDie');
  }

  function hurtPlayer(damage, events) {
    const p = state.player;
    if (p.invulnerable > 0 || state.time < p.shieldUntil) return;
    p.hp -= damage;
    p.invulnerable = PLAYER.invulnerable;
    state.shake = Math.min(14, state.shake + 8);
    burst(p.x, p.y, '#ff5d73', 14, 200);
    events.push('hurt');
    if (p.hp <= 0) {
      p.hp = 0;
      state.waveState = 'over';
      burst(p.x, p.y, '#ffd98a', 40, 260);
      events.push('over');
    }
  }

  function fireBolts(events) {
    const p = state.player;
    const rate = state.time < p.rapidUntil ? p.fireRate * 2 : p.fireRate;
    if (p.fireCooldown > 0) return;
    p.fireCooldown = 1 / rate;
    state.shotsFired += 1;
    const spread = 0.14;
    const n = p.shots;
    for (let i = 0; i < n; i += 1) {
      const off = (i - (n - 1) / 2) * spread;
      const a = p.aim + off;
      state.bullets.push({
        x: p.x + Math.cos(a) * 22,
        y: p.y + Math.sin(a) * 22,
        vx: Math.cos(a) * BULLET.speed,
        vy: Math.sin(a) * BULLET.speed,
        radius: BULLET.radius,
        damage: p.damage,
        pierce: p.pierce,
        life: BULLET.life,
      });
    }
    events.push('shoot');
  }

  function stepBullets(dt, events) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const e = state.enemies[j];
          const dx = e.x - b.x;
          const dy = e.y - b.y;
          if (dx * dx + dy * dy < (e.radius + b.radius) * (e.radius + b.radius)) {
            e.hp -= b.damage;
            e.flash = 0.12;
            state.hits += 1;
            burst(b.x, b.y, '#ffe9a8', 4, 90);
            events.push('enemyHit');
            if (e.hp <= 0) killEnemy(j, events);
            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              dead = true;
            }
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
  }

  function stepOrbs(dt, events) {
    const p = state.player;
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const o = state.orbs[i];
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.life -= dt;
      let dead = o.life <= 0 || o.x < -20 || o.x > FIELD.width + 20 || o.y < -20 || o.y > FIELD.height + 20;
      if (!dead) {
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
        e.x += (mx / len) * e.speed * dt;
        e.y += (my / len) * e.speed * dt;
      } else if (e.kind === 'spitter') {
        if (dist > def.standOff + 40) {
          e.x += nx * e.speed * dt;
          e.y += ny * e.speed * dt;
        } else if (dist < def.standOff - 40) {
          e.x -= nx * e.speed * dt;
          e.y -= ny * e.speed * dt;
        } else {
          e.x += -ny * e.speed * 0.5 * dt;
          e.y += nx * e.speed * 0.5 * dt;
        }
        e.shootT -= dt;
        if (e.shootT <= 0 && dist < 520) {
          e.shootT = def.shootEvery * random.range(0.9, 1.15);
          state.orbs.push({
            x: e.x,
            y: e.y,
            vx: nx * def.orbSpeed,
            vy: ny * def.orbSpeed,
            radius: def.orbRadius,
            life: 4,
          });
          events.push('spit');
        }
      } else {
        e.x += nx * e.speed * dt;
        e.y += ny * e.speed * dt;
      }
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
    const kinds = ['skitter', 'spitter', 'brute'];
    for (const kind of kinds) {
      if (queue[kind] > 0) {
        queue[kind] -= 1;
        spawnEnemy(kind);
        state.spawnTimer = spawnInterval(state.wave);
        return;
      }
    }
  }

  function offerUpgrades() {
    const taken = state.upgradesTaken;
    const pool = UPGRADES.filter((u) => (taken[u.id] ?? 0) < u.max);
    const picks = [];
    while (picks.length < 3 && pool.length > 0) {
      const index = random.int(0, pool.length - 1);
      picks.push(pool.splice(index, 1)[0]);
    }
    return picks;
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
      state.upgradesTaken = {};
      state.shotsFired = 0;
      state.hits = 0;
      state.spawnQueue = { skitter: 0, spitter: 0, brute: 0 };
      state.spawnTimer = 0;
      state.offer = [];
    },
    /** After dawn, waves keep coming with no second victory screen. */
    setEndless(value) {
      state.endless = value;
    },
    /** Begin wave n (1-based): fill the spawn queue and raise the banner. */
    beginWave(n) {
      state.wave = n;
      state.spawnQueue = waveComposition(n);
      state.spawnTimer = 0.6;
      state.waveState = 'fighting';
      state.banner = n === 1 ? 'Night falls — Wave 1' : `Wave ${n}`;
      state.bannerTime = 2.2;
    },
    /** The three cards offered between waves. */
    offerUpgrades,
    applyUpgrade(id) {
      const p = state.player;
      state.upgradesTaken[id] = (state.upgradesTaken[id] ?? 0) + 1;
      if (id === 'flame') p.damage *= 1.25;
      else if (id === 'wick') p.fireRate *= 1.2;
      else if (id === 'feet') p.speed *= 1.12;
      else if (id === 'glass') {
        p.maxHp += 1;
        p.hp = Math.min(p.maxHp, p.hp + 1);
      } else if (id === 'twin') p.shots += 1;
      else if (id === 'pierce') p.pierce += 1;
      else if (id === 'glow') p.lanternRadius *= 1.2;
      else if (id === 'ember') p.hp = Math.min(p.maxHp, p.hp + 2);
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
     * in field coordinates, firing: boolean }. Returns the sound/event names
     * raised this step (shoot, enemyHit, enemyDie, pickup, hurt, spit,
     * waveClear, win, over).
     */
    step(dt, input) {
      const events = [];
      const p = state.player;
      state.time += dt;
      state.shake = Math.max(0, state.shake - dt * 26);
      state.bannerTime = Math.max(0, state.bannerTime - dt);
      p.fireCooldown = Math.max(0, p.fireCooldown - dt);
      p.invulnerable = Math.max(0, p.invulnerable - dt);

      p.aim = Math.atan2(input.aim.y - p.y, input.aim.x - p.x);
      p.x = Math.max(20, Math.min(FIELD.width - 20, p.x + input.move.x * p.speed * dt));
      p.y = Math.max(20, Math.min(FIELD.height - 20, p.y + input.move.y * p.speed * dt));
      if (input.firing) fireBolts(events);

      stepSpawning(dt);
      stepEnemies(dt, events);
      if (state.waveState === 'over') return events;
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
        const pending = queue.skitter + queue.spitter + queue.brute;
        if (pending === 0 && state.enemies.length === 0) {
          if (state.wave >= WIN_WAVE && !state.endless) {
            state.waveState = 'won';
            state.score += 500;
            events.push('win');
          } else {
            state.waveState = 'upgrade';
            state.offer = offerUpgrades();
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
