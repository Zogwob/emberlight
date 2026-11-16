// Emberlight v2 — the coin economy: what a slain shadow is worth, how far the
// lantern's pull reaches, and the rare magnet that sweeps the whole field.
//
// Coins are pickups like the old heart/shield/rapid/ember drops, but they are
// currency: they auto-loot when the keeper comes near, and the shop between
// waves spends them. Nothing here touches the world; it is data and small
// pure helpers the simulation calls.

/** How far away a coin starts drifting toward the keeper (generous on purpose). */
export const LOOT_RADIUS_BASE = 120;

/** Seconds a dropped coin waits on the ground before it fades. */
export const COIN_LIFE = 14;

/** Coins the keeper is paid for clearing a wave, on top of what fell. */
export const WAVE_CLEAR_COINS = 10;

/**
 * The keeper's level gauge: every coin a slain shadow drops feeds BOTH the
 * purse and the gauge, and the wave-clear bonus feeds it too. Spending coins
 * in the shop never drains the gauge — it is cumulative XP, not currency.
 * XP needed to rise from `level` to `level + 1`; grows with the level.
 */
export function xpNeedFor(level) {
  return 5 * level * (level + 4);
}

/**
 * What one level-up grants: damage and max health ONLY. Speed and range come
 * from cards, never from levels — levels giving everything would make the
 * night too easy. damage is a multiplier on the keeper's damage; maxHp is
 * whole hearts added (and the keeper heals that much on levelling up).
 */
export const LEVEL_UP = { damage: 0.08, maxHp: 1 };

/** A brute's chance of also dropping the loot-all magnet tool. */
export const MAGNET_DROP_CHANCE = 0.15;

/**
 * Re-rolling the card offer between waves: the first refresh of a wave is
 * cheap, the price rises with each refresh in the same wave, and a wave
 * allows at most REFRESH_MAX refreshes. Free refreshes (from the Second
 * Look card) take the slot without paying the price.
 */
export const REFRESH_PRICES = [15, 30, 50];
export const REFRESH_MAX = 3;

/** Coins a slain shadow drops: each entry is one coin { value, dx, dy }. */
export function coinDropsFor(kind, random) {
  const scatter = (value) => ({
    value,
    dx: random.range(-16, 16),
    dy: random.range(-16, 16),
  });
  if (kind === 'skitter') return [scatter(2)];
  if (kind === 'spitter') return [scatter(3)];
  // Brutes are worth more and pay it in two coins.
  return [scatter(3), scatter(3)];
}

/** The loot radius a keeper with this loot stat actually pulls with. */
export function lootRadius(player) {
  return player.lootRadius;
}
