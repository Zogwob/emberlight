// Emberlight v2 — the between-wave shop. Coins the keeper collected buy new
// weapons and raise the ones held, buy items and raise them, and mend the
// keeper. The shop sits beside the card pick on the same between-wave screen,
// and every purchase re-offers the shop at once, so prices and availability
// never go stale.
//
// The shelf always holds four slots when there is anything to sell: a weapon
// to buy (or a weapon upgrade when the arsenal is full), an item to buy or
// raise, an upgrade, and a mend when hurt — so weapons, items and healing
// are all on the shelf every wave.

import { WEAPON_DEFS, addWeapon, ownsWeapon, weaponPrice } from './weapons.js';
import { CHARACTER_DEFS } from './characters.js';
import { applyItem, offerItems } from './items.js';

const MEND_PRICE = 15;
const MEND_HEAL = 2;

function shuffle(arr, random) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = random.int(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** The shop's current items, as plain view objects, in display order. */
export function offerShop(state) {
  const p = state.player;
  const items = [];
  const weaponBuys = shuffle(
    Object.keys(WEAPON_DEFS).filter((id) => WEAPON_DEFS[id].basePrice && !ownsWeapon(state, id)),
    state.rng,
  );
  const itemOffers = shuffle(offerItems(state), state.rng);
  const weaponUps = p.weapons
    .filter((w) => w.level < WEAPON_DEFS[w.id].maxLevel && weaponPrice(w.id, w.level) > 0)
    .map((w) => {
      // Raising the keeper's own light raises the keeper: the shelf says
      // "Upgrade Ember", not the name of a weapon.
      const keeper = WEAPON_DEFS[w.id].signature ? CHARACTER_DEFS[WEAPON_DEFS[w.id].signature] : null;
      return {
        key: `up-${w.id}`,
        kind: 'upgrade',
        name: keeper ? `Upgrade ${keeper.name} — Lv ${w.level + 1}` : `${WEAPON_DEFS[w.id].name} — Lv ${w.level + 1}`,
        text: keeper ? 'Your own light grows stronger.' : (w.level === 1 ? 'Stronger, faster, wider.' : 'Its finest edge yet.'),
        price: weaponPrice(w.id, w.level),
        level: w.level,
        maxLevel: WEAPON_DEFS[w.id].maxLevel,
        icon: WEAPON_DEFS[w.id].icon,
      };
    });
  // Slot 1: a new weapon when one is on offer, else a weapon upgrade.
  if (weaponBuys.length > 0) {
    const id = weaponBuys[0];
    items.push({
      key: `buy-${id}`,
      kind: 'buy',
      name: WEAPON_DEFS[id].name,
      text: WEAPON_DEFS[id].text,
      price: weaponPrice(id, 0),
      level: 0,
      maxLevel: WEAPON_DEFS[id].maxLevel,
      icon: WEAPON_DEFS[id].icon,
    });
  } else if (weaponUps.length > 0) {
    items.push(weaponUps.shift());
  }
  // Slot 2: an item, bought or raised.
  if (itemOffers.length > 0) items.push(itemOffers.shift());
  // Slot 3: an upgrade — a weapon first, else another item.
  if (weaponUps.length > 0) items.push(weaponUps.shift());
  else if (itemOffers.length > 0) items.push(itemOffers.shift());
  // Slot 4: a mend when hurt, else a second weapon buy, else another item.
  if (p.hp < p.maxHp) {
    items.push({
      key: 'mend',
      kind: 'mend',
      name: 'Lantern Mend',
      text: `Heal ${MEND_HEAL} hearts now.`,
      price: MEND_PRICE,
      level: 0,
      maxLevel: 1,
    });
  } else if (weaponBuys.length > 1) {
    const id = weaponBuys[1];
    items.push({
      key: `buy-${id}`,
      kind: 'buy',
      name: WEAPON_DEFS[id].name,
      text: WEAPON_DEFS[id].text,
      price: weaponPrice(id, 0),
      level: 0,
      maxLevel: WEAPON_DEFS[id].maxLevel,
      icon: WEAPON_DEFS[id].icon,
    });
  } else if (itemOffers.length > 0) {
    items.push(itemOffers.shift());
  }
  return items.slice(0, 4);
}

/**
 * Buy one shop item by its key. Returns true when the coins covered it and
 * the purchase landed; the shop is re-offered either way the caller looks.
 */
export function buyShopItem(state, key) {
  // Look the item up on the shelf the keeper actually sees (state.shopOffer),
  // not a fresh re-roll: the shelf shuffles, so a fresh roll might not list
  // the item the keeper just clicked. Only re-offer when there is no shelf.
  const items = state.shopOffer.length > 0 ? state.shopOffer : offerShop(state);
  const item = items.find((i) => i.key === key);
  if (!item || state.coins < item.price) return false;
  if (item.item) {
    state.coins -= item.price;
    applyItem(state, item.itemId, item.level + 1);
  } else if (item.kind === 'upgrade') {
    const weapon = state.player.weapons.find((w) => w.id === key.slice(3));
    if (!weapon) return false;
    state.coins -= item.price;
    weapon.level += 1;
  } else if (item.kind === 'buy') {
    state.coins -= item.price;
    addWeapon(state, key.slice(4));
  } else {
    state.coins -= item.price;
    const p = state.player;
    p.hp = Math.min(p.maxHp, p.hp + MEND_HEAL);
  }
  state.shopOffer = offerShop(state);
  return true;
}
