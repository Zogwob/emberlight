// Emberlight v2 — the arsenal. The keeper starts with Light Bolts and can hold
// more than one weapon: new ones are bought in the shop between waves, and
// every weapon levels up to III. Each weapon fires on its own cooldown; the
// world ticks those cooldowns and asks each ready weapon to fire. Damage and
// rate here are before the keeper's global multipliers (Overcharge, Quick
// Wick), which the card pool raises.

import { BULLET } from './config.js';

/** Every weapon the keeper can hold, in the order the shop lists them. */
export const WEAPON_DEFS = {
  bolts: {
    id: 'bolts',
    name: 'Light Bolts',
    text: 'The keeper’s own lantern bolts.',
    maxLevel: 3,
  },
  spread: {
    id: 'spread',
    name: 'Ember Fan',
    text: 'A wide fan of embers.',
    basePrice: 40,
    maxLevel: 3,
    icon: 'fan',
  },
  blades: {
    id: 'blades',
    name: 'Lantern Ring',
    text: 'Blades that orbit the keeper.',
    basePrice: 55,
    maxLevel: 3,
    icon: 'ring',
  },
  rifle: {
    id: 'rifle',
    name: 'Ember Rifle',
    text: 'Rapid fire, steady aim.',
    basePrice: 50,
    maxLevel: 3,
    icon: 'chevrons',
  },
  sniper: {
    id: 'sniper',
    name: 'Longshot',
    text: 'Slow, heavy, pierces through.',
    basePrice: 70,
    maxLevel: 3,
    icon: 'crosshair',
  },
  grenade: {
    id: 'grenade',
    name: 'Grenade Launcher',
    text: 'Lobbed shells, wide splash.',
    basePrice: 65,
    maxLevel: 3,
    icon: 'bomb',
  },
  rpg: {
    id: 'rpg',
    name: 'Dawn Rocket',
    text: 'One big rocket, huge blast.',
    basePrice: 90,
    maxLevel: 3,
    icon: 'rocket',
  },
  // The keeper's own light: granted at the start of the run, never bought
  // in the shop (basePrice 0) — but the keeper themself can be raised there,
  // which grows their light. The three lights are different forms, so no
  // keeper ever sees another's light on offer.
  sunfan: {
    id: 'sunfan',
    name: 'Sun Fan',
    text: 'A wide fan of dawn bolts.',
    basePrice: 0,
    maxLevel: 3,
    icon: 'fan',
    signature: 'ember',
  },
  lance: {
    id: 'lance',
    name: 'Blood Lance',
    text: 'One heavy piercing lance.',
    basePrice: 0,
    maxLevel: 3,
    icon: 'lance',
    signature: 'crimson',
  },
  glacier: {
    id: 'glacier',
    name: 'Glacier Shell',
    text: 'A freezing blast shell.',
    basePrice: 0,
    maxLevel: 3,
    icon: 'bomb',
    signature: 'azure',
  },
};

/** Coins to buy a weapon (level 0) or raise it one level. */
export function weaponPrice(id, level) {
  const table = {
    spread: [40, 30, 55],
    blades: [55, 35, 60],
    rifle: [50, 30, 55],
    sniper: [70, 40, 70],
    grenade: [65, 35, 60],
    rpg: [90, 45, 75],
    sunfan: [0, 30, 55],
    lance: [0, 40, 70],
    glacier: [0, 35, 60],
  };
  return table[id]?.[level] ?? 0;
}

/**
 * A weapon's fighting numbers at its level, before global multipliers.
 * Bolts read the keeper's own stats (the old damage / fire rate / shots /
 * pierce), so the bolt cards still work on them; the other weapons scale
 * with their own level, plus any card bonus the weapon instance carries.
 */
export function weaponStats(id, level, player, weapon) {
  const bonusDmg = weapon?.bonusDmg ?? 0;
  const bonusCount = weapon?.bonusCount ?? 0;
  // Bullet-spread cards add projectiles to every bullet weapon.
  const extra = player.bonusProjectiles ?? 0;
  if (id === 'bolts') {
    return { damage: player.damage, rate: player.fireRate, count: player.shots + extra, pierce: player.pierce };
  }
  if (id === 'spread') {
    return { damage: 1 + bonusDmg, rate: 1.5 + 0.2 * (level - 1), count: 2 + level + bonusCount + extra, pierce: player.pierce };
  }
  if (id === 'rifle') {
    // Assault rifle: many fast shots, a tight cone, a third bolt at Lv III.
    return {
      damage: 1 + bonusDmg,
      rate: (6 + 0.5 * (level - 1)) * (weapon?.bonusRate ?? 1),
      count: 1 + (level >= 3 ? 1 : 0) + bonusCount + extra,
      pierce: player.pierce,
    };
  }
  if (id === 'sniper') {
    // Longshot: one slow, heavy, piercing shot per pull.
    return { damage: 3 + 2 * level + bonusDmg, rate: 0.9, count: 1 + extra, pierce: 1 + level };
  }
  if (id === 'grenade') {
    // Grenade launcher: a lobbed shell that bursts on impact.
    return {
      damage: 2 + level + bonusDmg,
      rate: 1.1,
      count: 1 + (level >= 3 ? 1 : 0) + bonusCount,
      pierce: 0,
      splash: (70 + 20 * (level - 1)) * (weapon?.bonusSplash ?? 1),
    };
  }
  if (id === 'rpg') {
    // Dawn Rocket: the slowest trigger, the biggest blast.
    return { damage: 4 + 2 * level + bonusDmg, rate: 0.6, count: 1, pierce: 0, splash: 110 + 15 * (level - 1) };
  }
  if (id === 'sunfan') {
    // Ember's signature: a wide fan of dawn bolts, wider than the Ember Fan.
    return {
      damage: 1 + bonusDmg,
      rate: 1.6 + 0.2 * (level - 1),
      count: 3 + level + bonusCount + extra,
      pierce: player.pierce,
    };
  }
  if (id === 'lance') {
    // Crimson's signature: one heavy lance that pierces a whole line.
    return { damage: 6 + 2 * level + bonusDmg, rate: 0.7, count: 1 + extra, pierce: 4 + level };
  }
  if (id === 'glacier') {
    // Azure's signature: a freezing shell — big splash, and it chills.
    return {
      damage: 3 + level + bonusDmg,
      rate: 0.9,
      count: 1 + bonusCount,
      pierce: 0,
      splash: 90 + 15 * (level - 1),
    };
  }
  // Blades: count is the number of orbiting blades, damage is per hit.
  return { damage: (level >= 3 ? 2 : 1) + bonusDmg, rate: 1, count: 1 + level + bonusCount, pierce: 0 };
}

