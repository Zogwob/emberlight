// Emberlight v2 — the three ultimates. Every kill fills the lantern gauge;
// when it is full, Q fires every ultimate the keeper owns, at its level.
// Ultimate cards are offered at waves 5, 10 and 15, beside general cards,
// and they level up like any other card (I -> II -> III).
//
// fireUltimate takes a context the world builds (it owns the kill logic),
// so this file stays free of the simulation: { state, damageAll, clearOrbs,
// spawnMeteor, freezeAll, randomX }.

export const ULTIMATES = [
  {
    id: 'dawnburst',
    icon: 'sun',
    kind: 'ultimate',
    category: 'Ultimate',
    name: 'Dawn Burst',
    max: 3,
    text: (level) => `${[10, 16, 25][level - 1]} damage to all shadows, clears orbs`,
  },
  {
    id: 'meteor',
    icon: 'meteor',
    kind: 'ultimate',
    category: 'Ultimate',
    name: 'Emberfall',
    max: 3,
    text: (level) => `${[16, 24, 32][level - 1]} meteors rain down, ${3 + level} damage each`,
  },
  {
    id: 'stillLight',
    icon: 'snowflake',
    kind: 'ultimate',
    category: 'Ultimate',
    name: 'Still Light',
    max: 3,
    text: (level) => `Freeze all shadows for ${2 + 2 * level}s${level > 1 ? `, ${3 * (level - 1)} damage` : ''}`,
  },
];

/** Fire one ultimate at its level. `ctx` comes from the world. */
export function fireUltimate(ctx, id, level) {
  const p = ctx.state.player;
  const tint = p?.tint ?? { wisp: '#ffd98a', flame: '#ffb347', bolt: '#ffe9a8' };
  // Every ultimate is the biggest visual AND sound event in the game: the
  // largest flash, the most particles, the strongest shake, the loudest
  // swell. Nothing else is allowed to compete with it.
  if (id === 'dawnburst') {
    ctx.damageAll([10, 16, 25][level - 1] ?? 10);
    ctx.clearOrbs();
    // A huge flash in the keeper's colour, two rings of light expanding
    // from the keeper, and the largest particle burst in the game.
    ctx.state.flash = 0.55;
    ctx.spawnRing(p.x, p.y, tint.wisp, 520, 0.8);
    ctx.spawnRing(p.x, p.y, tint.flame, 380, 0.6);
    ctx.burst(p.x, p.y, tint.wisp, 70, 320);
    ctx.burst(p.x, p.y, tint.flame, 30, 220);
  } else if (id === 'meteor') {
    const count = [16, 24, 32][level - 1] ?? 16;
    const dmg = 3 + level;
    // The sky lights up as the meteors rain, and embers shower from above.
    // A shockwave ring of fire rolls out from the keeper, so Emberfall has
    // the same expanding ring as the other two ultimates.
    ctx.state.flash = 0.4;
    ctx.spawnRing(p.x, p.y, tint.flame, 460, 0.8);
    for (let i = 0; i < 5; i += 1) ctx.burst(ctx.randomX(), 20, '#ff8a3d', 8, 160);
    for (let i = 0; i < count; i += 1) ctx.spawnMeteor(ctx.randomX(), dmg);
  } else if (id === 'stillLight') {
    ctx.freezeAll(2 + 2 * level);
    const dmg = 3 * (level - 1);
    if (dmg > 0) ctx.damageAll(dmg);
    // A full-screen frost wash, a ring of ice-blue light, a flash of cold,
    // and frost sparkles bursting across the whole field.
    ctx.state.flash = 0.35;
    ctx.frostWash(1.5);
    ctx.spawnRing(p.x, p.y, '#8ac8ff', 460, 0.9);
    ctx.burst(p.x, p.y, '#b3d9ff', 20, 200);
    for (let i = 0; i < 4; i += 1) ctx.burst(ctx.randomX(), 120 + i * 160, '#8ac8ff', 10, 140);
  }
}
