// Emberlight v2.1 — five bosses, one per boss wave (5, 10, 15, 20, 25).
// Each boss is a bigger, named shadow built on a regular kind, with its own
// colour and at least one mechanic: charging at the keeper, firing a fan of
// orbs, fighting as a twin, summoning minions, or — wave 25's Long Night —
// doing several at once. Past wave 25 the cycle repeats, tougher each time,
// and endless boss waves (30, 35, ...) bring two bosses at once.

export const BOSS_DEFS = [
  // Damage scales with the wave: the first boss still taps for 1, later
  // bosses hit for 2, and the Long Night's brute bulk hits for 3.
  { wave: 5, id: 'gloomfiend', name: 'Gloomfiend', kind: 'skitter', hp: 150, radius: 32, color: '#4a2a6e', mechanic: 'charge', icon: 'charge', damage: 1 },
  { wave: 10, id: 'spitmother', name: 'Spitmother', kind: 'spitter', hp: 350, radius: 36, color: '#5e2a7a', mechanic: 'spread', icon: 'spread', damage: 2 },
  { wave: 15, id: 'twinmaw', name: 'Twin Maw', kind: 'spitter', hp: 600, radius: 38, color: '#6e3a2a', mechanic: 'twin', icon: 'twin', damage: 2 },
  { wave: 20, id: 'stormcaller', name: 'Stormcaller', kind: 'spitter', hp: 1200, radius: 38, color: '#2a6e4a', mechanic: 'summon', icon: 'summon', damage: 2 },
  { wave: 25, id: 'longnight', name: 'The Long Night', kind: 'brute', hp: 2700, radius: 48, color: '#1a1a3e', mechanic: 'final', icon: 'night', damage: 3 },
];

/** The boss for a boss wave (5, 10, 15, ...); the cycle repeats past 25, tougher each time. */
export function bossDefFor(wave) {
  const idx = (Math.floor(wave / 5) - 1) % BOSS_DEFS.length;
  const def = BOSS_DEFS[idx];
  const hp = Math.round(def.hp * (1 + Math.max(0, wave - def.wave) * 0.08));
  return { ...def, hp };
}

/** The second boss for an endless boss wave (30, 35, ...): the next in the cycle. */
export function secondBossDefFor(wave) {
  const idx = Math.floor(wave / 5) % BOSS_DEFS.length;
  const def = BOSS_DEFS[idx];
  const hp = Math.round(def.hp * (1 + Math.max(0, wave - def.wave) * 0.08));
  return { ...def, hp };
}

/** A boss enemy object, built on its base kind. `at` is the spawn point. */
export function makeBoss(def, at, baseSpeed) {
  return {
    kind: def.kind,
    boss: true,
    bossId: def.id,
    bossName: def.name,
    mechanic: def.mechanic,
    icon: def.icon,
    color: def.color,
    x: at.x,
    y: at.y,
    hp: def.hp,
    maxHp: def.hp,
    radius: def.radius,
    speed: baseSpeed * 0.9,
    // A boss hits for its own damage (see BOSS_DEFS): 1 on wave 5, 2 on
    // waves 10-20, 3 for the Long Night.
    damage: def.damage ?? (def.kind === 'brute' ? 3 : 2),
    score: 150 + def.wave * 50,
    wobbleT: 0,
    shootT: 2,
    flash: 0,
    born: 0,
    bossT: 2.5,
    bossT2: 5,
    bossT3: 3,
    dashT: 0,
  };
}