/** True when the keeper already holds this weapon. */
export function ownsWeapon(state, id) {
  return state.player.weapons.some((w) => w.id === id);
}

/** Give the keeper a new weapon at level I, ready to fire. */
export function addWeapon(state, id) {
  state.player.weapons.push({ id, level: 1, cooldown: 0 });
}

function spawnBolt(state, x, y, angle, damage, pierce, opts = {}) {
  const speed = (opts.speed ?? BULLET.speed) * (state.player.bulletSpeedMul ?? 1);
  // Range is a real keeper stat: the keeper's reach stretches every shot.
  const life = (opts.life ?? BULLET.life) * (state.player.rangeMul ?? 1);
  state.bullets.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: opts.radius ?? BULLET.radius,
    damage,
    pierce,
    life,
    splash: opts.splash ?? 0,
    kind: opts.kind ?? 'bolt',
  });
}

/**
 * Fire one weapon once, if its cooldown is ready. Bolts and the fan shoot
 * bolts in a fan around the keeper's aim; the ring tops its orbit up to its
 * full count of blades, spaced evenly. Returns true when it fired.
 */
export function fireWeapon(state, weapon, events) {
  const p = state.player;
  if (weapon.cooldown > 0) return false;
  const stats = weaponStats(weapon.id, weapon.level, p, weapon);
  // Damage stays a float: a +25% bonus on 1 damage must not round back to 1.
  const dmg = Math.max(0.5, stats.damage * p.dmgMul);
  const rate = stats.rate * p.rateMul * (state.time < p.rapidUntil ? 2 : 1);
  weapon.cooldown = 1 / rate;

  if (weapon.id === 'blades') {
    const live = state.bullets.filter((b) => b.orbit).length;
    const want = stats.count;
    for (let i = live; i < want; i += 1) {
      const angle = (i / want) * Math.PI * 2;
      state.bullets.push({
        orbit: true,
        angle,
        orbitRadius: 95,
        orbitSpeed: 2.6,
        x: p.x + Math.cos(angle) * 95,
        y: p.y + Math.sin(angle) * 95,
        vx: 0,
        vy: 0,
        radius: 8,
        damage: dmg,
        life: 3600,
      });
    }
    events.push('shoot');
    return true;
  }

  // Shells and rockets burst on impact; the other bullet weapons fan out.
  if (weapon.id === 'grenade' || weapon.id === 'rpg' || weapon.id === 'glacier') {
    const shellSpeed = weapon.id === 'grenade' ? 380 : weapon.id === 'glacier' ? 420 : 520;
    const shellRadius = weapon.id === 'grenade' ? 10 : weapon.id === 'glacier' ? 11 : 12;
    const n = stats.count;
    for (let i = 0; i < n; i += 1) {
      const off = (i - (n - 1) / 2) * 0.12;
      const a = p.aim + off;
      spawnBolt(state, p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, a, dmg, 0, {
        speed: shellSpeed,
        radius: shellRadius,
        splash: stats.splash,
        kind: weapon.id,
        life: 1.6,
      });
    }
    state.shotsFired += 1;
    events.push('shoot');
    return true;
  }

  const spread = weapon.id === 'spread' ? 0.42 : weapon.id === 'sunfan' ? 0.5 : weapon.id === 'rifle' ? 0.08 : weapon.id === 'sniper' ? 0 : 0.14;
  const n = stats.count;
  for (let i = 0; i < n; i += 1) {
    const off = (i - (n - 1) / 2) * spread;
    const a = p.aim + off;
    const opts = {};
    if (weapon.id === 'sniper' || weapon.id === 'lance') {
      opts.speed = weapon.id === 'lance' ? 950 : 1100;
      opts.radius = weapon.id === 'lance' ? 6 : 4;
      opts.kind = weapon.id;
      opts.life = 1.4;
    } else if (weapon.id === 'rifle') {
      opts.speed = 780;
      opts.kind = 'rifle';
    } else if (weapon.id === 'sunfan') {
      // Ember's own fan: its bolts are bigger and brighter than plain ones.
      opts.kind = 'sunfan';
      opts.radius = 6;
    }
    spawnBolt(state, p.x + Math.cos(a) * 22, p.y + Math.sin(a) * 22, a, dmg, stats.pierce, opts);
  }
  state.shotsFired += 1;
  events.push('shoot');
  return true;
}
