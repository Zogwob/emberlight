// Every sound is synthesised with WebAudio: no audio files, nothing fetched.
// The context is created on the first player gesture (browsers block sound
// before one), and a very quiet drone hums under the game once it is.

function makeContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor();
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let drone = null;

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
    return ctx;
  }

  /** Call from any player gesture so the browser allows sound. */
  function unlock() {
    ensure();
    if (!ctx || drone) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 55 * 1.5;
    const gain = ctx.createGain();
    gain.gain.value = 0.018;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.008;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(master);
    osc.start();
    osc2.start();
    lfo.start();
    drone = { osc, osc2, lfo };
  }

  function tone({ type = 'sine', from = 440, to = null, dur = 0.1, vol = 0.2, when = 0 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.08, vol = 0.15, when = 0, low = 400 }) {
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
    filter.type = 'lowpass';
    filter.frequency.value = low;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    unlock,
    shoot() {
      tone({ type: 'square', from: 880, to: 420, dur: 0.07, vol: 0.08 });
    },
    enemyHit() {
      noise({ dur: 0.05, vol: 0.1, low: 900 });
    },
    enemyDie() {
      tone({ type: 'sawtooth', from: 320, to: 60, dur: 0.22, vol: 0.14 });
      noise({ dur: 0.12, vol: 0.1, low: 600 });
    },
    pickup() {
      tone({ type: 'sine', from: 660, dur: 0.09, vol: 0.16 });
      tone({ type: 'sine', from: 990, dur: 0.12, vol: 0.16, when: 0.07 });
    },
    hurt() {
      tone({ type: 'sawtooth', from: 180, to: 55, dur: 0.3, vol: 0.22 });
      noise({ dur: 0.18, vol: 0.14, low: 500 });
    },
    waveHorn() {
      tone({ type: 'sawtooth', from: 196, dur: 0.35, vol: 0.12 });
      tone({ type: 'sawtooth', from: 294, dur: 0.35, vol: 0.1, when: 0.02 });
    },
    upgrade() {
      tone({ type: 'triangle', from: 523, dur: 0.1, vol: 0.16 });
      tone({ type: 'triangle', from: 659, dur: 0.1, vol: 0.16, when: 0.08 });
      tone({ type: 'triangle', from: 784, dur: 0.16, vol: 0.16, when: 0.16 });
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.22, vol: 0.16, when: i * 0.11 }));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.25, vol: 0.15, when: i * 0.13 }));
    },
  };
}
