// Emberlight v2 — the between-wave cards. Two kinds: weapon cards, which raise
// one weapon the keeper holds, and general cards in three categories —
// Survival, DPS, Sustain. Every card has three levels: taking a card the
// keeper already owns raises it one level (I -> II -> III); a card at level
// III never appears again. Four cards are offered between waves.
//
// At waves 5, 10 and 15 the offer also carries ultimate cards (two of the
// four slots, when any ultimate can still be taken or raised) beside general
// cards — never ultimates only.
//
// A card's `apply` runs once per take and applies that level's increment, so
// taking the same card three times stacks the same way the old upgrades did.

import { ULTIMATES } from './ultimates.js';
import { CHARACTER_DEFS } from './characters.js';

function weaponOf(state, id) {
  return state.player.weapons.find((w) => w.id === id) ?? null;
}

const DEFS = [
  // ---- General — Survival ----
  {
    id: 'glass', icon: 'vessel', kind: 'general', category: 'Survival', name: 'Sturdy Glass', max: 3,
    text: () => '+1 max heart, heal 1',
    apply: (state) => {
      const p = state.player;
      p.maxHp += 1;
      p.hp = Math.min(p.maxHp, p.hp + 1);
    },
  },
  {
    id: 'ward', icon: 'lantern', kind: 'general', category: 'Survival', name: 'Lantern Ward', max: 3,
    text: (level) => `Begin each wave shielded for ${2 * level}s`,
    apply: (state) => {
      state.player.wardLevel += 1;
    },
  },
  {
    id: 'feet', icon: 'wing', kind: 'general', category: 'Survival', name: 'Fleet Feet', max: 3,
    text: () => '+12% move speed',
    apply: (state) => {
      state.player.speed *= 1.12;
    },
  },
  // ---- General — DPS ----
  {
    id: 'overcharge', icon: 'star', kind: 'general', category: 'DPS', name: 'Overcharge', max: 3,
    text: () => '+15% damage, all weapons',
    apply: (state) => {
      state.player.dmgMul *= 1.15;
    },
  },
  {
    id: 'haste', icon: 'spark', kind: 'general', category: 'DPS', name: 'Quick Wick', max: 3,
    text: () => '+12% fire rate, all weapons',
    apply: (state) => {
      state.player.rateMul *= 1.12;
    },
  },
  {
    id: 'keen', icon: 'sword', kind: 'general', category: 'DPS', name: 'Keen Edge', max: 3,
    text: () => '+1 pierce, bolts and fan',
    apply: (state) => {
      state.player.pierce += 1;
    },
  },
  // ---- General — Sustain ----
  {
    id: 'loot', icon: 'net', kind: 'general', category: 'Sustain', name: 'Wide Net', max: 3,
    text: () => '+40% coin pickup radius',
    apply: (state) => {
      state.player.lootRadius *= 1.4;
    },
  },
  {
    id: 'ember', icon: 'potion', kind: 'general', category: 'Sustain', name: 'Ember Heart', max: 3,
    text: (level) => `Heal ${level} heart${level > 1 ? 's' : ''} now`,
    apply: (state, level) => {
      const p = state.player;
      p.hp = Math.min(p.maxHp, p.hp + level);
    },
  },
  {
    id: 'greed', icon: 'charm', kind: 'general', category: 'Sustain', name: 'Coin Charm', max: 3,
    text: () => '+25% coin value',
    apply: (state) => {
      state.player.coinMul *= 1.25;
    },
  },
  // ---- Weapon — Light Bolts (always available) ----
  {
    id: 'flame', icon: 'flame', kind: 'weapon', category: 'Weapon', name: 'Brighter Flame', max: 3,
    text: () => '+25% bolt damage',
    apply: (state) => {
      state.player.damage *= 1.25;
    },
  },
  {
    id: 'wick', icon: 'wick', kind: 'weapon', category: 'Weapon', name: 'Swift Wick', max: 3,
    text: () => '+20% bolt fire rate',
    apply: (state) => {
      state.player.fireRate *= 1.2;
    },
  },
  {
    id: 'twin', icon: 'twinbolt', kind: 'weapon', category: 'Weapon', name: 'Twin Sparks', max: 3,
    text: () => '+1 bolt per shot',
    apply: (state) => {
      state.player.shots += 1;
    },
  },
  // ---- Weapon — Ember Fan (only once owned) ----
  {
    id: 'fanFuel', icon: 'burst', kind: 'weapon', category: 'Weapon', name: 'Fan Fuel', max: 3,
    text: () => 'Fan +25% damage',
    requires: (state) => weaponOf(state, 'spread') !== null,
    apply: (state) => {
      const w = weaponOf(state, 'spread');
      if (w) w.bonusDmg = (w.bonusDmg ?? 0) + 0.25;
    },
  },
  {
    id: 'fanWide', icon: 'fan', kind: 'weapon', category: 'Weapon', name: 'Fan Wider', max: 3,
    text: () => 'Fan +1 bolt per shot',
    requires: (state) => weaponOf(state, 'spread') !== null,
    apply: (state) => {
      const w = weaponOf(state, 'spread');
      if (w) w.bonusCount = (w.bonusCount ?? 0) + 1;
    },
  },
  // ---- Weapon — Lantern Ring (only once owned) ----
  {
    id: 'bladeSharp', icon: 'blade', kind: 'weapon', category: 'Weapon', name: 'Sharper Ring', max: 3,
    text: () => 'Ring +1 damage',
    requires: (state) => weaponOf(state, 'blades') !== null,
    apply: (state) => {
      const w = weaponOf(state, 'blades');
      if (w) w.bonusDmg = (w.bonusDmg ?? 0) + 1;
    },
  },
  {
    id: 'bladeExtra', icon: 'ring', kind: 'weapon', category: 'Weapon', name: 'Extra Blade', max: 3,
    text: () => 'Ring +1 blade',
    requires: (state) => weaponOf(state, 'blades') !== null,
    apply: (state) => {
      const w = weaponOf(state, 'blades');
      if (w) w.bonusCount = (w.bonusCount ?? 0) + 1;
    },
  },
  // ---- Weapon — Ember Rifle (only once owned) ----
  {
    id: 'rapidBurst', icon: 'chevrons', kind: 'weapon', category: 'Weapon', name: 'Rapid Burst', max: 3,
    text: () => 'Rifle +15% fire rate',
    requires: (state) => weaponOf(state, 'rifle') !== null,
    apply: (state) => {
      const w = weaponOf(state, 'rifle');
      if (w) w.bonusRate = (w.bonusRate ?? 1) * 1.15;
    },
  },
  // ---- Weapon — Longshot (only once owned) ----
  {
    id: 'deadEye', icon: 'eye', kind: 'weapon', category: 'Weapon', name: 'Dead Eye', max: 3,
    text: () => 'Longshot +2 damage',
    requires: (state) => weaponOf(state, 'sniper') !== null,
    apply: (state) => {
      const w = weaponOf(state, 'sniper');
      if (w) w.bonusDmg = (w.bonusDmg ?? 0) + 2;
    },
  },
  // ---- Weapon — Grenade Launcher (only once owned) ----
  {
    id: 'bigBooms', icon: 'bomb', kind: 'weapon', category: 'Weapon', name: 'Big Booms', max: 3,
    text: () => 'Grenades +30% blast radius',
    requires: (state) => weaponOf(state, 'grenade') !== null,
    apply: (state) => {
      const w = weaponOf(state, 'grenade');
      if (w) w.bonusSplash = (w.bonusSplash ?? 1) * 1.3;
    },
  },
  // ---- Weapon — Dawn Rocket (only once owned) ----
  {
    id: 'warhead', icon: 'rocket', kind: 'weapon', category: 'Weapon', name: 'Warhead', max: 3,
    text: () => 'Rocket +2 damage',
    requires: (state) => weaponOf(state, 'rpg') !== null,
    apply: (state) => {
      const w = weaponOf(state, 'rpg');
      if (w) w.bonusDmg = (w.bonusDmg ?? 0) + 2;
    },
  },
  // ---- Keeper — the keeper's own light (only their keeper ever holds it) ----
  {
    id: 'sunFuel', icon: 'sunfan', kind: 'weapon', category: 'Keeper', name: 'Upgrade Ember', max: 3,
    text: () => "Ember's light +25% damage",
    requires: (state) => weaponOf(state, 'sunfan') !== null,
    apply: (state) => {
      const w = weaponOf(state, 'sunfan');
      if (w) w.bonusDmg = (w.bonusDmg ?? 0) + 0.25;
    },
  },
  {
    id: 'bloodEdge', icon: 'lance', kind: 'weapon', category: 'Keeper', name: 'Upgrade Crimson', max: 3,
    text: () => "Crimson's light +2 damage",
    requires: (state) => weaponOf(state, 'lance') !== null,
    apply: (state) => {
      const w = weaponOf(state, 'lance');
      if (w) w.bonusDmg = (w.bonusDmg ?? 0) + 2;
    },
  },
  {
    id: 'deepFreeze', icon: 'orb', kind: 'weapon', category: 'Keeper', name: 'Upgrade Azure', max: 3,
    text: () => "Azure's light +20% blast radius",
    requires: (state) => weaponOf(state, 'glacier') !== null,
    apply: (state) => {
      const w = weaponOf(state, 'glacier');
      if (w) w.bonusSplash = (w.bonusSplash ?? 1) * 1.2;
    },
  },
  // ---- Weapon — bullet cards (work on every bullet weapon) ----
  {
    id: 'wideShot', icon: 'arrow', kind: 'weapon', category: 'Weapon', name: 'Wide Shot', max: 3,
    text: () => '+1 projectile, bullet weapons',
    apply: (state) => {
      state.player.bonusProjectiles += 1;
    },
  },
  {
    id: 'swiftShot', icon: 'dart', kind: 'weapon', category: 'Weapon', name: 'Swift Shot', max: 3,
    text: () => '+20% bullet speed',
    apply: (state) => {
      state.player.bulletSpeedMul *= 1.2;
    },
  },
  // ---- General — Survival (new) ----
  {
    id: 'aegis', icon: 'shield', kind: 'general', category: 'Survival', name: 'Aegis Shield', max: 3,
    text: (level) => `Block a hit, recharges in ${10 - 2 * level}s`,
    apply: (state, level) => {
      const p = state.player;
      p.shieldRecharge = 10 - 2 * level;
      p.shieldReady = true;
      p.shieldTimer = 0;
    },
  },
  {
    id: 'frost', icon: 'icicle', kind: 'general', category: 'Survival', name: 'Frost Rounds', max: 3,
    text: (level) => `Hits slow shadows ${30 + 15 * (level - 1)}% for ${2 + 0.5 * (level - 1)}s`,
    apply: (state, level) => {
      state.player.slowOnHit = { mul: 1 - (0.3 + 0.15 * (level - 1)), dur: 2 + 0.5 * (level - 1) };
    },
  },
  {
    id: 'halo', icon: 'halo', kind: 'general', category: 'Survival', name: 'Burning Halo', max: 3,
    text: (level) => `Light burns shadows: ${level}/s within ${120 + 20 * level}px`,
    apply: (state, level) => {
      state.player.halo = { dps: level, radius: 120 + 20 * level };
    },
  },
  {
    id: 'orbit', icon: 'orbit', kind: 'general', category: 'Survival', name: 'Orbiting Light', max: 3,
    text: (level) => `A light orb circles you, hits for ${level}`,
    apply: (state, level) => {
      state.player.orbit = { level, angle: 0 };
    },
  },
  {
    id: 'mend', icon: 'moon', kind: 'general', category: 'Survival', name: 'Slow Mend', max: 3,
    text: (level) => `Regen 1 heart every ${5 - level}s after 5s calm`,
    apply: (state, level) => {
      // The card and the Second Wind item share one regen clock: the faster
      // of the two wins, so taking both still helps instead of overwriting.
      const p = state.player;
      const rate = 5 - level;
      p.secondWindRate = p.secondWindRate ? Math.min(p.secondWindRate, rate) : rate;
    },
  },
  {
    id: 'refresh', icon: 'refresh', kind: 'general', category: 'Sustain', name: 'Second Look', max: 3,
    text: (level) => `${level} free offer refresh${level > 1 ? 'es' : ''} every wave`,
    apply: () => {
      // Nothing to apply on the spot: the level is read at the start of
      // each wave, when the wave's free refreshes are handed out.
    },
  },
];

