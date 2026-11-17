// Settings: persisted in localStorage, applied on load. The helpers are
// pure (the storage is injectable, so tests pass a fake object); nothing
// here touches the DOM at import time.
//
// Music and SFX are Off / Low / Med / High — Med is the game as tuned
// (scale 1), so the defaults sound exactly like the game did before the
// settings screen existed. Screen shake is On / Off; effects are Full /
// Reduced (half the particles, a calmer screen).
export const SETTINGS_KEY = 'emberlight-settings-v1';

export const DEFAULT_SETTINGS = { music: 'med', sfx: 'med', shake: true, effects: 'full' };

export const VOLUME_OPTIONS = ['off', 'low', 'med', 'high'];

const VOLUME_SCALES = { off: 0, low: 0.5, med: 1, high: 1.5 };

/** The gain multiplier for one volume level (Off is true silence). */
export function volumeScale(level) {
  return VOLUME_SCALES[level] ?? 1;
}

/** A raw stored object, cleaned: unknown values fall back to the default. */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    if (VOLUME_OPTIONS.includes(raw.music)) s.music = raw.music;
    if (VOLUME_OPTIONS.includes(raw.sfx)) s.sfx = raw.sfx;
    if (typeof raw.shake === 'boolean') s.shake = raw.shake;
    if (raw.effects === 'full' || raw.effects === 'reduced') s.effects = raw.effects;
  }
  return s;
}

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Read the saved settings (defaults when nothing is saved or it is junk). */
export function loadSettings(storage = defaultStorage()) {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Save the settings (a no-op when storage is unavailable). */
export function saveSettings(settings, storage = defaultStorage()) {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch {
    // Storage can be off (private windows): settings last this visit only.
  }
}
