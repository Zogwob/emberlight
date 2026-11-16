// Emberlight — the keeper's live stats, as the status panel's Stats tab shows
// them. Every value is read straight from the game state (never static text),
// so the numbers rise visibly as the keeper gains levels, cards and items.
// Each row carries the icon the panel draws beside it.

import { BULLET, PLAYER } from './config.js';

/** Format a number with at most one decimal, trimming a trailing .0. */
function num(n) {
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * The keeper's live stats: { name, value, note, icon } rows. `value` is the
 * gold number the panel shows beside the label; `note` is the muted hint
 * under it (empty when the stat speaks for itself).
 */
export function playerStats(state) {
  const p = state.player;
  const boltDamage = p.damage * p.dmgMul;
  const boltRange = Math.round(BULLET.speed * BULLET.life * p.rangeMul);
  const fireRate = PLAYER.fireRate * p.rateMul;
  const projectiles = p.shots + p.bonusProjectiles;
  const rows = [
    { name: 'Level', value: `Lv ${p.level}`, note: '', icon: 'star' },
    { name: 'XP', value: `${p.xp} / ${p.xpNeed}`, note: `toward Lv ${p.level + 1}`, icon: 'spark' },
    { name: 'Bolt damage', value: num(boltDamage), note: 'damage per bolt', icon: 'sword' },
    { name: 'Health', value: `${num(p.hp)} / ${num(p.maxHp)}`, note: 'hearts', icon: 'heart' },
    { name: 'Move speed', value: String(Math.round(p.speed)), note: 'px per second', icon: 'wing' },
    { name: 'Bolt range', value: `${boltRange} px`, note: 'how far bolts fly', icon: 'arrow' },
    { name: 'Fire rate', value: `${num(fireRate)} /s`, note: 'shots per second', icon: 'chevrons' },
    { name: 'Projectiles', value: String(projectiles), note: 'bolts per shot', icon: 'twinbolt' },
    { name: 'Pierce', value: p.pierce > 0 ? `+${p.pierce}` : '0', note: 'shadows per bolt', icon: 'lance' },
    { name: 'Loot range', value: `${Math.round(p.lootRadius)} px`, note: 'coin magnet reach', icon: 'magnet' },
    {
      name: 'Lifesteal', value: p.lifestealThreshold > 0 ? `1 heart / ${p.lifestealThreshold} dmg` : '—',
      note: p.lifestealThreshold > 0 ? 'damage heals you' : 'not taken', icon: 'drop',
    },
    {
      name: 'Regen', value: p.secondWindRate > 0 ? `1 heart / ${p.secondWindRate}s` : '—',
      note: p.secondWindRate > 0 ? 'after 5s calm' : 'not taken', icon: 'moon',
    },
    {
      name: 'Aegis shield',
      value: p.shieldRecharge > 0 ? (p.shieldReady ? 'Ready' : `${Math.ceil(p.shieldTimer)}s`) : '—',
      note: p.shieldRecharge > 0 ? `blocks a hit, ${p.shieldRecharge}s recharge` : 'not taken', icon: 'shield',
    },
    {
      name: 'Burning Halo', value: p.halo ? `${p.halo.dps}/s · ${p.halo.radius}px` : '—',
      note: p.halo ? 'light burns nearby shadows' : 'not taken', icon: 'halo',
    },
    {
      name: 'Orbiting Light', value: p.orbit ? `Lv ${p.orbit.level}` : '—',
      note: p.orbit ? 'a light orb circles you' : 'not taken', icon: 'orbit',
    },
    {
      name: 'Slow on hit',
      value: p.slowOnHit ? `${Math.round((1 - p.slowOnHit.mul) * 100)}% · ${num(p.slowOnHit.dur)}s` : '—',
      note: p.slowOnHit ? 'hits chill shadows' : 'not taken', icon: 'icicle',
    },
  ];
  return rows;
}