/**
 * The endless fallback: pure stat-increase cards, repeatable, always
 * available. They never enter the normal pool — they only fill an offer
 * (or a boss reward) when the normal pool runs short, so the offer never
 * comes up empty once every normal card is maxed. The gains are modest
 * and multiplicative, so they scale sensibly into endless without ever
 * making the keeper invincible: +5% damage / fire rate / speed / range,
 * +1 heart, +10% loot range / coin value, per pick, as often as picked.
 */
const FALLBACK_DEFS = [
  {
    id: 'surgeDamage', kind: 'fallback', category: 'Endless', name: 'Surge Damage', icon: 'sword', repeatable: true, max: 0,
    text: () => '+5% damage, all weapons',
    apply: (state) => { state.player.dmgMul *= 1.05; },
  },
  {
    id: 'surgeHealth', kind: 'fallback', category: 'Endless', name: 'Surge Heart', icon: 'heart', repeatable: true, max: 0,
    text: () => '+1 max heart, heal 1',
    apply: (state) => {
      const p = state.player;
      p.maxHp += 1;
      p.hp = Math.min(p.maxHp, p.hp + 1);
    },
  },
  {
    id: 'surgeRate', kind: 'fallback', category: 'Endless', name: 'Surge Wick', icon: 'chevrons', repeatable: true, max: 0,
    text: () => '+5% fire rate',
    apply: (state) => { state.player.rateMul *= 1.05; },
  },
  {
    id: 'surgeSpeed', kind: 'fallback', category: 'Endless', name: 'Surge Feet', icon: 'wing', repeatable: true, max: 0,
    text: () => '+5% move speed',
    apply: (state) => { state.player.speed *= 1.05; },
  },
  {
    id: 'surgeRange', kind: 'fallback', category: 'Endless', name: 'Surge Reach', icon: 'arrow', repeatable: true, max: 0,
    text: () => '+5% bolt range',
    apply: (state) => { state.player.rangeMul *= 1.05; },
  },
  {
    id: 'surgeLoot', kind: 'fallback', category: 'Endless', name: 'Surge Net', icon: 'magnet', repeatable: true, max: 0,
    text: () => '+10% loot range',
    apply: (state) => { state.player.lootRadius *= 1.1; },
  },
  {
    id: 'surgeCoin', kind: 'fallback', category: 'Endless', name: 'Surge Purse', icon: 'coin', repeatable: true, max: 0,
    text: () => '+10% coin value',
    apply: (state) => { state.player.coinMul *= 1.1; },
  },
];

