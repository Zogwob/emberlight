// Emberlight's painter: one canvas, one logical 1280x720 field, scaled to the
// window. It draws the night, the lantern's glow, the wisp, the shadows, the
// HUD and every screen — title, upgrade choice, pause, the status panel,
// game over and dawn. Screen shake is derived from the world's clock, never
// from Math.random, so a staged screenshot lands on the same frame every time.

import { FIELD, FONT, PALETTE, PLAYER, WIN_WAVE } from './config.js';
import { CHARACTER_DEFS, CHARACTER_ORDER } from './characters.js';
import { REFRESH_MAX, REFRESH_PRICES } from './economy.js';
import { describeUpgrade } from './cards.js';
import { ITEM_DEFS, itemView } from './items.js';
import { playerStats } from './stats.js';
import { DEFAULT_SETTINGS } from './settings.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_STATS = 'stats';
export const SCREEN_OVER = 'over';
export const SCREEN_WON = 'won';
export const SCREEN_MENU = 'menu';
export const SCREEN_SETTINGS = 'settings';

/** Card category colours, by the card's kind. */
const CATEGORY_COLORS = {
  Survival: '#7dd7ff',
  DPS: '#ff8a3d',
  Sustain: '#7ddba3',
  Weapon: '#ffd98a',
  Keeper: '#e8b4ff',
  Ultimate: '#ffd700',
  Endless: '#b3d9ff',
};

/**
 * The between-wave screen's geometry, shared by the painter and the click
 * handling: four cards in a row, the shop's items on the same grid below
 * them, and the next-wave button at the bottom. `state.offer` and
 * `state.shopOffer` decide how many slots are filled; the rectangles are
 * always laid out the same way.
 */
export function upgradeLayout(state) {
  const cw = 272;
  const gap = 16;
  const total = 4 * cw + 3 * gap;
  const x0 = (FIELD.width - total) / 2;
  // A boss reward adds a line under the title, so the rows below shift down
  // to make room for it; the refresh button sits left of the next-wave one.
  const dy = (state.bossReward?.length ?? 0) > 0 ? 22 : 0;
  return {
    panel: { x: 40, y: 100, w: 1200, h: 552 },
    cards: state.offer.map((_, i) => ({ x: x0 + i * (cw + gap), y: 210 + dy, w: cw, h: 200 })),
    shop: state.shopOffer.map((_, i) => ({ x: x0 + i * (cw + gap), y: 452 + dy, w: cw, h: 96 })),
    shopLabel: { x: x0, y: 438 + dy },
    nextWave: { x: FIELD.width / 2 - 150, y: 574 + dy, w: 300, h: 48 },
    refresh: { x: FIELD.width / 2 - 150 - 280, y: 574 + dy, w: 250, h: 48 },
  };
}

/**
 * The title screen's geometry, shared by the painter and the click
 * handling: three keeper cards in a row and the Begin button below them.
 * The cards are tall enough for the wisp, the name, the attack's form, the
 * radar and the description.
 */
export function characterLayout() {
  const cw = 300;
  const gap = 20;
  const total = 3 * cw + 2 * gap;
  const x0 = FIELD.width / 2 - total / 2;
  const y = 308;
  return {
    cards: [0, 1, 2].map((i) => ({ x: x0 + i * (cw + gap), y, w: cw, h: 304 })),
    begin: { x: FIELD.width / 2 - 160, y: 622, w: 320, h: 48 },
  };
}

/**
 * The status toggle: a small button at the top left of the play screen,
 * under the score, that opens the status panel (the game pauses while it
 * is open). Click it, or press I.
 */
export function statsToggleRect() {
  return { x: 20, y: 106, w: 34, h: 34 };
}

/**
 * The keeper's corner of the bottom-centre HUD bar: the wisp, the
 * signature-attack icon and the name. Clicking it opens the status panel on
 * the Stats tab. The bar sits at (250, 660); this rect is its left corner.
 */
export function keeperIconRect() {
  return { x: 256, y: 666, w: 96, h: 40 };
}

/**
 * The "Menu" button: back to the title from pause, game over or dawn.
 * One shared geometry, so the painter and the click handling agree: on the
 * pause menu it is the third button (see pauseLayout); on the end screens
 * it sits under the prompt, inside the panel either way.
 */
export function menuButtonRect(screen) {
  if (screen === SCREEN_PAUSED) return pauseLayout().menu;
  return { x: FIELD.width / 2 - 100, y: 500, w: 200, h: 40 };
}

/**
 * The pause menu's geometry, shared by the painter and the click handling:
 * the panel and its three buttons — Resume, Settings, Menu — stacked under
 * the title, each labelled with its key.
 */
export function pauseLayout() {
  return {
    panel: { x: FIELD.width / 2 - 250, y: 240, w: 500, h: 300 },
    resume: { x: FIELD.width / 2 - 110, y: 330, w: 220, h: 48 },
    settings: { x: FIELD.width / 2 - 110, y: 390, w: 220, h: 48 },
    menu: { x: FIELD.width / 2 - 110, y: 450, w: 220, h: 48 },
  };
}

/**
 * The main menu's geometry, shared by the painter and the click handling:
 * two centred buttons under the title — Start, then Settings.
 */
export function menuLayout() {
  return {
    start: { x: FIELD.width / 2 - 110, y: 290, w: 220, h: 56 },
    settings: { x: FIELD.width / 2 - 110, y: 362, w: 220, h: 56 },
  };
}

/**
 * The Back button (top-left corner): back to the main menu from the keeper
 * select and from the settings screen. One rect for both screens.
 */
export function backButtonRect() {
  return { x: 20, y: 20, w: 140, h: 40 };
}

/**
 * The settings screen's geometry, shared by the painter and the click
 * handling: the panel, four rows (Music, SFX, Shake, Effects), each with
 * its option buttons, and the Back button. The current value of a row is
 * read from the settings object, not from this layout.
 */
export function settingsLayout() {
  const panel = { x: 340, y: 110, w: 600, h: 500 };
  const row = (id, label, y, options, w) => {
    const total = options.length * w + (options.length - 1) * 8;
    const x0 = panel.x + panel.w - 40 - total;
    return {
      id, label, y,
      options: options.map((value, i) => ({ value, rect: { x: x0 + i * (w + 8), y, w, h: 48 } })),
    };
  };
  return {
    panel,
    back: backButtonRect(),
    rows: [
      row('music', 'Music (BGM)', 210, ['off', 'low', 'med', 'high'], 52),
      row('sfx', 'Sound effects', 290, ['off', 'low', 'med', 'high'], 52),
      row('shake', 'Screen shake', 370, ['on', 'off'], 52),
      row('effects', 'Effects', 450, ['full', 'reduced'], 76),
    ],
  };
}

/** The current value of one settings row, as the row's option values read. */
export function settingsValue(settings, id) {
  if (id === 'music') return settings.music;
  if (id === 'sfx') return settings.sfx;
  if (id === 'shake') return settings.shake ? 'on' : 'off';
  return settings.effects;
}

/**
 * The status panel's geometry, shared by the painter and the click
 * handling: the panel itself, four tabs across the top (Upgrades, Items,
 * Ultimates, Stats), the Close button, and the list area the rows fill in
 * two columns. Four tabs of 171px with 12px gaps fill the 720px between
 * the panel's 40px margins exactly.
 */
export function statsPanelLayout() {
  const panel = { x: 240, y: 110, w: 800, h: 500 };
  const tabW = 171;
  const tabH = 40;
  const tabs = [
    { id: 'upgrades', label: 'Upgrades', icon: 'star' },
    { id: 'items', label: 'Items', icon: 'pouch' },
    { id: 'ultimates', label: 'Ultimates', icon: 'sun' },
    { id: 'stats', label: 'Stats', icon: 'chart' },
  ].map((t, i) => ({
    ...t,
    rect: { x: panel.x + 40 + i * (tabW + 12), y: panel.y + 64, w: tabW, h: tabH },
  }));
  return {
    panel,
    tabs,
    close: { x: panel.x + panel.w - 124, y: panel.y + 14, w: 104, h: 34 },
    list: { x: panel.x + 40, y: panel.y + 128, w: panel.w - 80, h: panel.h - 148 },
  };
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.2, y, x - s * 0.6, y - s, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.6, y - s, x + s * 1.2, y, x, y + s * 0.9);
  ctx.closePath();
}

