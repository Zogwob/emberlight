// Emberlight's painter: one canvas, one logical 1280x720 field, scaled to the
// window. It draws the night, the lantern's glow, the wisp, the shadows, the
// HUD and every screen — title, upgrade choice, pause, game over and dawn.
// Screen shake is derived from the world's clock, never from Math.random, so
// a staged screenshot lands on the same frame every time.

import { FIELD, FONT, PALETTE, PLAYER, WIN_WAVE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WON = 'won';

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

  function drawLanternGlow(state) {
    const p = state.player;
    if (!p) return;
    const healthFrac = p.hp / p.maxHp;
    const radius = p.lanternRadius * (0.55 + 0.45 * healthFrac);
    const g = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, radius);
    g.addColorStop(0, 'rgba(255, 190, 90, 0.20)');
    g.addColorStop(0.55, 'rgba(255, 170, 70, 0.07)');
    g.addColorStop(1, 'rgba(255, 170, 70, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p) return;
    if (p.invulnerable > 0 && Math.floor(state.time * 14) % 2 === 0) return;

    const flicker = 1 + Math.sin(state.time * 9) * 0.06;
    const glow = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 46 * flicker);
    glow.addColorStop(0, 'rgba(255, 220, 140, 0.85)');
    glow.addColorStop(1, 'rgba(255, 180, 70, 0)');
    ctx.fillStyle = glow;
    circle(ctx, p.x, p.y, 46 * flicker);
    ctx.fill();

    // The wisp: a warm core with a little flame licking upward.
    ctx.fillStyle = PALETTE.wispCore;
    circle(ctx, p.x, p.y, PLAYER.radius * 0.72);
    ctx.fill();
    ctx.fillStyle = PALETTE.flame;
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
    if (state.time < p.rapidUntil) {
      ctx.strokeStyle = PALETTE.rapid;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      circle(ctx, p.x, p.y, PLAYER.radius + 5);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawEnemy(e, time) {
    const bob = Math.sin(time * 5 + e.x * 0.05) * 2;
    const y = e.y + bob;
    ctx.fillStyle = PALETTE.shadow;
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
    const eyeColor = e.kind === 'skitter' ? PALETTE.skitterEye : e.kind === 'spitter' ? PALETTE.spitterEye : PALETTE.bruteEye;
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : eyeColor;
    const spread = e.kind === 'brute' ? 11 : 6;
    circle(ctx, e.x - spread, y - 3, e.kind === 'brute' ? 4 : 3);
    ctx.fill();
    circle(ctx, e.x + spread, y - 3, e.kind === 'brute' ? 4 : 3);
    ctx.fill();

    if (e.hp < e.maxHp) {
      const w = e.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - w / 2, y - e.radius - 12, w, 4);
      ctx.fillStyle = PALETTE.heart;
      ctx.fillRect(e.x - w / 2, y - e.radius - 12, w * (e.hp / e.maxHp), 4);
    }
  }

  function drawBullets(state) {
    for (const b of state.bullets) {
      ctx.strokeStyle = PALETTE.bolt;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = '#fff8dd';
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
      if (pk.kind === 'heart') {
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
    const p = state.player;
    for (let i = 0; i < p.maxHp; i += 1) {
      const x = 28 + i * 30;
      const y = 34;
      if (i < p.hp) {
        ctx.fillStyle = PALETTE.heart;
        heartPath(ctx, x, y, 9);
        ctx.fill();
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
    const left = state.enemies.length + state.spawnQueue.skitter + state.spawnQueue.spitter + state.spawnQueue.brute;
    ctx.fillText(state.waveState === 'fighting' ? `${left} shadows left` : '', FIELD.width / 2, 64);

    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText('WASD move · Mouse aim · Hold click to shoot · P pause', FIELD.width - 20, 24);
    drawHearts(state);
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

  function drawTitle(state, best) {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.banner;
    ctx.font = `bold 84px ${FONT}`;
    ctx.shadowColor = 'rgba(255, 180, 70, 0.55)';
    ctx.shadowBlur = 34;
    ctx.fillText('EMBERLIGHT', FIELD.width / 2, 250);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `26px ${FONT}`;
    ctx.fillText('Keep the last lantern lit. Survive the night.', FIELD.width / 2, 296);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `18px ${FONT}`;
    ctx.fillText('WASD or arrows to move · Mouse to aim · Hold click or Space to shoot', FIELD.width / 2, 336);
    ctx.fillText('Clear 10 waves and dawn breaks. Between waves, pick an upgrade.', FIELD.width / 2, 364);
    if (best > 0) {
      ctx.fillStyle = PALETTE.banner;
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(`Best score ${best}`, FIELD.width / 2, 412);
    }
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 24px ${FONT}`;
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillText('Click or press Enter to begin', FIELD.width / 2, 470);
    ctx.globalAlpha = 1;
  }

  function drawUpgrade(state) {
    panel(FIELD.width / 2 - 430, 130, 860, 420);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.banner;
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillText(`Wave ${state.wave} cleared!`, FIELD.width / 2, 188);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `20px ${FONT}`;
    ctx.fillText('Choose an upgrade — press 1, 2 or 3, or click a card.', FIELD.width / 2, 222);
    const cards = state.offer;
    const cw = 250;
    const gap = 20;
    const total = cards.length * cw + (cards.length - 1) * gap;
    let x = FIELD.width / 2 - total / 2;
    cards.forEach((card, i) => {
      const y = 260;
      ctx.fillStyle = PALETTE.card;
      ctx.strokeStyle = PALETTE.cardEdge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, cw, 220, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.banner;
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText(card.name, x + cw / 2, y + 56);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `17px ${FONT}`;
      const words = card.text.split(' ');
      let line = '';
      let ly = y + 96;
      for (const w of words) {
        if (ctx.measureText(`${line} ${w}`.trim()).width > cw - 36) {
          ctx.fillText(line.trim(), x + cw / 2, ly);
          line = w;
          ly += 24;
        } else {
          line = `${line} ${w}`;
        }
      }
      ctx.fillText(line.trim(), x + cw / 2, ly);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText(`[${i + 1}]`, x + cw / 2, y + 186);
      x += cw + gap;
    });
  }

  function drawPaused() {
    panel(FIELD.width / 2 - 260, 250, 520, 200);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillText('Paused', FIELD.width / 2, 330);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `19px ${FONT}`;
    ctx.fillText('Press P or Enter to keep playing', FIELD.width / 2, 372);
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
    ctx.fillText(`Bolts ${state.shotsFired}    ·    Accuracy ${acc}%`, FIELD.width / 2, 352);
    ctx.fillStyle = PALETTE.banner;
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(`Best score ${Math.max(best, state.score)}`, FIELD.width / 2, 400);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 22px ${FONT}`;
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.fillText(prompt, FIELD.width / 2, 486);
    ctx.globalAlpha = 1;
  }

  function draw(state, screen, best) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const shake = state.shake;
    const ox = shake > 0.2 ? Math.sin(state.time * 127.1) * shake * 0.6 : 0;
    const oy = shake > 0.2 ? Math.cos(state.time * 311.7) * shake * 0.6 : 0;
    ctx.setTransform(view.scale, 0, 0, view.scale, view.ox + ox * view.scale, view.oy + oy * view.scale);

    drawBackground(state);
    if (screen !== SCREEN_TITLE) {
      drawLanternGlow(state);
      for (const e of state.enemies) drawEnemy(e, state.time);
      drawBullets(state);
      drawPickups(state);
      drawPlayer(state);
      drawParticles(state);
      drawHud(state, best);
      drawBanner(state);
    } else {
      // The title keeps only the glow and the drifting embers: the wisp would
      // sit on top of the instructions.
      drawLanternGlow(state);
      drawParticles(state);
    }

    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_UPGRADE) drawUpgrade(state);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawStats(state, best, 'The light went out', 'The shadows take the garden… this time.', 'Press Enter to play again');
    else if (screen === SCREEN_WON) drawStats(state, best, 'Dawn breaks!', 'Ten waves survived — the lantern still burns.', 'Press Enter to keep playing the endless night');
  }

  return { draw, resize, fieldFromClient };
}