/**
 * Every card the keeper could take now: the general pool plus their own
 * innate ultimate's upgrade card. Another keeper's ultimate never appears.
 */
function availablePool(state) {
  const taken = state.upgradesTaken;
  const available = (d) => (taken[d.id] ?? 0) < d.max && (!d.requires || d.requires(state));
  const char = CHARACTER_DEFS[state.character] ?? CHARACTER_DEFS.ember;
  const innate = ULTIMATES.find((d) => d.id === char.ultimate);
  const pool = DEFS.filter(available);
  if (innate && available(innate)) pool.push(innate);
  return pool;
}

/** A card def as the plain view object the screens show. */
function toView(d, taken) {
  const level = taken[d.id] ?? 0;
  return {
    id: d.id,
    kind: d.kind,
    category: d.category,
    name: d.name,
    icon: d.icon,
    text: d.text(level + 1),
    level,
    max: d.max,
    repeatable: d.repeatable ?? false,
  };
}

/**
 * Draw `count` cards: first from the normal pool (a fresh random draw every
 * wave), then — only when the pool runs short — from the endless fallback.
 * Fallback cards are distinct within one draw but can be picked again in
 * a later wave, so the offer is always `count` cards, even in deep endless.
 */
function drawCards(state, random, count) {
  const pool = availablePool(state);
  const picks = [];
  while (picks.length < count && pool.length > 0) {
    picks.push(pool.splice(random.int(0, pool.length - 1), 1)[0]);
  }
  const fallback = [...FALLBACK_DEFS];
  while (picks.length < count && fallback.length > 0) {
    picks.push(fallback.splice(random.int(0, fallback.length - 1), 1)[0]);
  }
  return picks.map((d) => toView(d, state.upgradesTaken));
}

