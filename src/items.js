// Emberlight v2 — the shop's items. Unlike cards, items are bought with coins
// between waves and can be raised in the shop too. Each item has three
// levels; buying takes level I, upgrading raises it. Effects stack with the
// cards that do the same thing (damage, fire rate, pickup radius, coin
// value, regen, move speed) because they write the same multipliers — so the
// keeper can build damage or survival through cards, through items, or both.

export const ITEM_DEFS = [
  {
    id: 'powerCore', name: 'Power Core', icon: 'bolt', prices: [35, 45, 60], maxLevel: 3,
    text: '+10% damage, all weapons',
    apply: (state) => {
      state.player.dmgMul *= 1.1;
    },
  },
  {
    id: 'heartVessel', name: 'Heart Vessel', icon: 'heart', prices: [40, 50, 65], maxLevel: 3,
    text: '+1 max heart, heal 1',
    apply: (state) => {
      const p = state.player;
      p.maxHp += 1;
      p.hp = Math.min(p.maxHp, p.hp + 1);
    },
  },
  {
    id: 'vitality', name: 'Vitality Charm', icon: 'plus', prices: [45, 55, 70], maxLevel: 3,
    text: '+20% max health, heal 1',
    apply: (state) => {
      const p = state.player;
      p.maxHp = Math.ceil(p.maxHp * 1.2);
      p.hp = Math.min(p.maxHp, p.hp + 1);
    },
  },
  {
    id: 'lifesteal', name: 'Ember Leech', icon: 'drop', prices: [50, 60, 75], maxLevel: 3,
    text: (level) => `Heal 1 heart per ${[120, 90, 60][level - 1]} damage dealt`,
    apply: (state, level) => {
      state.player.lifestealThreshold = [120, 90, 60][level - 1];
    },
  },
  {
    id: 'secondWind', name: 'Second Wind', icon: 'clock', prices: [45, 55, 70], maxLevel: 3,
    text: (level) => `Regen 1 heart per ${[3, 2, 1.5][level - 1]}s after 5s calm`,
    apply: (state, level) => {
      // The item and the Slow Mend card share one regen clock: the faster
      // of the two wins, so taking both still helps instead of overwriting.
      const p = state.player;
      const rate = [3, 2, 1.5][level - 1];
      p.secondWindRate = p.secondWindRate ? Math.min(p.secondWindRate, rate) : rate;
    },
  },
  {
    id: 'luckyCharm', name: 'Lucky Charm', icon: 'coin', prices: [30, 40, 55], maxLevel: 3,
    text: '+25% drop rate',
    apply: (state) => {
      state.player.dropMul *= 1.25;
    },
  },
  {
    id: 'magnetCore', name: 'Loot Magnet', icon: 'magnet', prices: [30, 40, 50], maxLevel: 3,
    text: '+30% pickup radius',
    apply: (state) => {
      state.player.lootRadius *= 1.3;
    },
  },
  {
    id: 'coinPouch', name: 'Coin Pouch', icon: 'pouch', prices: [30, 40, 50], maxLevel: 3,
    text: '+15% coin value',
    apply: (state) => {
      state.player.coinMul *= 1.15;
    },
  },
  {
    id: 'rapidCore', name: 'Rapid Core', icon: 'chevrons', prices: [35, 45, 60], maxLevel: 3,
    text: '+8% fire rate, all weapons',
    apply: (state) => {
      state.player.rateMul *= 1.08;
    },
  },
  {
    id: 'swiftBoots', name: 'Swift Boots', icon: 'boots', prices: [35, 45, 60], maxLevel: 3,
    text: '+10% move speed',
    apply: (state) => {
      state.player.speed *= 1.1;
    },
  },
];

/** The item entries the shop can offer now, as plain view objects. */
export function offerItems(state) {
  const owned = state.player.items ?? {};
  const out = [];
  for (const def of ITEM_DEFS) {
    const level = owned[def.id] ?? 0;
    const text = typeof def.text === 'function' ? def.text(level + 1) : def.text;
    if (level === 0) {
      out.push({
        key: `buy-item-${def.id}`,
        kind: 'buy',
        item: true,
        itemId: def.id,
        name: def.name,
        text,
        price: def.prices[0],
        level: 0,
        maxLevel: def.maxLevel,
        icon: def.icon,
      });
    } else if (level < def.maxLevel) {
      out.push({
        key: `up-item-${def.id}`,
        kind: 'upgrade',
        item: true,
        itemId: def.id,
        name: `${def.name} — Lv ${level + 1}`,
        text,
        price: def.prices[level],
        level,
        maxLevel: def.maxLevel,
        icon: def.icon,
      });
    }
  }
  return out;
}

/** Take an item at its new level (1 on buy, higher on upgrade). */
export function applyItem(state, id, level) {
  const def = ITEM_DEFS.find((d) => d.id === id);
  if (!def) return;
  state.player.items = state.player.items ?? {};
  state.player.items[id] = level;
  def.apply(state, level);
}

/**
 * A plain view of one owned item for the HUD bar and the status panel:
 * name, procedural icon and the text at its level. Null for an unknown id.
 */
export function itemView(id, level) {
  const def = ITEM_DEFS.find((d) => d.id === id);
  if (!def) return null;
  return {
    id,
    name: def.name,
    icon: def.icon,
    text: typeof def.text === 'function' ? def.text(level) : def.text,
    level,
    maxLevel: def.maxLevel,
  };
}
