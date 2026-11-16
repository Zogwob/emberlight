// Emberlight — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Survive this many waves and dawn breaks: the night is won. */
export const WIN_WAVE = 10;

export const PLAYER = {
  radius: 15,
  speed: 265,
  maxHp: 5,
  /** Shots a second at the start. */
  fireRate: 4.2,
  bulletSpeed: 640,
  bulletDamage: 1,
  bulletRadius: 5,
  /** How far the lantern's light reaches at full health. */
  lanternRadius: 230,
  /** Seconds of mercy after a hit. */
  invulnerable: 1.2,
};

export const BULLET = { speed: 640, radius: 5, life: 1.1 };

/** The three shadow kinds. Speeds are px/s, damage is hearts per hit. */
export const ENEMY_KINDS = {
  skitter: {
    label: 'Skitter',
    radius: 14,
    hp: 2,
    speed: 175,
    damage: 1,
    score: 10,
    /** Seconds between direction wobbles while it chases. */
    wobble: 0.9,
  },
  spitter: {
    label: 'Spitter',
    radius: 16,
    hp: 3,
    speed: 85,
    damage: 1,
    score: 25,
    /** It stops this far from the player and shoots. */
    standOff: 270,
    shootEvery: 2.3,
    orbSpeed: 210,
    orbRadius: 7,
  },
  brute: {
    label: 'Brute',
    radius: 27,
    hp: 12,
    speed: 58,
    damage: 2,
    score: 50,
  },
};

/** Wave n (1-based) spawns this many shadows, mixed by kind. */
export function waveComposition(n) {
  const total = 6 + 3 * n;
  const brutes = n >= 3 ? Math.min(1 + Math.floor((n - 3) / 2), 6) : 0;
  const spitters = n >= 2 ? Math.min(1 + Math.floor((n - 2) / 2), 8) : 0;
  const skitters = total - brutes - spitters;
  return { skitter: skitters, spitter: spitters, brute: brutes };
}

/** Seconds between spawns in a wave; it tightens as waves climb. */
export function spawnInterval(n) {
  return Math.max(0.28, 0.85 - n * 0.05);
}

/** The eight between-wave upgrades. `max` caps how often one can be taken. */
export const UPGRADES = [
  { id: 'flame', name: 'Brighter Flame', text: '+25% bolt damage', max: 5 },
  { id: 'wick', name: 'Swift Wick', text: '+20% fire rate', max: 5 },
  { id: 'feet', name: 'Fleet Feet', text: '+12% move speed', max: 4 },
  { id: 'glass', name: 'Sturdy Glass', text: '+1 max heart, heal 1', max: 3 },
  { id: 'twin', name: 'Twin Sparks', text: '+1 bolt per shot', max: 2 },
  { id: 'pierce', name: 'Piercing Light', text: 'Bolts pierce +1 shadow', max: 3 },
  { id: 'glow', name: 'Wide Glow', text: '+20% lantern light', max: 3 },
  { id: 'ember', name: 'Ember Heart', text: 'Heal 2 hearts now', max: 99 },
];

/** What a slain shadow may drop: [kind, chance]. Rolls once per kill. */
export const DROPS = [
  ['heart', 0.05],
  ['shield', 0.04],
  ['rapid', 0.05],
  ['ember', 0.08],
];

export const PALETTE = {
  backdrop: '#0b0e22',
  night: '#12162f',
  ground: '#171c38',
  groundLine: '#1e2447',
  wisp: '#ffd98a',
  wispCore: '#fff3cf',
  flame: '#ffb347',
  ember: '#ff8a3d',
  bolt: '#ffe9a8',
  shadow: '#241b3a',
  shadowEdge: '#4a3a78',
  skitterEye: '#ff5d73',
  spitterEye: '#b78cff',
  bruteEye: '#ff3b30',
  heart: '#ff6b81',
  shield: '#7dd7ff',
  rapid: '#ffe066',
  text: '#f2ead8',
  muted: '#9a94b8',
  panel: '#1a1f3d',
  panelEdge: '#3a4470',
  card: '#20264a',
  cardEdge: '#574f9e',
  banner: '#ffd98a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberlight.best';