/**
 * The four cards offered between waves, as plain view objects: a fresh
 * random draw every wave, from the whole available pool — the innate
 * ultimate's upgrade can appear in any wave, not only boss waves.
 */
export function offerCards(state, random) {
  return drawCards(state, random, 4);
}

/**
 * Draw `count` distinct available cards for a boss reward: granted, not
 * picked, so the caller applies them straight away.
 */
export function drawRewardCards(state, random, count) {
  return drawCards(state, random, count);
}

/** Take a card: raise its level one step and apply that level's effect. */
export function applyCard(state, id) {
  const ult = ULTIMATES.find((d) => d.id === id);
  if (ult) {
    const level = (state.upgradesTaken[id] ?? 0) + 1;
    state.upgradesTaken[id] = level;
    if (level === 1) state.ultimates.push(id);
    return;
  }
  const def = DEFS.find((d) => d.id === id) ?? FALLBACK_DEFS.find((d) => d.id === id);
  if (!def) return;
  const level = (state.upgradesTaken[id] ?? 0) + 1;
  state.upgradesTaken[id] = level;
  def.apply(state, level);
}

/**
 * A plain view of one taken upgrade (a card or an ultimate) for the status
 * panel: name, category and the text at its level. Null for an unknown id.
 */
export function describeUpgrade(id, level) {
  const ult = ULTIMATES.find((d) => d.id === id);
  if (ult) {
    return { id, kind: 'ultimate', category: 'Ultimate', name: ult.name, icon: ult.icon, text: ult.text(level), level, max: ult.max, repeatable: false };
  }
  const def = DEFS.find((d) => d.id === id) ?? FALLBACK_DEFS.find((d) => d.id === id);
  if (!def) return null;
  return { id, kind: def.kind, category: def.category, name: def.name, icon: def.icon, text: def.text(level), level, max: def.max, repeatable: def.repeatable ?? false };
}
