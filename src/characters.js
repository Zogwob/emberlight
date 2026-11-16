// Emberlight v2.1 — the three keepers. The keeper IS the weapon: their own
// light is their attack, so there is no separate signature weapon to hold.
// Each keeper's attack is a different form of that light — Ember's fan, the
// Blood Lance, the Glacier Shell — and the shop and cards raise the keeper
// themself, never a weapon item. The shared weapon pool and all items are
// open to everyone.
//
// Every keeper is also born with their own ultimate (innate, not a card):
// Ember's light falls as meteors, Azure's stills the field, Crimson's bursts
// the dawn. The lantern gauge fills from kills and Q fires it; its upgrade
// card can appear in any wave's offer.
//
// The radar numbers are the keeper's real base stats (1-10, 5 is the v2
// baseline): Move -> move speed, DPS -> damage, Health -> max hearts,
// Range -> projectile reach. keeperBaseStats maps them to the numbers the
// world actually runs on, so the diagram on the select screen is honest.

import { PLAYER } from './config.js';

export const CHARACTER_ORDER = ['ember', 'crimson', 'azure'];

export const CHARACTER_DEFS = {
  ember: {
    id: 'ember',
    name: 'Ember',
    color: '#ffd98a',
    flame: '#ffb347',
    bolt: '#ffe9a8',
    signature: 'sunfan',
    icon: 'sunfan',
    signatureName: 'Sun Fan',
    ultimate: 'meteor',
    stats: { move: 6, dps: 7, health: 4, range: 5 },
    desc: 'Rapid fan of light bolts — fast, spread, mid range. Quickest and hardest-hitting, but the frailest.',
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson',
    color: '#ff8a7a',
    flame: '#ff5d73',
    bolt: '#ffb3a8',
    signature: 'lance',
    icon: 'lance',
    signatureName: 'Blood Lance',
    ultimate: 'dawnburst',
    stats: { move: 4, dps: 6, health: 8, range: 4 },
    desc: 'Heavy piercing lance of light — slow, mid range, biggest damage per hit. Toughest, slowest.',
  },
  azure: {
    id: 'azure',
    name: 'Azure',
    color: '#8ac8ff',
    flame: '#5d9bff',
    bolt: '#b3d9ff',
    signature: 'glacier',
    icon: 'orb',
    signatureName: 'Glacier Shell',
    ultimate: 'stillLight',
    stats: { move: 5, dps: 5, health: 5, range: 5 },
    desc: 'Bursting frost-light orb — wide area, chills enemies slow. All-round: nothing outstanding, nothing weak.',
  },
};

/** Radar 1-10 -> the numbers the world runs on. 5 is the v2 baseline. */
export function keeperBaseStats(def) {
  const s = def.stats;
  return {
    speed: Math.round(PLAYER.speed * (1 + (s.move - 5) * 0.05)),
    maxHp: 5 + (s.health - 5) * 0.5,
    dmgMul: 1 + (s.dps - 5) * 0.1,
    rangeMul: 1 + (s.range - 5) * 0.06,
  };
}
