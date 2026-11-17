// Every sound is synthesised with WebAudio: no audio files, nothing fetched.
// The context is created on the first player gesture (browsers block sound
// before one), and a dark ambient loop hums under the game once it is: a low
// A-minor drone pad with slow sparse melody notes, far quieter than the SFX.
// A boss wave adds a tenser layer — a low heartbeat drum — that drops away
// when the boss dies.
//
// Music (pad, melody, heartbeat) and SFX (every tone and noise, UI clicks
// included) ride separate buses, so the settings screen can scale or mute
// each on its own. Both buses feed the master, which stays at 0.35.
import { volumeScale } from './settings.js';

function makeContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  // The live volume scales (1 = Med, the game as tuned); setters store
  // them first, so a setting made before the context exists still lands.
  let musicScale = 1;
  let sfxScale = 1;
  let drone = null;
  // The ambient loop's schedulers: a slow melody and (on boss waves) a
  // heartbeat. Both are quiet on purpose — the music must never fight the SFX.
  let melodyTimer = null;
  let nextNoteAt = 0;
  let bossTimer = null;
  let bossBeat = 0;
  let bossOn = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    ctx = makeContext();
    if (!ctx) return null;
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicScale;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = sfxScale;
    sfxBus.connect(master);
    return ctx;
  }

  // The shoot's base pitch, tinted subtly per keeper (their light's colour
  // reads as a pitch): Ember bright, Azure cool, Crimson deep. Set by
  // setKeeper when the player picks a keeper; Ember is the default.
  let shootBase = 900;
  function setKeeper(id) {
    shootBase = id === 'azure' ? 800 : id === 'crimson' ? 710 : 900;
  }

  /** One soft melody note: a sine with a slow attack and a long tail. */
  function melodyNote(freq, vol) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);
    osc.connect(gain);
    gain.connect(musicBus);
    osc.start(t0);
    osc.stop(t0 + 3);
  }

  /** The ambient loop's scheduler: a sparse note every few seconds. */
  function startMelody() {
    if (melodyTimer || !ctx) return;
    nextNoteAt = ctx.currentTime + 2;
    // A minor pentatonic, low and slow: A3 C4 D4 E4 G4 A4.
    const scale = [220, 261.63, 293.66, 329.63, 392, 440];
    melodyTimer = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      if (ctx.currentTime < nextNoteAt) return;
      const note = scale[Math.floor(Math.random() * scale.length)];
      melodyNote(note, 0.03);
      // Sometimes a second note a third above, so the line feels like a
      // phrase instead of a metronome.
      if (Math.random() < 0.3) {
        const idx = scale.indexOf(note);
        if (idx >= 0 && idx + 2 < scale.length) melodyNote(scale[idx + 2], 0.02);
      }
      nextNoteAt = ctx.currentTime + 4 + Math.random() * 4;
    }, 500);
  }

  function unlock() {
    ensure();
    if (!ctx || drone) return;
    // The pad: a low A-minor chord (A1, C2, E2) that breathes slowly.
    const padGain = ctx.createGain();
    padGain.gain.value = 0.02;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.008;
    lfo.connect(lfoGain);
    lfoGain.connect(padGain.gain);
    padGain.connect(musicBus);
    const oscs = [];
    for (const freq of [55, 65.41, 82.41]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(padGain);
      osc.start();
      oscs.push(osc);
    }
    lfo.start();
    drone = { oscs, lfo };
    startMelody();
    // A boss already alive when the audio first unlocks still gets its
    // heartbeat.
    if (bossOn) startBossTimer();
  }

  /** A boss wave's tenser layer: a low heartbeat (lub-dub) and a soft pulse. */
  function startBossTimer() {
    if (bossTimer || !ctx) return;
    bossBeat = 0;
    bossTimer = setInterval(() => {
      if (!ctx || ctx.state !== 'running' || !bossOn) return;
      const t0 = ctx.currentTime;
      // Lub-dub: two low thumps, the second softer, about a second apart.
      const beat = bossBeat % 2;
      const vol = beat === 0 ? 0.05 : 0.035;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t0);
      osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.18);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(gain);
      gain.connect(musicBus);
      osc.start(t0);
      osc.stop(t0 + 0.25);
      bossBeat += 1;
    }, 450);
  }
  function setBoss(on) {
    if (on === bossOn) return;
    bossOn = on;
    if (!on) {
      if (bossTimer) { clearInterval(bossTimer); bossTimer = null; }
      return;
    }
    startBossTimer();
  }

  /**
   * One shaped tone: a sine or triangle oscillator (never a bare square or
   * sawtooth blip) with a pitch envelope and a short decay tail. `attack`
   * ramps the gain up over that many seconds, for horns and swells; the
   * default attack is instant, for zaps and chimes. Every layer stays at
   * or under the shoot's peak (vol 0.10) so no sound is louder than a shot —
   * except the ultimate, which is the game's biggest event and peaks at 0.14.
   */
  function tone({ type = 'sine', from = 440, to = null, dur = 0.1, vol = 0.2, when = 0, attack = 0 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    const gain = c.createGain();
    if (attack > 0) {
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    } else {
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    }
    osc.connect(gain);
    gain.connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /**
   * A filtered noise burst: a short crack, crunch or wash. `type` picks the
   * filter (lowpass for thuds, bandpass for cracks and washes); `to` sweeps
   * the filter's frequency over the burst, for a rising wash.
   */
  function noise({ dur = 0.08, vol = 0.15, when = 0, low = 400, type = 'lowpass', to = null }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + when;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(low, t0);
    if (to !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    src.start(t0);
  }

  return {
    unlock,
    setKeeper,
    setBoss,
    /** Scale the music (BGM pad, melody, heartbeat) — Off silences it. */
    setMusicVolume(level) {
      musicScale = volumeScale(level);
      if (musicBus) musicBus.gain.value = musicScale;
    },
    /** Scale every SFX, UI clicks included — Off silences them. */
    setSfxVolume(level) {
      sfxScale = volumeScale(level);
      if (sfxBus) sfxBus.gain.value = sfxScale;
    },
    /** The live volume scales, for the settings screen and tests. */
    levels() {
      return { music: musicScale, sfx: sfxScale };
    },
    // One soft UI click for every menu press: a short triangle tick with a
    // breath of high noise — clean and quiet, never a Pacman beep.
    click() {
      tone({ type: 'triangle', from: 1400, to: 900, dur: 0.04, vol: 0.05 });
      noise({ dur: 0.02, vol: 0.02, type: 'bandpass', low: 3000 });
    },
    // The warmer two-note variant for confirm actions (Begin, card pick,
    // buy): a low root under a rising pair.
    confirm() {
      tone({ type: 'sine', from: 330, dur: 0.1, vol: 0.04 });
      tone({ type: 'triangle', from: 660, dur: 0.08, vol: 0.06 });
      tone({ type: 'triangle', from: 880, dur: 0.12, vol: 0.06, when: 0.07 });
    },
    // A soft zap with a quick pitch drop — a triangle, not a square blip —
    // over a quiet sine body, tinted by the keeper's light.
    shoot() {
      tone({ type: 'triangle', from: shootBase, to: shootBase * 0.42, dur: 0.08, vol: 0.1 });
      tone({ type: 'sine', from: shootBase * 0.5, to: shootBase * 0.3, dur: 0.1, vol: 0.04 });
    },
    // A short thud and a crack: a low sine thump plus a bandpass snap.
    enemyHit() {
      tone({ type: 'sine', from: 180, to: 70, dur: 0.08, vol: 0.08 });
      noise({ dur: 0.04, vol: 0.06, type: 'bandpass', low: 1200 });
    },
    // A low pop and a noise crunch: a sine drop plus a lowpass rumble.
    enemyDie() {
      tone({ type: 'sine', from: 220, to: 50, dur: 0.18, vol: 0.09 });
      tone({ type: 'triangle', from: 160, to: 80, dur: 0.12, vol: 0.04 });
      noise({ dur: 0.15, vol: 0.06, low: 500 });
    },
    // A bright two-note chime: a triangle pair with a sine shimmer on top.
    pickup() {
      tone({ type: 'triangle', from: 880, dur: 0.1, vol: 0.08 });
      tone({ type: 'triangle', from: 1318, dur: 0.14, vol: 0.08, when: 0.06 });
      tone({ type: 'sine', from: 2637, dur: 0.1, vol: 0.03, when: 0.06 });
    },
    // A higher two-note chime for coins, with a sparkle on the second note.
    coin() {
      tone({ type: 'triangle', from: 1318, dur: 0.08, vol: 0.07 });
      tone({ type: 'triangle', from: 1760, dur: 0.12, vol: 0.07, when: 0.05 });
      tone({ type: 'sine', from: 2637, dur: 0.08, vol: 0.03, when: 0.05 });
    },
    // A soft shimmer for a shield going up.
    shield() {
      tone({ type: 'triangle', from: 1568, dur: 0.12, vol: 0.07 });
      tone({ type: 'triangle', from: 2093, dur: 0.18, vol: 0.06, when: 0.06 });
    },
    // The ultimate: a big swell — a rising tone, a noise wash that opens
    // up, and a deep boom that lands after the rise, so the player feels it
    // build and then hit. It is the loudest sound in the game: the boom
    // peaks at 0.14, above the shoot's 0.10 — the one sound allowed to.
    ult() {
      tone({ type: 'sine', from: 220, to: 880, dur: 0.7, vol: 0.08 });
      tone({ type: 'triangle', from: 440, to: 1760, dur: 0.6, vol: 0.06, when: 0.05 });
      noise({ dur: 0.7, vol: 0.05, type: 'bandpass', low: 400, to: 2400, when: 0.1 });
      tone({ type: 'sine', from: 120, to: 40, dur: 0.9, vol: 0.14, when: 0.35 });
      noise({ dur: 0.4, vol: 0.06, low: 300, when: 0.35 });
    },
    // A warm confirm chime for a purchase: a low root under a bright pair.
    buy() {
      tone({ type: 'sine', from: 330, dur: 0.2, vol: 0.04 });
      tone({ type: 'triangle', from: 659, dur: 0.12, vol: 0.08 });
      tone({ type: 'triangle', from: 988, dur: 0.18, vol: 0.08, when: 0.08 });
    },
    // A heavy boom for a boss dying: a deep sine drop and a low crunch.
    boss() {
      tone({ type: 'sine', from: 110, to: 40, dur: 0.7, vol: 0.09 });
      tone({ type: 'triangle', from: 82, to: 55, dur: 0.4, vol: 0.05, when: 0.1 });
      noise({ dur: 0.3, vol: 0.05, low: 400, when: 0.05 });
    },
    // A deep horn for a boss rising: two detuned triangles a fifth apart,
    // swelling in slowly over a low sine root.
    bossSpawn() {
      tone({ type: 'sine', from: 49, dur: 0.9, vol: 0.05, attack: 0.2 });
      tone({ type: 'triangle', from: 98, dur: 0.8, vol: 0.07, attack: 0.15 });
      tone({ type: 'triangle', from: 147, dur: 0.8, vol: 0.06, attack: 0.15, when: 0.03 });
    },
    // Time Stop: a clock-like chime — a high bell, a tick, a low shimmer.
    // Distinct from the pickup chime, so the keeper knows time itself stopped.
    timeStop() {
      tone({ type: 'sine', from: 2093, dur: 0.5, vol: 0.08 });
      tone({ type: 'triangle', from: 880, dur: 0.1, vol: 0.05, when: 0.1 });
      tone({ type: 'sine', from: 523, dur: 0.4, vol: 0.04, when: 0.05 });
    },
    // A soft thud when the keeper is hurt: a low sine drop and a dull thump.
    hurt() {
      tone({ type: 'sine', from: 160, to: 60, dur: 0.25, vol: 0.09 });
      noise({ dur: 0.15, vol: 0.05, low: 400 });
    },
    // The wave horn: a soft fifth, swelling in — a horn, not a beep.
    waveHorn() {
      tone({ type: 'sine', from: 98, dur: 0.5, vol: 0.04, attack: 0.08 });
      tone({ type: 'triangle', from: 196, dur: 0.5, vol: 0.06, attack: 0.08 });
      tone({ type: 'triangle', from: 294, dur: 0.5, vol: 0.05, attack: 0.08, when: 0.02 });
    },
    // A warm confirm chime for a card pick or a keeper select.
    upgrade() {
      tone({ type: 'sine', from: 262, dur: 0.3, vol: 0.03 });
      tone({ type: 'triangle', from: 523, dur: 0.12, vol: 0.07 });
      tone({ type: 'triangle', from: 659, dur: 0.12, vol: 0.07, when: 0.07 });
      tone({ type: 'triangle', from: 784, dur: 0.18, vol: 0.07, when: 0.14 });
    },
    // A rising arpeggio for a level-up: four notes climbing, with a shimmer.
    levelUp() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.14, vol: 0.07, when: i * 0.08 }));
      tone({ type: 'sine', from: 2093, dur: 0.3, vol: 0.03, when: 0.24 });
    },
    // A gentle fanfare for clearing a wave: four soft notes over a warm pad.
    waveClear() {
      tone({ type: 'sine', from: 196, dur: 0.6, vol: 0.03 });
      [392, 523, 659, 784].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.2, vol: 0.06, when: i * 0.1 }));
    },
    // A bright fanfare for dawn.
    win() {
      tone({ type: 'sine', from: 262, dur: 0.8, vol: 0.03 });
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.22, vol: 0.07, when: i * 0.11 }));
    },
    // A gentle descent for the light going out.
    lose() {
      tone({ type: 'sine', from: 196, dur: 0.7, vol: 0.03 });
      [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.25, vol: 0.06, when: i * 0.13 }));
    },
  };
}