function starPath(ctx, x, y, r, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** The four radar axes, in the order they are drawn around the diagram. */
const RADAR_AXES = [
  { key: 'move', label: 'Move' },
  { key: 'dps', label: 'DPS' },
  { key: 'health', label: 'Health' },
  { key: 'range', label: 'Range' },
];

/**
 * A four-stat radar diagram (1-10) for a keeper, drawn procedurally: rings
 * at 5 and 10, spokes on the four axes, the keeper's own shape filled with
 * their light, and each stat's name and number just outside its vertex.
 */
function drawRadar(ctx, def, cx, cy, r) {
  const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const point = (i, value) => {
    const a = angles[i];
    const d = (value / 10) * r;
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
  };
  ctx.strokeStyle = 'rgba(154, 148, 184, 0.4)';
  ctx.lineWidth = 1;
  for (const ring of [0.5, 1]) {
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const p = point(i, 10 * ring);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const p = point(i, 10);
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.beginPath();
  RADAR_AXES.forEach((axis, i) => {
    const p = point(i, def.stats[axis.key]);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = def.color;
  ctx.globalAlpha = 0.3;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  RADAR_AXES.forEach((axis, i) => {
    const a = angles[i];
    // 14px outside the ring: close enough to read as the radar's, far
    // enough to clear the attack's name above and the description below.
    const p = { x: cx + Math.cos(a) * (r + 14), y: cy + Math.sin(a) * (r + 14) };
    ctx.fillText(`${axis.label} ${def.stats[axis.key]}`, p.x, p.y + 4);
  });
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let view = { scale: 1, ox: 0, oy: 0, w: FIELD.width, h: FIELD.height };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const scale = Math.min(w / FIELD.width, h / FIELD.height);
    view = {
      scale: scale * dpr,
      ox: (w * dpr - FIELD.width * scale * dpr) / 2,
      oy: (h * dpr - FIELD.height * scale * dpr) / 2,
      w,
      h,
    };
  }

  window.addEventListener('resize', resize);
  resize();

  /** A point in canvas CSS pixels, mapped into the logical field. */
  function fieldFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = view.scale / dpr;
    const ox = view.ox / dpr;
    const oy = view.oy / dpr;
    return {
      x: (clientX - rect.left - ox) / scale,
      y: (clientY - rect.top - oy) / scale,
    };
  }

  function drawBackground(state) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    g.addColorStop(0, PALETTE.night);
    g.addColorStop(1, PALETTE.backdrop);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    ctx.strokeStyle = PALETTE.groundLine;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    for (let x = 80; x < FIELD.width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, FIELD.height);
      ctx.stroke();
    }
    for (let y = 80; y < FIELD.height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const e of state.embers) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(e.twinkle));
      ctx.globalAlpha = tw * 0.8;
      ctx.fillStyle = PALETTE.ember;
      circle(ctx, e.x, e.y, e.size);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** A hex colour as an rgba string, for tinted glows. */
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  function drawLanternGlow(state) {
    const p = state.player;
    if (!p) return;
    const tint = p.tint ?? { wisp: PALETTE.wisp, flame: PALETTE.flame, bolt: PALETTE.bolt };
    const healthFrac = p.hp / p.maxHp;
    const radius = p.lanternRadius * (0.55 + 0.45 * healthFrac);
    const g = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, radius);
    g.addColorStop(0, hexA(tint.wisp, 0.2));
    g.addColorStop(0.55, hexA(tint.flame, 0.07));
    g.addColorStop(1, hexA(tint.flame, 0));
    ctx.fillStyle = g;
    ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p) return;
    if (p.invulnerable > 0 && Math.floor(state.time * 14) % 2 === 0) return;
    const tint = p.tint ?? { wisp: PALETTE.wisp, flame: PALETTE.flame, bolt: PALETTE.bolt };

    const flicker = 1 + Math.sin(state.time * 9) * 0.06;
    const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 46 * flicker);
    glow.addColorStop(0, hexA(tint.wisp, 0.85));
    glow.addColorStop(1, hexA(tint.flame, 0));
    ctx.fillStyle = glow;
    circle(ctx, p.x, p.y, 46 * flicker);
    ctx.fill();

    // The wisp: a warm core with a little flame licking upward.
    ctx.fillStyle = tint.wisp;
    circle(ctx, p.x, p.y, PLAYER.radius * 0.72);
    ctx.fill();
    ctx.fillStyle = tint.flame;
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y - 6);
    ctx.quadraticCurveTo(p.x, p.y - 26 * flicker, p.x + 7, p.y - 6);
    ctx.quadraticCurveTo(p.x, p.y - 12, p.x - 7, p.y - 6);
    ctx.fill();

    // Eyes, looking where the lantern aims.
    const ex = Math.cos(p.aim) * 4;
    const ey = Math.sin(p.aim) * 4;
    ctx.fillStyle = '#2a1c08';
    circle(ctx, p.x - 5 + ex, p.y - 1 + ey, 2.2);
    ctx.fill();
    circle(ctx, p.x + 5 + ex, p.y - 1 + ey, 2.2);
    ctx.fill();

    if (state.time < p.shieldUntil) {
      ctx.strokeStyle = PALETTE.shield;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      circle(ctx, p.x, p.y, PLAYER.radius + 9);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Aegis: a ready shield waits as a thin cyan ring around the keeper.
    if (p.shieldReady) {
      ctx.strokeStyle = '#7dd7ff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.65;
      ctx.setLineDash([6, 5]);
      circle(ctx, p.x, p.y, PLAYER.radius + 13);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    if (state.time < p.rapidUntil) {
      ctx.strokeStyle = PALETTE.rapid;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      circle(ctx, p.x, p.y, PLAYER.radius + 5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  /** The Burning Halo's reach, drawn faint so the keeper can feel its edge. */
  function drawHalo(state) {
    const p = state.player;
    if (!p.halo) return;
    // The lantern-light aura, in the keeper's own colour.
    const tint = p.tint ?? { flame: PALETTE.flame };
    ctx.fillStyle = hexA(tint.flame, 0.06);
    circle(ctx, p.x, p.y, p.halo.radius);
    ctx.fill();
    ctx.strokeStyle = hexA(tint.flame, 0.25);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /** The Orbiting Light: a bright mote circling the keeper. */
  function drawOrbit(state) {
    const p = state.player;
    if (!p.orbit || !state.orbitPos) return;
    const o = state.orbitPos;
    // The orbiting mote is the keeper's own light, in their colour.
    const tint = p.tint ?? { wisp: PALETTE.wisp, flame: PALETTE.flame };
    const g = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, 26);
    g.addColorStop(0, hexA(tint.wisp, 0.95));
    g.addColorStop(1, hexA(tint.flame, 0));
    ctx.fillStyle = g;
    circle(ctx, o.x, o.y, 26);
    ctx.fill();
    ctx.fillStyle = tint.wisp;
    circle(ctx, o.x, o.y, 7);
    ctx.fill();
  }

  function drawEnemy(e, time, player) {
    const bob = Math.sin(time * 5 + e.x * 0.05) * 2;
    const y = e.y + bob;
    // The direction to the keeper: the dasher's nose, the shield arc and
    // the sniper's barrel all point at them.
    const ang = Math.atan2(player.y - e.y, player.x - e.x);
    // A ghost elite is translucent and pale, by design.
    if (e.elite === 'ghost') ctx.globalAlpha = 0.55;
    // A boss wears its own colour instead of the usual shadow.
    ctx.fillStyle = e.boss ? e.color : PALETTE.shadow;
    ctx.strokeStyle = PALETTE.shadowEdge;
    ctx.lineWidth = 2;
    if (e.kind === 'skitter') {
      circle(ctx, e.x, y, e.radius);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.shadowEdge;
      circle(ctx, e.x - e.radius * 0.7, y - 4, 5);
      ctx.fill();
      circle(ctx, e.x + e.radius * 0.7, y - 4, 5);
      ctx.fill();
    } else if (e.kind === 'spitter') {
      ctx.beginPath();
      ctx.ellipse(e.x, y, e.radius, e.radius * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.shadowEdge;
      circle(ctx, e.x, y + e.radius * 0.55, 5);
      ctx.fill();
    } else if (e.kind === 'lobber') {
      // A lobber: a slow diamond, lobbing orbs from far away.
      ctx.beginPath();
      ctx.moveTo(e.x, y - e.radius);
      ctx.lineTo(e.x + e.radius, y);
      ctx.lineTo(e.x, y + e.radius);
      ctx.lineTo(e.x - e.radius, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.shadowEdge;
      circle(ctx, e.x, y, 4);
      ctx.fill();
    } else if (e.kind === 'dasher') {
      // A dasher: a lean dart, nose at the keeper, built to lunge.
      ctx.save();
      ctx.translate(e.x, y);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(e.radius + 6, 0);
      ctx.lineTo(-e.radius * 0.7, -e.radius * 0.7);
      ctx.lineTo(-e.radius * 0.3, 0);
      ctx.lineTo(-e.radius * 0.7, e.radius * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = PALETTE.shadowEdge;
      circle(ctx, e.x, y, 4);
      ctx.fill();
    } else if (e.kind === 'splitter') {
      // A splitter: two halves barely holding together, ready to burst.
      circle(ctx, e.x - e.radius * 0.35, y, e.radius * 0.75);
      ctx.fill();
      ctx.stroke();
      circle(ctx, e.x + e.radius * 0.35, y, e.radius * 0.75);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.shadowEdge;
      circle(ctx, e.x, y, 4);
      ctx.fill();
    } else if (e.kind === 'shieldbearer') {
      // A shieldbearer: a heavy square, armoured on the front.
      ctx.fillRect(e.x - e.radius * 0.8, y - e.radius * 0.8, e.radius * 1.6, e.radius * 1.6);
      ctx.strokeRect(e.x - e.radius * 0.8, y - e.radius * 0.8, e.radius * 1.6, e.radius * 1.6);
      ctx.fillStyle = PALETTE.shadowEdge;
      circle(ctx, e.x, y, 4);
      ctx.fill();
    } else if (e.kind === 'sniper') {
      // A sniper: a tall spire with a long barrel aimed at the keeper.
      ctx.beginPath();
      ctx.moveTo(e.x, y - e.radius * 1.3);
      ctx.lineTo(e.x + e.radius * 0.5, y);
      ctx.lineTo(e.x, y + e.radius * 1.3);
      ctx.lineTo(e.x - e.radius * 0.5, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = PALETTE.shadowEdge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(e.x, y);
      ctx.lineTo(e.x + Math.cos(ang) * (e.radius + 14), y + Math.sin(ang) * (e.radius + 14));
      ctx.stroke();
      ctx.lineWidth = 2;
    } else {
      ctx.beginPath();
      ctx.moveTo(e.x - e.radius, y + e.radius * 0.7);
      ctx.lineTo(e.x - e.radius * 0.7, y - e.radius * 0.9);
      ctx.lineTo(e.x - e.radius * 0.2, y - e.radius * 0.5);
      ctx.lineTo(e.x, y - e.radius);
      ctx.lineTo(e.x + e.radius * 0.2, y - e.radius * 0.5);
      ctx.lineTo(e.x + e.radius * 0.7, y - e.radius * 0.9);
      ctx.lineTo(e.x + e.radius, y + e.radius * 0.7);
      ctx.quadraticCurveTo(e.x, y + e.radius * 1.2, e.x - e.radius, y + e.radius * 0.7);
      ctx.fill();
      ctx.stroke();
    }

    // Glowing eyes, coloured per kind; a white flash while the hit lands.
    const eyeColor = PALETTE[`${e.kind}Eye`] ?? PALETTE.bruteEye;
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : eyeColor;
    const spread = e.kind === 'brute' ? 11 : 6;
    circle(ctx, e.x - spread, y - 3, e.kind === 'brute' ? 4 : 3);
    ctx.fill();
    circle(ctx, e.x + spread, y - 3, e.kind === 'brute' ? 4 : 3);
    ctx.fill();

    // A Shieldbearer's front shield: a glowing arc on the keeper's side,
    // gone once the shield is spent.
    if (e.kind === 'shieldbearer' && (e.shield ?? 0) > 0) {
      ctx.strokeStyle = '#7dd7ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(e.x, y, e.radius + 6, ang - 1.1, ang + 1.1);
      ctx.stroke();
      ctx.lineWidth = 2;
    }

    // A health bar only for elites: they are rare enough to read clearly.
    // Normal mobs get none (the screen would get messy at high waves), and
    // a boss's health lives in the top-centre bar, not over its head.
    if (e.elite && e.hp < e.maxHp) {
      const w = e.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - w / 2, y - e.radius - 12, w, 4);
      ctx.fillStyle = PALETTE.heart;
      ctx.fillRect(e.x - w / 2, y - e.radius - 12, w * (e.hp / e.maxHp), 4);
    }

    // A boss announces its name above its head — only when it fits on the
    // field (the boss bar already names it, so a clipped duplicate is worse
    // than none at all).
    if (e.boss && y - e.radius - 20 > 12) {
      ctx.textAlign = 'center';
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillStyle = '#ffd98a';
      ctx.fillText(e.bossName, Math.max(60, Math.min(FIELD.width - 60, e.x)), y - e.radius - 20);
    }
    // Still Light: a frozen shadow stands in a shell of ice-blue, with
    // ice crystals forming on it — small diamonds at fixed angles, so the
    // frost reads the same every frame.
    if (e.frozen > 0) {
      ctx.fillStyle = 'rgba(125, 215, 255, 0.3)';
      circle(ctx, e.x, y, e.radius + 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(125, 215, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(179, 217, 255, 0.95)';
      for (let k = 0; k < 5; k += 1) {
        const a = (Math.PI * 2 * k) / 5 - Math.PI / 2;
        const cx = e.x + Math.cos(a) * (e.radius + 3);
        const cy = y + Math.sin(a) * (e.radius + 3);
        const s = 4;
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s * 0.6, cy);
        ctx.lineTo(cx, cy + s);
        ctx.lineTo(cx - s * 0.6, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawBullets(state) {
    // Every projectile looks like what it is — no boxy squares. The keeper's
    // own light is their colour (plain bolts already used it; the orbiting
    // blades and the meteors do now too). The shared weapons keep their own
    // colours and shapes: a tracer, a streak, a bomb, a rocket, a frost orb.
    const tint = state.player?.tint ?? { bolt: PALETTE.bolt, wisp: PALETTE.wispCore, flame: PALETTE.flame };
    // A unit vector along a bullet's travel, for shapes that point where
    // they fly; and its perpendicular, for widths.
    const dirOf = (b) => {
      const m = Math.hypot(b.vx, b.vy) || 1;
      return { x: b.vx / m, y: b.vy / m };
    };
    for (const b of state.bullets) {
      if (b.orbit) {
        // An orbiting blade: a small leaf of light, edge-on to its travel.
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.angle + Math.PI / 2);
        ctx.fillStyle = tint.bolt;
        ctx.strokeStyle = tint.flame;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.quadraticCurveTo(6, 0, 0, 13);
        ctx.quadraticCurveTo(-6, 0, 0, -13);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        continue;
      }
      const d = dirOf(b);
      const px = -d.y;
      const py = d.x;
      if (b.kind === 'sunfan') {
        // Ember's own fan: a big elongated bolt — a bright dart with a long
        // glowing trail, in the keeper's gold.
        const len = 34;
        ctx.strokeStyle = hexA(tint.bolt, 0.3);
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x - d.x * len, b.y - d.y * len);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = tint.bolt;
        ctx.beginPath();
        ctx.moveTo(b.x + d.x * 10, b.y + d.y * 10);
        ctx.lineTo(b.x + px * 4, b.y + py * 4);
        ctx.lineTo(b.x - d.x * len, b.y - d.y * len);
        ctx.lineTo(b.x - px * 4, b.y - py * 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = tint.wisp;
        circle(ctx, b.x, b.y, 3.5);
        ctx.fill();
        continue;
      }
      if (b.kind === 'bolt') {
        // A plain light bolt: the same dart, smaller, with a shorter trail.
        const len = 24;
        ctx.strokeStyle = hexA(tint.bolt, 0.3);
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x - d.x * len, b.y - d.y * len);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = tint.bolt;
        ctx.beginPath();
        ctx.moveTo(b.x + d.x * 8, b.y + d.y * 8);
        ctx.lineTo(b.x + px * 3, b.y + py * 3);
        ctx.lineTo(b.x - d.x * len, b.y - d.y * len);
        ctx.lineTo(b.x - px * 3, b.y - py * 3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = tint.wisp;
        circle(ctx, b.x, b.y, 3);
        ctx.fill();
        continue;
      }
      if (b.kind === 'rifle') {
        // An Ember Rifle tracer: a short, hot-white dash with a bright tip.
        ctx.strokeStyle = '#fff3b0';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x - d.x * 14, b.y - d.y * 14);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        circle(ctx, b.x, b.y, 2);
        ctx.fill();
        continue;
      }
      if (b.kind === 'sniper') {
        // A Longshot round: a long, thin, ice-white streak.
        ctx.strokeStyle = hexA('#dff2ff', 0.35);
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x - d.x * 55, b.y - d.y * 55);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = '#dff2ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x - d.x * 55, b.y - d.y * 55);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        continue;
      }
      if (b.kind === 'lance') {
        // A Blood Lance: a long shaft with a pointed head, in the keeper's red.
        const len = 60;
        ctx.strokeStyle = hexA('#ff5d73', 0.3);
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x - d.x * len, b.y - d.y * len);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = '#ff8a7a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(b.x - d.x * len, b.y - d.y * len);
        ctx.lineTo(b.x + d.x * 8, b.y + d.y * 8);
        ctx.stroke();
        ctx.fillStyle = '#ffb3a8';
        ctx.beginPath();
        ctx.moveTo(b.x + d.x * 18, b.y + d.y * 18);
        ctx.lineTo(b.x + d.x * 6 + px * 5, b.y + d.y * 6 + py * 5);
        ctx.lineTo(b.x + d.x * 6 - px * 5, b.y + d.y * 6 - py * 5);
        ctx.closePath();
        ctx.fill();
        continue;
      }
      if (b.kind === 'grenade') {
        // A lobbed bomb: a dark round body, a fuse, and a spark.
        ctx.fillStyle = '#3a3a4e';
        circle(ctx, b.x, b.y, b.radius);
        ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x - d.x * b.radius, b.y - d.y * b.radius);
        ctx.lineTo(b.x - d.x * (b.radius + 6), b.y - d.y * (b.radius + 6));
        ctx.stroke();
        ctx.fillStyle = '#fff3b0';
        circle(ctx, b.x - d.x * (b.radius + 7), b.y - d.y * (b.radius + 7), 2.5);
        ctx.fill();
        ctx.fillStyle = '#ff9a3d';
        circle(ctx, b.x - d.x * 3, b.y - d.y * 3, 3);
        ctx.fill();
        continue;
      }
      if (b.kind === 'rpg') {
        // A Dawn Rocket: a pointed cone body with a flame trail behind it.
        ctx.strokeStyle = hexA('#ff8a3d', 0.6);
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x - d.x * 24, b.y - d.y * 24);
        ctx.lineTo(b.x - d.x * 8, b.y - d.y * 8);
        ctx.stroke();
        ctx.fillStyle = '#ff5d73';
        ctx.beginPath();
        ctx.moveTo(b.x + d.x * 14, b.y + d.y * 14);
        ctx.lineTo(b.x - d.x * 8 + px * 6, b.y - d.y * 8 + py * 6);
        ctx.lineTo(b.x - d.x * 8 - px * 6, b.y - d.y * 8 - py * 6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff3cf';
        circle(ctx, b.x + d.x * 4, b.y + d.y * 4, 2.5);
        ctx.fill();
        continue;
      }
      if (b.kind === 'glacier') {
        // A frost orb: a glowing blue sphere with a chill ring around it.
        const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.radius + 8);
        g.addColorStop(0, 'rgba(179, 217, 255, 0.95)');
        g.addColorStop(0.6, 'rgba(138, 200, 255, 0.7)');
        g.addColorStop(1, 'rgba(93, 155, 255, 0)');
        ctx.fillStyle = g;
        circle(ctx, b.x, b.y, b.radius + 8);
        ctx.fill();
        ctx.fillStyle = '#8ac8ff';
        circle(ctx, b.x, b.y, b.radius);
        ctx.fill();
        ctx.fillStyle = '#dff2ff';
        circle(ctx, b.x - 3, b.y - 3, 3);
        ctx.fill();
        ctx.strokeStyle = hexA('#b3d9ff', 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      if (b.kind === 'meteor') {
        // A big burning meteor: a bright head, a long fiery trail, embers.
        const len = 54;
        ctx.strokeStyle = hexA('#ff8a3d', 0.55);
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x - d.x * len, b.y - d.y * len);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = hexA('#ffb347', 0.8);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(b.x - d.x * len * 0.6, b.y - d.y * len * 0.6);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.radius + 8);
        g.addColorStop(0, '#fff3b0');
        g.addColorStop(0.5, '#ff8a3d');
        g.addColorStop(1, 'rgba(255, 138, 61, 0)');
        ctx.fillStyle = g;
        circle(ctx, b.x, b.y, b.radius + 8);
        ctx.fill();
        ctx.fillStyle = '#fff3b0';
        circle(ctx, b.x, b.y, 5);
        ctx.fill();
        continue;
      }
      // Anything else is a plain bolt of the keeper's light.
      ctx.strokeStyle = tint.bolt;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = tint.wisp;
      circle(ctx, b.x, b.y, 3);
      ctx.fill();
    }
    for (const o of state.orbs) {
      const g = ctx.createRadialGradient(o.x, o.y, 1, o.x, o.y, o.radius + 6);
      g.addColorStop(0, 'rgba(200, 150, 255, 0.9)');
      g.addColorStop(1, 'rgba(150, 90, 220, 0)');
      ctx.fillStyle = g;
      circle(ctx, o.x, o.y, o.radius + 6);
      ctx.fill();
      ctx.fillStyle = '#c996ff';
      circle(ctx, o.x, o.y, o.radius * 0.7);
      ctx.fill();
    }
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      const pulse = 1 + Math.sin(state.time * 6 + pk.x) * 0.12;
      if (pk.kind === 'coin') {
        ctx.fillStyle = '#ffd700';
        circle(ctx, pk.x, pk.y, 7 * pulse);
        ctx.fill();
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#fff3b0';
        circle(ctx, pk.x - 2, pk.y - 2, 2.5);
        ctx.fill();
      } else if (pk.kind === 'magnet') {
        // The loot-all tool: a golden horseshoe that sweeps the field.
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(pk.x, pk.y, 9 * pulse, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        ctx.fillStyle = '#fff3b0';
        circle(ctx, pk.x - 8.5 * pulse, pk.y + 2.5 * pulse, 2.5);
        ctx.fill();
        circle(ctx, pk.x + 8.5 * pulse, pk.y + 2.5 * pulse, 2.5);
        ctx.fill();
      } else if (pk.kind === 'heart') {
        ctx.fillStyle = PALETTE.heart;
        heartPath(ctx, pk.x, pk.y, 9 * pulse);
        ctx.fill();
      } else if (pk.kind === 'shield') {
        ctx.strokeStyle = PALETTE.shield;
        ctx.lineWidth = 3;
        circle(ctx, pk.x, pk.y, 9 * pulse);
        ctx.stroke();
        ctx.fillStyle = PALETTE.shield;
        circle(ctx, pk.x, pk.y, 3);
        ctx.fill();
      } else if (pk.kind === 'rapid') {
        ctx.fillStyle = PALETTE.rapid;
        starPath(ctx, pk.x, pk.y, 10 * pulse);
        ctx.fill();
      } else if (pk.kind === 'timestop') {
        // The Time Stop: a cold-blue hourglass — two glass bulbs, a narrow
        // waist, a grain of sand in each. Rare, so it glows to stand out.
        const g = ctx.createRadialGradient(pk.x, pk.y, 1, pk.x, pk.y, 16 * pulse);
        g.addColorStop(0, 'rgba(138,200,255,0.5)');
        g.addColorStop(1, 'rgba(138,200,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(pk.x - 16 * pulse, pk.y - 16 * pulse, 32 * pulse, 32 * pulse);
        ctx.strokeStyle = '#8ac8ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pk.x - 7 * pulse, pk.y - 9 * pulse);
        ctx.lineTo(pk.x + 7 * pulse, pk.y - 9 * pulse);
        ctx.lineTo(pk.x, pk.y);
        ctx.lineTo(pk.x + 7 * pulse, pk.y + 9 * pulse);
        ctx.lineTo(pk.x - 7 * pulse, pk.y + 9 * pulse);
        ctx.lineTo(pk.x, pk.y);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = '#b3d9ff';
        circle(ctx, pk.x, pk.y - 4 * pulse, 2);
        ctx.fill();
        circle(ctx, pk.x, pk.y + 4 * pulse, 2);
        ctx.fill();
      } else {
        ctx.fillStyle = PALETTE.ember;
        circle(ctx, pk.x, pk.y, 6 * pulse);
        ctx.fill();
        ctx.fillStyle = '#ffd98a';
        circle(ctx, pk.x, pk.y, 3);
        ctx.fill();
      }
    }
  }

  /** The ultimate's expanding rings of light (Dawn Burst, Still Light). */
  function drawRings(state) {
    for (const r of state.rings) {
      const a = Math.max(0, r.life / r.maxLife);
      ctx.strokeStyle = hexA(r.color, 0.85 * a);
      ctx.lineWidth = 6 * a + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = hexA('#ffffff', 0.5 * a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(1, r.r - 8), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      circle(ctx, pt.x, pt.y, pt.size);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      ctx.globalAlpha = Math.min(1, f.life / 0.4);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHearts(state) {
    // Hearts can be halves (a keeper's max hearts need not be whole), so a
    // heart is whole, half or empty by how much of it the keeper still has.
    const p = state.player;
    for (let i = 0; i < p.maxHp; i += 1) {
      const x = 28 + i * 30;
      const y = 34;
      if (i + 1 <= p.hp) {
        ctx.fillStyle = PALETTE.heart;
        heartPath(ctx, x, y, 9);
        ctx.fill();
      } else if (i < p.hp) {
        ctx.strokeStyle = PALETTE.muted;
        ctx.lineWidth = 2;
        heartPath(ctx, x, y, 9);
        ctx.stroke();
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 11, y - 11, 11, 22);
        ctx.clip();
        ctx.fillStyle = PALETTE.heart;
        heartPath(ctx, x, y, 9);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.strokeStyle = PALETTE.muted;
        ctx.lineWidth = 2;
        heartPath(ctx, x, y, 9);
        ctx.stroke();
      }
    }
  }

  function drawHud(state, best) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText(`Score ${state.score}`, 20, 76);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`Best ${Math.max(best, state.score)}`, 20, 100);

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(`Wave ${Math.max(1, state.wave)} / ${WIN_WAVE}`, FIELD.width / 2, 40);
    ctx.font = `15px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    const left = state.enemies.length + Object.values(state.spawnQueue).reduce((a, b) => a + (b ?? 0), 0);
    ctx.fillText(state.waveState === 'fighting' ? `${left} shadows left` : '', FIELD.width / 2, 64);

    // The boss's health, front and centre while it lives — one bar per
    // boss, stacked, so endless boss waves show both at once. Each bar
    // wears the boss's own procedural icon at its left end.
    const bosses = state.enemies.filter((e) => e.boss);
    bosses.forEach((boss, i) => {
      const bw = 400;
      const bx = FIELD.width / 2 - bw / 2;
      // The bar sits below the "N shadows left" line (y=64), so the boss
      // name never prints on top of it.
      const by = 88 + i * 26;
      if (boss.icon) drawIcon(boss.icon, bx - 24, by + 5);
      ctx.textAlign = 'center';
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillStyle = '#ffd700';
      ctx.fillText(boss.bossName, FIELD.width / 2, by - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, bw, 10);
      ctx.fillStyle = '#ff5d73';
      ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), 10);
      ctx.strokeStyle = PALETTE.panelEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, 10);
    });

    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText('WASD move · Mouse aim · Auto-fire on · P pause', FIELD.width - 20, 24);
    // The purse: a gold coin and the count, top right.
    const coinText = `Coins ${state.coins}`;
    ctx.font = `bold 19px ${FONT}`;
    ctx.fillStyle = '#ffd700';
    const coinW = ctx.measureText(coinText).width;
    circle(ctx, FIELD.width - 20 - coinW - 16, 42, 8);
    ctx.fill();
    ctx.fillStyle = '#fff3b0';
    circle(ctx, FIELD.width - 20 - coinW - 18, 40, 2.5);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(coinText, FIELD.width - 20, 48);
    // The arsenal, one short label per weapon held. The keeper's own light
    // is listed under the keeper's name, not a weapon's.
    const shortName = { bolts: 'Bolts', spread: 'Fan', blades: 'Ring', rifle: 'Rifle', sniper: 'Sniper', grenade: 'Grenade', rpg: 'Rocket' };
    const keeperFor = {};
    for (const def of Object.values(CHARACTER_DEFS)) keeperFor[def.signature] = def.name;
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(
      state.player.weapons.map((w) => `${shortName[w.id] ?? keeperFor[w.id] ?? w.id} Lv${w.level}`).join('  ·  '),
      FIELD.width - 20,
      72,
    );
    drawHearts(state);
  }

  /** The bottom-centre HUD bar: keeper + level, every item slot, the ultimate. */
  function drawBottomBar(state) {
    const bar = { x: 250, y: 660, w: 780, h: 52 };
    // Translucent on purpose: the keeper walks behind it and stays visible.
    ctx.fillStyle = 'rgba(11, 14, 34, 0.78)';
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 12);
    ctx.fill();
    ctx.stroke();
    const p = state.player;
    const char = CHARACTER_DEFS[state.character] ?? CHARACTER_DEFS.ember;
    // The keeper: a glowing wisp, their signature-attack icon beside it
    // (clicking this corner opens the Stats tab), their name and level,
    // and the level gauge.
    const ix = bar.x + 28;
    const iy = bar.y + bar.h / 2;
    const g = ctx.createRadialGradient(ix, iy, 2, ix, iy, 22);
    g.addColorStop(0, hexA(char.color, 0.9));
    g.addColorStop(1, hexA(char.flame, 0));
    ctx.fillStyle = g;
    circle(ctx, ix, iy, 22);
    ctx.fill();
    ctx.fillStyle = char.color;
    circle(ctx, ix, iy, 10);
    ctx.fill();
    if (char.icon) drawIcon(char.icon, bar.x + 56, iy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = char.color;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText(char.name, bar.x + 74, bar.y + 22);
    const nameW = ctx.measureText(char.name).width;
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`Lv ${p.level}`, bar.x + 74 + nameW + 8, bar.y + 22);
    // The level gauge: cumulative XP toward the next level. The numbers sit
    // centred INSIDE the gauge (white on a dark outline), so the widest
    // count the game can show — "1425/1425" — still ends well left of the
    // divider at 452 and the section stays symmetric.
    const gx = bar.x + 74;
    const gy = bar.y + 30;
    const gw = 120;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(gx, gy, gw, 9);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(gx, gy, gw * Math.min(1, p.xp / Math.max(1, p.xpNeed)), 9);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, 9);
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(`${p.xp}/${p.xpNeed}`, gx + gw / 2, gy + 9);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${p.xp}/${p.xpNeed}`, gx + gw / 2, gy + 9);
    ctx.textAlign = 'left';
    // One slot per item type: owned ones lit with their icon and level,
    // the rest dimmed so the whole collection is visible at a glance.
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(452, bar.y + 8);
    ctx.lineTo(452, bar.y + bar.h - 8);
    ctx.stroke();
    ITEM_DEFS.forEach((def, i) => {
      const sx = 464 + i * 34;
      const sy = bar.y + 11;
      const level = p.items?.[def.id] ?? 0;
      const owned = level > 0;
      ctx.fillStyle = owned ? 'rgba(255, 215, 0, 0.08)' : 'rgba(0,0,0,0.25)';
      ctx.strokeStyle = owned ? 'rgba(255, 215, 0, 0.6)' : 'rgba(154, 148, 184, 0.35)';
      ctx.beginPath();
      ctx.roundRect(sx, sy, 30, 30, 6);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = owned ? 1 : 0.25;
      drawIcon(def.icon, sx + 15, sy + 15);
      ctx.globalAlpha = 1;
      if (owned) {
        ctx.fillStyle = '#ffd700';
        ctx.font = `bold 10px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.fillText(String(level), sx + 28, sy + 28);
        ctx.textAlign = 'left';
      }
    });
    // The ultimate: which ones are equipped, the lantern gauge, and whether
    // Q is ready. The gauge moved here from the top-left corner.
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(816, bar.y + 8);
    ctx.lineTo(816, bar.y + bar.h - 8);
    ctx.stroke();
    const ux = 828;
    const full = state.lantern >= 100;
    const ready = full && state.ultimates.length > 0;
    const names = state.ultimates.map((id) => describeUpgrade(id, state.upgradesTaken[id] ?? 1)?.name ?? id);
    let ultLine = names.length > 0 ? names.join(' · ') : 'No ultimate yet';
    ctx.font = `11px ${FONT}`;
    if (ctx.measureText(ultLine).width > 162 && names.length > 2) {
      ultLine = `${names.slice(0, 2).join(' · ')} +${names.length - 2}`;
    }
    // The equipped ultimate's own icon, beside its name and the gauge.
    const ultIcon = state.ultimates.length > 0
      ? describeUpgrade(state.ultimates[0], state.upgradesTaken[state.ultimates[0]] ?? 1)?.icon
      : null;
    if (ultIcon) drawIcon(ultIcon, ux + 12, bar.y + 20);
    ctx.fillStyle = names.length > 0 ? PALETTE.text : PALETTE.muted;
    ctx.textAlign = 'left';
    ctx.fillText(ultLine, ux + 28, bar.y + 20);
    // The lantern gauge: the numbers sit centred INSIDE it (white on a dark
    // outline), like the level gauge on the left — "Lantern 100%" is the
    // widest text and it still ends 8px short of the bar's right edge.
    const uy = bar.y + 30;
    const uw = 166;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(ux + 28, uy, uw, 9);
    ctx.fillStyle = ready ? '#ffd700' : '#ff9a3d';
    ctx.fillRect(ux + 28, uy, uw * Math.min(1, state.lantern / 100), 9);
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(ux + 28, uy, uw, 9);
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(ready ? 'Q READY' : `Lantern ${Math.floor(state.lantern)}%`, ux + 28 + uw / 2, uy + 9);
    ctx.fillStyle = '#fff';
    ctx.fillText(ready ? 'Q READY' : `Lantern ${Math.floor(state.lantern)}%`, ux + 28 + uw / 2, uy + 9);
    ctx.textAlign = 'left';
  }

  /** The status toggle: a small button at the top left, under the score.
   * It is an icon, not text — an open book, the status journal. Click it,
   * or press I. */
  function drawStatsToggle() {
    const r = statsToggleRect();
    ctx.fillStyle = 'rgba(10, 12, 30, 0.72)';
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 8);
    ctx.fill();
    ctx.stroke();
    drawIcon('book', r.x + r.w / 2, r.y + r.h / 2);
  }

  function drawBanner(state) {
    if (state.bannerTime <= 0 || !state.banner) return;
    const a = Math.min(1, state.bannerTime / 0.5);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.banner;
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillText(state.banner, FIELD.width / 2, 190);
    ctx.globalAlpha = 1;
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(10, 12, 30, 0.72)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();
  }

  /** The Back button (top-left): back to the main menu from the keeper
   * select and from the settings screen. */
  function drawBackButton() {
    const bb = backButtonRect();
    ctx.fillStyle = 'rgba(10, 12, 30, 0.72)';
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bb.x, bb.y, bb.w, bb.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 15px ${FONT}`;
    ctx.fillText('← Back · Esc', bb.x + 14, bb.y + 26);
  }

  /** The main menu: the title, the tagline, Start and Settings, the
   * controls line and the best score. Enter starts. */
  function drawMenu(state, best) {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.banner;
    ctx.font = `bold 84px ${FONT}`;
    ctx.shadowColor = 'rgba(255, 180, 70, 0.55)';
    ctx.shadowBlur = 34;
    ctx.fillText('EMBERLIGHT', FIELD.width / 2, 180);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `26px ${FONT}`;
    ctx.fillText('Keep the last lantern lit. Survive the night.', FIELD.width / 2, 222);
    const layout = menuLayout();
    const buttons = [['start', 'Start · Enter'], ['settings', 'Settings']];
    for (const [key, label] of buttons) {
      const b = layout[key];
      ctx.fillStyle = PALETTE.banner;
      ctx.strokeStyle = '#fff3cf';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2a1c08';
      ctx.font = `bold 22px ${FONT}`;
      if (key === 'start') {
        const pulse = 0.8 + 0.2 * Math.sin(state.time * 3);
        ctx.globalAlpha = pulse;
      }
      ctx.fillText(label, b.x + b.w / 2, b.y + 36);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `18px ${FONT}`;
    ctx.fillText('WASD move · Mouse aim · Auto-fire on · Q fires the ultimate when the lantern is full', FIELD.width / 2, 472);
    if (best > 0) {
      ctx.fillStyle = PALETTE.banner;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(`Best score ${best}`, FIELD.width / 2, 512);
    }
  }

  /** The settings screen: four settings, each a row of obviously clickable
   * buttons with the current value lit, and Back to the main menu. */
  function drawSettings(settings) {
    const layout = settingsLayout();
    const r = layout.panel;
    panel(r.x, r.y, r.w, r.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.banner;
    ctx.font = `bold 36px ${FONT}`;
    ctx.fillText('Settings', FIELD.width / 2, r.y + 52);
    for (const row of layout.rows) {
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText(row.label, r.x + 40, row.y + 31);
      for (const opt of row.options) {
        const current = settingsValue(settings, row.id) === opt.value;
        const b = opt.rect;
        ctx.fillStyle = current ? PALETTE.banner : PALETTE.card;
        ctx.strokeStyle = current ? '#fff3cf' : PALETTE.cardEdge;
        ctx.lineWidth = current ? 3 : 2;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 8);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = current ? '#2a1c08' : PALETTE.text;
        ctx.font = `bold 14px ${FONT}`;
        ctx.fillText(opt.value[0].toUpperCase() + opt.value.slice(1), b.x + b.w / 2, b.y + 30);
      }
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('Changes save automatically', FIELD.width / 2, r.y + r.h - 24);
    drawBackButton();
  }

  function drawTitle(state, best) {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.banner;
    ctx.font = `bold 84px ${FONT}`;
    ctx.shadowColor = 'rgba(255, 180, 70, 0.55)';
    ctx.shadowBlur = 34;
    ctx.fillText('EMBERLIGHT', FIELD.width / 2, 180);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `26px ${FONT}`;
    ctx.fillText('Keep the last lantern lit. Survive the night.', FIELD.width / 2, 222);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `18px ${FONT}`;
    ctx.fillText('WASD move · Mouse aim · Auto-fire on · Q fires the ultimate when the lantern is full', FIELD.width / 2, 254);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText('Choose your keeper', FIELD.width / 2, 296);

    const layout = characterLayout();
    CHARACTER_ORDER.forEach((id, i) => {
      const def = CHARACTER_DEFS[id];
      const r = layout.cards[i];
      const selected = state.character === id;
      ctx.fillStyle = PALETTE.card;
      ctx.strokeStyle = selected ? '#ffd700' : PALETTE.cardEdge;
      ctx.lineWidth = selected ? 3 : 2;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 12);
      ctx.fill();
      ctx.stroke();
      // The keeper themself: a glowing wisp in their colour.
      const cx = r.x + r.w / 2;
      const g = ctx.createRadialGradient(cx, r.y + 38, 2, cx, r.y + 38, 28);
      g.addColorStop(0, hexA(def.color, 0.9));
      g.addColorStop(1, hexA(def.flame, 0));
      ctx.fillStyle = g;
      circle(ctx, cx, r.y + 38, 28);
      ctx.fill();
      ctx.fillStyle = def.color;
      circle(ctx, cx, r.y + 38, 12);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 24px ${FONT}`;
      ctx.fillText(def.name, cx, r.y + 72);
      // Their light's form: the attack itself, not a weapon held.
      ctx.fillStyle = PALETTE.banner;
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText(def.signatureName, cx, r.y + 96);
      // The radar: their real base stats, so the keepers tell apart at a glance.
      drawRadar(ctx, def, cx, r.y + 166, 44);
      // How they attack, wrapped to the card. It starts high enough that a
      // three-line description still clears the Chosen / [N] line at the foot.
      ctx.fillStyle = PALETTE.text;
      ctx.font = `13px ${FONT}`;
      const words = def.desc.split(' ');
      let line = '';
      let ly = r.y + 242;
      for (const w of words) {
        if (ctx.measureText(`${line} ${w}`.trim()).width > r.w - 28) {
          ctx.fillText(line.trim(), cx, ly);
          line = w;
          ly += 16;
        } else {
          line = `${line} ${w}`;
        }
      }
      ctx.fillText(line.trim(), cx, ly);
      ctx.fillStyle = selected ? '#ffd700' : PALETTE.muted;
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText(selected ? '✓ Chosen' : `[${i + 1}]`, cx, r.y + 296);
    });

    const btn = layout.begin;
    ctx.fillStyle = PALETTE.banner;
    ctx.strokeStyle = '#fff3cf';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a1c08';
    ctx.font = `bold 22px ${FONT}`;
    const pulse = 0.8 + 0.2 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillText('Begin the Night · Enter', btn.x + btn.w / 2, btn.y + 32);
    ctx.globalAlpha = 1;

    if (best > 0) {
      ctx.fillStyle = PALETTE.banner;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(`Best score ${best}`, FIELD.width / 2, 694);
    }

    // Back to the main menu: the button, or Esc / M.
    drawBackButton();
  }

  /**
   * A small procedural icon, centred at (x, y) — the single icon system for
   * shop items, weapons, cards, ultimates, keepers, bosses, tabs and buttons.
   * Every icon is canvas-drawn (no image files, no network); each id has its
   * own colour baked in. Coordinates run roughly -11..+11 from the centre.
   */
  function drawIcon(icon, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 2;
    // A five-point star at (cx, cy) with outer radius r.
    const starAt = (cx, cy, r) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const a = (Math.PI * i) / 5 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    };
    if (icon === 'bolt') {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(2, -11);
      ctx.lineTo(-5, 1);
      ctx.lineTo(0, 1);
      ctx.lineTo(-2, 11);
      ctx.lineTo(5, -1);
      ctx.lineTo(0, -1);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 'heart') {
      ctx.fillStyle = '#ff6b81';
      heartPath(ctx, 0, 0, 9);
      ctx.fill();
    } else if (icon === 'plus') {
      ctx.fillStyle = '#7ddba3';
      ctx.fillRect(-2.5, -9, 5, 18);
      ctx.fillRect(-9, -2.5, 18, 5);
    } else if (icon === 'drop') {
      ctx.fillStyle = '#ff8a9a';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.quadraticCurveTo(8, 2, 0, 9);
      ctx.quadraticCurveTo(-8, 2, 0, -10);
      ctx.fill();
    } else if (icon === 'clock') {
      ctx.strokeStyle = '#f2ead8';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -6);
      ctx.moveTo(0, 0);
      ctx.lineTo(5, 2);
      ctx.stroke();
    } else if (icon === 'coin') {
      ctx.fillStyle = '#ffd700';
      circle(ctx, 0, 0, 9);
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      circle(ctx, 0, 0, 4);
      ctx.fill();
    } else if (icon === 'magnet') {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -1, 8, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    } else if (icon === 'pouch') {
      ctx.fillStyle = '#ffd700';
      circle(ctx, 0, 3, 7);
      ctx.fill();
      ctx.fillStyle = '#b8860b';
      ctx.fillRect(-4, -9, 8, 4);
    } else if (icon === 'chevrons') {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-6, -8);
      ctx.lineTo(2, 0);
      ctx.lineTo(-6, 8);
      ctx.moveTo(1, -8);
      ctx.lineTo(9, 0);
      ctx.lineTo(1, 8);
      ctx.stroke();
    } else if (icon === 'boots') {
      ctx.fillStyle = '#c98a4b';
      ctx.beginPath();
      ctx.moveTo(-7, -9);
      ctx.lineTo(1, -9);
      ctx.lineTo(1, -1);
      ctx.lineTo(8, -1);
      ctx.lineTo(8, 6);
      ctx.lineTo(-7, 6);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 'fan') {
      ctx.strokeStyle = '#ff9a3d';
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(-8, -6);
      ctx.moveTo(0, 8);
      ctx.lineTo(0, -9);
      ctx.moveTo(0, 8);
      ctx.lineTo(8, -6);
      ctx.stroke();
    } else if (icon === 'ring') {
      ctx.strokeStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (icon === 'crosshair') {
      ctx.strokeStyle = '#dff2ff';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-4, 0);
      ctx.moveTo(4, 0);
      ctx.lineTo(10, 0);
      ctx.moveTo(0, -10);
      ctx.lineTo(0, -4);
      ctx.moveTo(0, 4);
      ctx.lineTo(0, 10);
      ctx.stroke();
    } else if (icon === 'bomb') {
      ctx.fillStyle = '#3a3a4e';
      circle(ctx, 0, 2, 7);
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(4, -4);
      ctx.lineTo(7, -8);
      ctx.stroke();
    } else if (icon === 'rocket') {
      ctx.fillStyle = '#ff5d73';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(5, 4);
      ctx.lineTo(0, 8);
      ctx.lineTo(-5, 4);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 'sun') {
      // Dawn Burst: a bursting sun — a bright core with eight rays.
      ctx.fillStyle = '#ffd700';
      circle(ctx, 0, 0, 5);
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i += 1) {
        const a = (Math.PI * i) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
        ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
        ctx.stroke();
      }
    } else if (icon === 'meteor') {
      // Emberfall: a falling meteor — a burning head with a tail.
      ctx.fillStyle = '#ff8a3d';
      circle(ctx, 2, -3, 5);
      ctx.fill();
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-8, 8);
      ctx.moveTo(-2, 1);
      ctx.lineTo(-9, 10);
      ctx.moveTo(2, 2);
      ctx.lineTo(-4, 10);
      ctx.stroke();
    } else if (icon === 'snowflake') {
      // Still Light: a frozen star — six spokes from a cold core.
      ctx.strokeStyle = '#8ac8ff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i += 1) {
        const a = (Math.PI * i) / 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * -9, Math.sin(a) * -9);
        ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
        ctx.stroke();
      }
      ctx.fillStyle = '#b3d9ff';
      circle(ctx, 0, 0, 2.5);
      ctx.fill();
    } else if (icon === 'lance') {
      // Blood Lance: a heavy piercing lance — a diagonal shaft and head.
      ctx.strokeStyle = '#ff5d73';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, 8);
      ctx.lineTo(5, -5);
      ctx.stroke();
      ctx.fillStyle = '#ff8a7a';
      ctx.beginPath();
      ctx.moveTo(9, -9);
      ctx.lineTo(2, -4);
      ctx.lineTo(4, -2);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 'orb') {
      // Glacier Shell: a bursting frost-light orb — a cold sphere with a swirl.
      ctx.fillStyle = '#8ac8ff';
      circle(ctx, 0, 0, 8);
      ctx.fill();
      ctx.strokeStyle = '#5d9bff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 4, Math.PI * 0.6, Math.PI * 1.7);
      ctx.stroke();
      ctx.fillStyle = '#dff2ff';
      circle(ctx, -2, -3, 2);
      ctx.fill();
    } else if (icon === 'sunfan') {
      // Sun Fan: a fan of light bolts — five rays from one point.
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 2.5;
      for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.lineTo(Math.sin(a) * 9, 8 - Math.cos(a) * 15);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd98a';
      circle(ctx, 0, 8, 3);
      ctx.fill();
    } else if (icon === 'star') {
      ctx.fillStyle = '#ffd700';
      starAt(0, 0, 10);
      ctx.fill();
    } else if (icon === 'blade') {
      // A short curved blade, edge down.
      ctx.fillStyle = '#c8d4e8';
      ctx.beginPath();
      ctx.moveTo(2, -10);
      ctx.quadraticCurveTo(9, 0, 0, 9);
      ctx.quadraticCurveTo(-2, 0, -2, -8);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 'sword') {
      // A long sword, diagonal, with a hilt.
      ctx.strokeStyle = '#e8eef7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-7, 7);
      ctx.lineTo(6, -6);
      ctx.stroke();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-9, 3);
      ctx.lineTo(-3, 9);
      ctx.stroke();
    } else if (icon === 'flame') {
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.quadraticCurveTo(7, -2, 7, 3);
      ctx.quadraticCurveTo(7, 9, 0, 9);
      ctx.quadraticCurveTo(-7, 9, -7, 3);
      ctx.quadraticCurveTo(-7, -2, 0, -10);
      ctx.fill();
      ctx.fillStyle = '#ffd700';
      circle(ctx, 0, 4, 3);
      ctx.fill();
    } else if (icon === 'spark') {
      // A four-point sparkle.
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(2.5, -2.5);
      ctx.lineTo(10, 0);
      ctx.lineTo(2.5, 2.5);
      ctx.lineTo(0, 10);
      ctx.lineTo(-2.5, 2.5);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-2.5, -2.5);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 'wing') {
      // A wing: three curved feathers.
      ctx.strokeStyle = '#b3d9ff';
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-9, 6 - i * 5);
        ctx.quadraticCurveTo(0, 2 - i * 5, 9, -4 - i * 2);
        ctx.stroke();
      }
    } else if (icon === 'refresh') {
      // A circular arrow: re-roll the offer.
      ctx.strokeStyle = '#7ddba3';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 8, -0.5, Math.PI * 1.4);
      ctx.stroke();
      ctx.fillStyle = '#7ddba3';
      ctx.beginPath();
      ctx.moveTo(9, -4);
      ctx.lineTo(11, 3);
      ctx.lineTo(4, 2);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 'book') {
      // An open book: the status journal.
      ctx.fillStyle = '#f2ead8';
      ctx.beginPath();
      ctx.moveTo(-9, -7);
      ctx.quadraticCurveTo(0, -10, 0, -7);
      ctx.quadraticCurveTo(0, -10, 9, -7);
      ctx.lineTo(9, 7);
      ctx.quadraticCurveTo(0, 4, 0, 7);
      ctx.quadraticCurveTo(0, 4, -9, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2a1c08';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(0, 7);
      ctx.stroke();
    } else if (icon === 'shield') {
      ctx.fillStyle = '#7dd7ff';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(8, -6);
      ctx.lineTo(8, 1);
      ctx.quadraticCurveTo(8, 8, 0, 10);
      ctx.quadraticCurveTo(-8, 8, -8, 1);
      ctx.lineTo(-8, -6);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 'lantern') {
      // A lantern: a rounded body, a handle, a glow.
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -7, 4, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.roundRect(-6, -3, 12, 12, 3);
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      circle(ctx, 0, 3, 3);
      ctx.fill();
    } else if (icon === 'net') {
      // A wide net: a circle with a cross-hatch.
      ctx.strokeStyle = '#b3d9ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(9, 0);
      ctx.moveTo(0, -9);
      ctx.lineTo(0, 9);
      ctx.moveTo(-6, -6);
      ctx.lineTo(6, 6);
      ctx.moveTo(6, -6);
      ctx.lineTo(-6, 6);
      ctx.stroke();
    } else if (icon === 'charm') {
      // A coin charm: a gold coin with a star.
      ctx.fillStyle = '#ffd700';
      circle(ctx, 0, 0, 9);
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      starAt(0, 0, 5);
      ctx.fill();
    } else if (icon === 'icicle') {
      // A frost icicle, tip down.
      ctx.fillStyle = '#8ac8ff';
      ctx.beginPath();
      ctx.moveTo(0, 10);
      ctx.lineTo(5, -6);
      ctx.lineTo(-5, -6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#b3d9ff';
      circle(ctx, 0, -7, 2.5);
      ctx.fill();
    } else if (icon === 'vessel') {
      // A chalice: a cup on a stem.
      ctx.fillStyle = '#c8d4e8';
      ctx.beginPath();
      ctx.moveTo(-7, -9);
      ctx.lineTo(7, -9);
      ctx.quadraticCurveTo(7, -2, 0, -1);
      ctx.quadraticCurveTo(-7, -2, -7, -9);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-1.5, -1, 3, 7);
      ctx.fillRect(-5, 6, 10, 2.5);
    } else if (icon === 'orbit') {
      // An orbiting light: a ring, a centre wisp, a mote on the ring.
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd98a';
      circle(ctx, 0, 0, 3);
      ctx.fill();
      circle(ctx, 8, 0, 2.5);
      ctx.fill();
    } else if (icon === 'potion') {
      // A heart flask: a round bottle with a neck.
      ctx.fillStyle = '#ff6b81';
      circle(ctx, 0, 4, 6);
      ctx.fill();
      ctx.fillRect(-2.5, -9, 5, 6);
      ctx.fillStyle = '#fff3b0';
      circle(ctx, -2, 3, 2);
      ctx.fill();
    } else if (icon === 'wick') {
      // A candle: a wick with a flame on top.
      ctx.fillStyle = '#f2ead8';
      ctx.fillRect(-3.5, -2, 7, 11);
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.quadraticCurveTo(4, -4, 0, -2);
      ctx.quadraticCurveTo(-4, -4, 0, -10);
      ctx.fill();
    } else if (icon === 'burst') {
      // A burst: radiating lines from a bright core.
      ctx.fillStyle = '#ff9a3d';
      circle(ctx, 0, 0, 4);
      ctx.fill();
      ctx.strokeStyle = '#ff9a3d';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI * i) / 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
        ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
        ctx.stroke();
      }
    } else if (icon === 'arrow') {
      // A projectile arrow, flying right.
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(3, -5);
      ctx.lineTo(3, 5);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 'dart') {
      // A swift dart: a small bolt with a tail.
      ctx.fillStyle = '#b3d9ff';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-2, -4);
      ctx.lineTo(-2, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#8ac8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-10, 0);
      ctx.stroke();
    } else if (icon === 'halo') {
      // A burning halo: a ring with four flame ticks.
      ctx.strokeStyle = '#ff9a3d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffd700';
      for (let i = 0; i < 4; i += 1) {
        const a = (Math.PI * i) / 2 + Math.PI / 4;
        circle(ctx, Math.cos(a) * 7, Math.sin(a) * 7, 1.8);
        ctx.fill();
      }
    } else if (icon === 'moon') {
      // A crescent moon: slow, steady healing.
      ctx.fillStyle = '#b3d9ff';
      ctx.beginPath();
      ctx.arc(0, 0, 9, -1.2, 1.9);
      ctx.quadraticCurveTo(-2, 4, -6, -6);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 'eye') {
      // A keen eye: dead-eye aim.
      ctx.strokeStyle = '#dff2ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#5d9bff';
      circle(ctx, 0, 0, 3);
      ctx.fill();
    } else if (icon === 'twinbolt') {
      // Twin sparks: two bolts side by side.
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(-4, -10);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-7, 10);
      ctx.lineTo(-2, -1);
      ctx.lineTo(-5, -1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(5, -10);
      ctx.lineTo(1, 0);
      ctx.lineTo(4, 0);
      ctx.lineTo(2, 10);
      ctx.lineTo(7, -1);
      ctx.lineTo(4, -1);
      ctx.closePath();
      ctx.fill();
    } else if (icon === 'twin') {
      // Twin Maw: two heads, barely holding together.
      ctx.fillStyle = '#6e3a2a';
      circle(ctx, -4, 0, 6);
      ctx.fill();
      circle(ctx, 4, 0, 6);
      ctx.fill();
      ctx.fillStyle = '#ff6b81';
      circle(ctx, -4, 0, 2);
      ctx.fill();
      circle(ctx, 4, 0, 2);
      ctx.fill();
    } else if (icon === 'charge') {
      // Gloomfiend: a charging arrow with speed lines.
      ctx.fillStyle = '#b48ae8';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(1, -6);
      ctx.lineTo(1, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#b48ae8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-3, -5);
      ctx.lineTo(-10, -5);
      ctx.moveTo(-3, 0);
      ctx.lineTo(-10, 0);
      ctx.moveTo(-3, 5);
      ctx.lineTo(-10, 5);
      ctx.stroke();
    } else if (icon === 'spread') {
      // Spitmother: a fan of three orbs.
      ctx.fillStyle = '#ff8a7a';
      circle(ctx, -7, 3, 3.5);
      ctx.fill();
      circle(ctx, 0, -5, 3.5);
      ctx.fill();
      circle(ctx, 7, 3, 3.5);
      ctx.fill();
      ctx.strokeStyle = '#ff8a7a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(-7, 3);
      ctx.moveTo(0, 8);
      ctx.lineTo(0, -5);
      ctx.moveTo(0, 8);
      ctx.lineTo(7, 3);
      ctx.stroke();
    } else if (icon === 'summon') {
      // Stormcaller: a summoning star with minions gathering.
      ctx.fillStyle = '#7ddba3';
      starAt(0, -2, 7);
      ctx.fill();
      ctx.fillStyle = '#2a6e4a';
      circle(ctx, -8, 7, 2.5);
      ctx.fill();
      circle(ctx, 8, 7, 2.5);
      ctx.fill();
    } else if (icon === 'night') {
      // The Long Night: a dark sun — a crescent in a ring, with a star.
      ctx.strokeStyle = '#8a9bb8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#5d6b8c';
      ctx.beginPath();
      ctx.arc(-1, 0, 5, -1.2, 1.9);
      ctx.quadraticCurveTo(-3, 3, -5, -4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd700';
      starAt(6, -6, 3);
      ctx.fill();
    } else if (icon === 'chart') {
      // A bar chart: the live stats.
      ctx.fillStyle = '#7ddba3';
      ctx.fillRect(-9, 2, 5, 8);
      ctx.fillRect(-2, -3, 5, 13);
      ctx.fillRect(5, -8, 5, 18);
    } else if (icon === 'hourglass') {
      // An hourglass: the Time Stop — two glass bulbs, a narrow waist.
      ctx.strokeStyle = '#8ac8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-7, -9);
      ctx.lineTo(7, -9);
      ctx.lineTo(0, 0);
      ctx.lineTo(7, 9);
      ctx.lineTo(-7, 9);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#b3d9ff';
      circle(ctx, 0, -4, 2);
      ctx.fill();
      circle(ctx, 0, 4, 2);
      ctx.fill();
    } else if (icon === 'x') {
      // A close cross.
      ctx.strokeStyle = '#2a1c08';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-6, -6);
      ctx.lineTo(6, 6);
      ctx.moveTo(6, -6);
      ctx.lineTo(-6, 6);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawUpgrade(state) {
    const layout = upgradeLayout(state);
    panel(layout.panel.x, layout.panel.y, layout.panel.w, layout.panel.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.banner;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText(`Wave ${state.wave} cleared!`, FIELD.width / 2, 152);
    // A boss reward is announced under the title, and the instruction drops
    // a line — the rows below shift down to make room (see upgradeLayout).
    const reward = state.bossReward ?? [];
    if (reward.length > 0) {
      ctx.fillStyle = '#ffd700';
      ctx.font = `bold 19px ${FONT}`;
      const names = reward.map((c) => `${c.name} ${['I', 'II', 'III'][c.level - 1] ?? c.level}`).join('  ·  ');
      ctx.fillText(`Boss reward:  ${names}`, FIELD.width / 2, 184);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `19px ${FONT}`;
      ctx.fillText('Choose a card, spend coins in the shop, then begin the next wave.', FIELD.width / 2, 206);
    } else {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `19px ${FONT}`;
      ctx.fillText('Choose a card, spend coins in the shop, then begin the next wave.', FIELD.width / 2, 184);
    }

    const pickedId = state.cardPicked ? state.pickedId : null;
    state.offer.forEach((card, i) => {
      const r = layout.cards[i];
      const picked = pickedId === card.id;
      ctx.globalAlpha = state.cardPicked && !picked ? 0.45 : 1;
      ctx.fillStyle = PALETTE.card;
      ctx.strokeStyle = picked ? PALETTE.banner : PALETTE.cardEdge;
      ctx.lineWidth = picked ? 3 : 2;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 12);
      ctx.fill();
      ctx.stroke();
      // The card's own procedural icon, top-left — the category tag stays
      // centred, so the two never collide.
      if (card.icon) drawIcon(card.icon, r.x + 26, r.y + 26);
      // Category tag, then the name.
      ctx.fillStyle = CATEGORY_COLORS[card.category] ?? PALETTE.muted;
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillText(card.category.toUpperCase(), r.x + r.w / 2, r.y + 30);
      ctx.fillStyle = PALETTE.banner;
      ctx.font = `bold 21px ${FONT}`;
      ctx.fillText(card.name, r.x + r.w / 2, r.y + 60);
      // Level pips: filled for the level this pick would reach. A repeatable
      // (endless fallback) card has no ceiling, so it shows its taken count.
      const nextLevel = card.level + 1;
      let pips = '';
      if (card.repeatable) {
        pips = `Lv ${nextLevel}`;
      } else {
        for (let p = 0; p < card.max; p += 1) pips += p < nextLevel ? '●' : '○';
        pips += `  Lv ${['I', 'II', 'III'][nextLevel - 1] ?? nextLevel}`;
      }
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 17px ${FONT}`;
      ctx.fillText(pips, r.x + r.w / 2, r.y + 90);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `16px ${FONT}`;
      const words = card.text.split(' ');
      let line = '';
      let ly = r.y + 122;
      for (const w of words) {
        if (ctx.measureText(`${line} ${w}`.trim()).width > r.w - 36) {
          ctx.fillText(line.trim(), r.x + r.w / 2, ly);
          line = w;
          ly += 22;
        } else {
          line = `${line} ${w}`;
        }
      }
      ctx.fillText(line.trim(), r.x + r.w / 2, ly);
      ctx.fillStyle = picked ? PALETTE.banner : PALETTE.muted;
      ctx.font = `bold 17px ${FONT}`;
      ctx.fillText(picked ? '✓ Chosen' : `[${i + 1}]`, r.x + r.w / 2, r.y + 176);
      ctx.globalAlpha = 1;
    });

    // The shop, on the same grid as the cards.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.banner;
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(`SHOP  —  ${state.coins} coins`, layout.shopLabel.x, layout.shopLabel.y);
    state.shopOffer.forEach((item, i) => {
      const r = layout.shop[i];
      const afford = state.coins >= item.price;
      ctx.globalAlpha = afford ? 1 : 0.5;
      ctx.fillStyle = PALETTE.panel;
      ctx.strokeStyle = PALETTE.panelEdge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 12);
      ctx.fill();
      ctx.stroke();
      if (item.icon) drawIcon(item.icon, r.x + 24, r.y + 26);
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText(item.name, r.x + r.w / 2, r.y + 30);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `14px ${FONT}`;
      const words = item.text.split(' ');
      let line = '';
      let ly = r.y + 54;
      for (const w of words) {
        if (ctx.measureText(`${line} ${w}`.trim()).width > r.w - 28) {
          ctx.fillText(line.trim(), r.x + r.w / 2, ly);
          line = w;
          ly += 17;
        } else {
          line = `${line} ${w}`;
        }
      }
      ctx.fillText(line.trim(), r.x + r.w / 2, ly);
      ctx.fillStyle = afford ? '#ffd700' : '#ff8a8a';
      ctx.font = `bold 17px ${FONT}`;
      ctx.fillText(`${item.price} coins  [${i + 5}]`, r.x + r.w / 2, r.y + 80);
      ctx.globalAlpha = 1;
    });

    // Re-roll the card offer: free while Second Look lasts, then coins,
    // at most 3 times a wave — and only before a card is picked.
    const rb = layout.refresh;
    const price = REFRESH_PRICES[state.refreshesUsed] ?? 50;
    const free = state.freeRefreshes > 0;
    const maxed = state.refreshesUsed >= REFRESH_MAX;
    const canRefresh = !state.cardPicked && !maxed && (free || state.coins >= price);
    ctx.globalAlpha = canRefresh ? 1 : 0.5;
    ctx.fillStyle = canRefresh ? PALETTE.banner : PALETTE.panelEdge;
    ctx.strokeStyle = canRefresh ? '#fff3cf' : PALETTE.muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(rb.x, rb.y, rb.w, rb.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = canRefresh ? '#2a1c08' : PALETTE.muted;
    ctx.font = `bold 14px ${FONT}`;
    const refreshLabel = state.cardPicked
      ? 'Refresh · card picked'
      : maxed
        ? 'Refresh · 3/3 used'
        : `Refresh · ${free ? 'FREE' : `${price} coins`} · ${state.refreshesUsed}/3  [R]`;
    // The icon and the label are one centred group (the button dims as a
    // whole when it cannot be used, so the icon dims with it).
    const rlW = ctx.measureText(refreshLabel).width;
    drawIcon('refresh', rb.x + rb.w / 2 - (rlW + 28) / 2 + 11, rb.y + 24);
    ctx.fillText(refreshLabel, rb.x + rb.w / 2 + 14, rb.y + 30);
    ctx.globalAlpha = 1;

    // The way on: only once a card is picked.
    const btn = layout.nextWave;
    const ready = state.cardPicked;
    ctx.fillStyle = ready ? PALETTE.banner : PALETTE.panelEdge;
    ctx.strokeStyle = ready ? '#fff3cf' : PALETTE.muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = ready ? '#2a1c08' : PALETTE.muted;
    ctx.font = `bold 20px ${FONT}`;
    // The icon and the label are one centred group, so the button reads as
    // one control; the "pick a card" state has no icon (it is not a button).
    const nextLabel = ready ? `Begin Wave ${state.wave + 1}  ·  Enter` : 'Pick a card to continue';
    const nlW = ctx.measureText(nextLabel).width;
    if (ready) drawIcon('chevrons', btn.x + btn.w / 2 - (nlW + 28) / 2 + 11, btn.y + 24);
    ctx.fillText(nextLabel, btn.x + btn.w / 2 + (ready ? 14 : 0), btn.y + 31);
  }

  function drawPaused() {
    const layout = pauseLayout();
    panel(layout.panel.x, layout.panel.y, layout.panel.w, layout.panel.h);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillText('Paused', FIELD.width / 2, 300);
    // The pause menu: Resume, Settings, Menu — each button labelled with
    // its key, so the keys and the clicks agree.
    for (const [key, label] of [['resume', 'Resume · P'], ['settings', 'Settings · S'], ['menu', 'Menu · M']]) {
      const b = layout[key];
      ctx.fillStyle = PALETTE.banner;
      ctx.strokeStyle = '#fff3cf';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2a1c08';
      ctx.font = `bold 17px ${FONT}`;
      ctx.fillText(label, FIELD.width / 2, b.y + 31);
    }
  }

  /** The rows the status panel lists for one tab: name, level pips, text.
   * Every row carries the icon the panel draws beside it. A repeatable
   * (endless fallback) card shows its taken count as "Lv N" instead of pips
   * — it has no ceiling, so pips would be meaningless. */
  function statsRows(state, tab) {
    const pips = (level, max) => '●'.repeat(level) + '○'.repeat(Math.max(0, max - level));
    const levelText = (v) => (v.repeatable ? `Lv ${v.level}` : pips(v.level, v.max));
    if (tab === 'items') {
      return Object.entries(state.player.items ?? {})
        .map(([id, level]) => itemView(id, level))
        .filter(Boolean)
        .map((v) => ({ name: v.name, level: pips(v.level, v.maxLevel), text: v.text, icon: v.icon }));
    }
    if (tab === 'ultimates') {
      return state.ultimates.map((id) => {
        const v = describeUpgrade(id, state.upgradesTaken[id] ?? 1);
        const ready = state.lantern >= 100;
        return {
          name: v ? v.name : id,
          level: v ? pips(v.level, v.max) : '',
          text: v ? `${v.text} — ${ready ? 'READY, press Q' : `Lantern ${Math.floor(state.lantern)}%`}` : '',
          icon: v ? v.icon : null,
        };
      });
    }
    if (tab === 'stats') {
      // The keeper's live stats: the label, the real current value (gold),
      // and a short note. playerStats reads straight from the state.
      return playerStats(state).map((s) => ({ name: s.name, level: s.value, text: s.note, icon: s.icon }));
    }
    // Upgrades: every card taken, ultimates excepted (they have their own tab).
    return Object.entries(state.upgradesTaken)
      .map(([id, level]) => describeUpgrade(id, level))
      .filter((v) => v && v.kind !== 'ultimate')
      .map((v) => ({ name: v.name, level: levelText(v), text: `${v.category} — ${v.text}`, icon: v.icon }));
  }

  function statsEmptyText(tab) {
    if (tab === 'items') return 'No items yet — spend coins in the shop between waves.';
    if (tab === 'ultimates') return 'No ultimate yet — every keeper is born with their own; its upgrade card can appear in any wave.';
    if (tab === 'stats') return 'No stats yet — the keeper has not begun.';
    return 'No upgrades yet — clear a wave and pick a card.';
  }

  /**
   * The status panel: everything the keeper has collected, in four tabs.
   * Opening it pauses the game, so the keeper can read it safely.
   */
  function drawStatsPanel(state, tab) {
    const layout = statsPanelLayout();
    const r = layout.panel;
    ctx.fillStyle = 'rgba(5, 7, 18, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    panel(r.x, r.y, r.w, r.h);
    const char = CHARACTER_DEFS[state.character] ?? CHARACTER_DEFS.ember;
    ctx.textAlign = 'left';
    ctx.fillStyle = char.color;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(`${char.name} · Lv ${state.player.level}`, r.x + 40, r.y + 42);
    const btn = layout.close;
    ctx.fillStyle = PALETTE.banner;
    ctx.strokeStyle = '#fff3cf';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a1c08';
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    // The close cross and the label are one centred group.
    const closeLabel = 'Close · P';
    const closeW = ctx.measureText(closeLabel).width;
    drawIcon('x', btn.x + btn.w / 2 - (closeW + 28) / 2 + 11, btn.y + 17);
    ctx.fillText(closeLabel, btn.x + btn.w / 2 + 14, btn.y + 23);
    for (const t of layout.tabs) {
      const active = t.id === tab;
      ctx.fillStyle = active ? PALETTE.banner : PALETTE.card;
      ctx.strokeStyle = active ? '#fff3cf' : PALETTE.cardEdge;
      ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(t.rect.x, t.rect.y, t.rect.w, t.rect.h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? '#2a1c08' : PALETTE.muted;
      ctx.font = `bold 16px ${FONT}`;
      ctx.textAlign = 'center';
      // The tab's icon and label are one centred group.
      const labelW = ctx.measureText(t.label).width;
      const groupW = labelW + (t.icon ? 28 : 0);
      if (t.icon) drawIcon(t.icon, t.rect.x + t.rect.w / 2 - groupW / 2 + 11, t.rect.y + 20);
      ctx.fillText(t.label, t.rect.x + t.rect.w / 2 + (t.icon ? 14 : 0), t.rect.y + 26);
    }
    const rows = statsRows(state, tab);
    const list = layout.list;
    if (rows.length === 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(statsEmptyText(tab), FIELD.width / 2, list.y + 40);
      return;
    }
    const colW = (list.w - 16) / 2;
    const rowH = 44;
    ctx.textAlign = 'left';
    rows.forEach((row, i) => {
      const col = i < 8 ? 0 : 1;
      const ri = i % 8;
      const x = list.x + col * (colW + 16);
      const y = list.y + ri * rowH;
      // The row's own icon, at its left; the name and text shift right.
      const tx = x + (row.icon ? 30 : 0);
      if (row.icon) drawIcon(row.icon, x + 11, y + 12);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText(row.name, tx, y + 16);
      const nameW = ctx.measureText(row.name).width;
      ctx.fillStyle = '#ffd700';
      ctx.font = `13px ${FONT}`;
      ctx.fillText(row.level, tx + nameW + 8, y + 16);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `12px ${FONT}`;
      ctx.fillText(row.text, tx, y + 36);
    });
  }

  function drawStats(state, best, title, line, prompt) {
    panel(FIELD.width / 2 - 300, 150, 600, 400);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.banner;
    ctx.font = `bold 46px ${FONT}`;
    ctx.fillText(title, FIELD.width / 2, 222);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `22px ${FONT}`;
    ctx.fillText(line, FIELD.width / 2, 262);
    const acc = state.shotsFired > 0 ? Math.round((100 * state.hits) / state.shotsFired) : 0;
    ctx.font = `20px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`Score ${state.score}    ·    Wave ${state.wave}    ·    Shadows felled ${state.kills}`, FIELD.width / 2, 320);
    ctx.fillText(`Bolts ${state.shotsFired}    ·    Accuracy ${acc}%    ·    Coins ${state.coinsCollected}`, FIELD.width / 2, 352);
    ctx.fillStyle = PALETTE.banner;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(`Best score ${Math.max(best, state.score)}`, FIELD.width / 2, 400);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 22px ${FONT}`;
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillText(prompt, FIELD.width / 2, 486);
    ctx.globalAlpha = 1;
    // Back to the title: the button, or M. The end screens share one panel
    // and one button rect.
    const mb = menuButtonRect(SCREEN_OVER);
    ctx.fillStyle = PALETTE.banner;
    ctx.strokeStyle = '#fff3cf';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(mb.x, mb.y, mb.w, mb.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a1c08';
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillText('Menu · M', FIELD.width / 2, mb.y + 27);
  }

  function draw(state, screen, best, statsTab = 'upgrades', settings = DEFAULT_SETTINGS) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shake = state.shake;
    const ox = shake > 0.2 ? Math.sin(state.time * 127.1) * shake * 0.6 : 0;
    const oy = shake > 0.2 ? Math.cos(state.time * 311.7) * shake * 0.6 : 0;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.ox + ox * view.scale, view.oy + oy * view.scale);

    drawBackground(state);
    if (screen !== SCREEN_TITLE && screen !== SCREEN_MENU && screen !== SCREEN_SETTINGS) {
      drawLanternGlow(state);
      for (const e of state.enemies) drawEnemy(e, state.time, state.player);
      drawHalo(state);
      drawBullets(state);
      drawOrbit(state);
      drawPickups(state);
      drawPlayer(state);
      drawParticles(state);
      drawHud(state, best);
      drawBanner(state);
    } else {
      // The menu, the select and the settings keep only the glow and the
      // drifting embers: the wisp would sit on top of the instructions.
      drawLanternGlow(state);
      drawParticles(state);
    }

    // A Dawn Burst whites the field out for a blink, in the keeper's colour.
    if (state.flash > 0) {
      const tint = state.player?.tint ?? { wisp: '#fff3cf' };
      ctx.fillStyle = hexA(tint.wisp, Math.min(0.55, state.flash));
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    // Still Light's frost wash: a full-screen wash of ice-blue that fades
    // over the freeze, with frost crystals creeping in from the corners.
    if (state.frost > 0) {
      const fa = Math.min(0.28, (state.frost / 1.5) * 0.28);
      const fg = ctx.createLinearGradient(0, 0, 0, FIELD.height);
      fg.addColorStop(0, `rgba(179, 217, 255, ${fa})`);
      fg.addColorStop(1, `rgba(138, 200, 255, ${fa * 0.5})`);
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.fillStyle = `rgba(223, 242, 255, ${Math.min(0.9, fa * 3)})`;
      const corners = [[30, 30], [FIELD.width - 30, 30], [30, FIELD.height - 30], [FIELD.width - 30, FIELD.height - 30]];
      for (const [cx, cy] of corners) {
        for (let k = 0; k < 3; k += 1) {
          const a = (Math.PI * k) / 3;
          const s = 10 + k * 4;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
          ctx.lineTo(cx - Math.cos(a) * s, cy - Math.sin(a) * s);
          ctx.lineWidth = 2;
          ctx.strokeStyle = `rgba(223, 242, 255, ${Math.min(0.9, fa * 3)})`;
          ctx.stroke();
        }
      }
    }
    // Time Stop: while time is held, the field desaturates into a cold
    // blue-grey, and a countdown at the top tells the keeper how long the
    // breather lasts. It sits below the boss bar, so it never covers it.
    if (state.timeStop > 0) {
      const ta = Math.min(0.2, 0.1 + (state.timeStop / 5) * 0.1);
      ctx.fillStyle = `rgba(110, 130, 170, ${ta})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#b3d9ff';
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(`TIME STOP  ${state.timeStop.toFixed(1)}s`, FIELD.width / 2, 112);
    }
    // The ultimate's expanding rings of light.
    drawRings(state);

    // The bottom bar rides on the play screens — not the title or the end
    // screens. It is translucent, so the keeper stays visible when they
    // walk behind it. The status toggle only shows where it works: in play
    // and on the panel itself (on the upgrade screen the panel would cover
    // it, and on pause it would do nothing).
    if (screen === SCREEN_PLAY || screen === SCREEN_UPGRADE || screen === SCREEN_PAUSED || screen === SCREEN_STATS) {
      drawBottomBar(state);
    }
    if (screen === SCREEN_PLAY || screen === SCREEN_STATS) {
      drawStatsToggle();
    }

    if (screen === SCREEN_MENU) drawMenu(state, best);
    else if (screen === SCREEN_SETTINGS) drawSettings(settings);
    else if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_UPGRADE) drawUpgrade(state);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_STATS) drawStatsPanel(state, statsTab);
    else if (screen === SCREEN_OVER) drawStats(state, best, 'The light went out', 'The shadows take the garden… this time.', 'Press Enter to play again');
    else if (screen === SCREEN_WON) drawStats(state, best, 'Dawn breaks!', 'Ten waves survived — the lantern still burns.', 'Press Enter to keep playing the endless night');
  }

  return { draw, resize, fieldFromClient };
}
