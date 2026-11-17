// Keyboard and mouse, read fresh every frame. Movement is WASD or arrows;
// the mouse aims; the lantern fires on its own in v2 (hold the left button
// or Space still counts as firing, harmlessly). Enter/Space confirms on
// menus, P or Escape pauses, M returns to the main menu from pause, game
// over or dawn, S opens settings from the pause menu, I opens the status panel, R re-rolls the card
// offer, 1-4 pick an upgrade card, 5-8 buy a shop item.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

const MOVE_KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let upgradePick = 0;
  let shopPick = 0;
  let clicked = false;
  let confirmKey = false;
  let ult = false;
  let stats = false;
  let refresh = false;
  let menu = false;
  let settings = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') {
      actions |= ACTION_CONFIRM;
      confirmKey = true;
    }
    if (event.code === 'KeyQ') ult = true;
    if (event.code === 'KeyI') stats = true;
    if (event.code === 'KeyR') refresh = true;
    if (event.code === 'KeyM') menu = true;
    if (event.code === 'KeyS') settings = true;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'Digit1') upgradePick = 1;
    if (event.code === 'Digit2') upgradePick = 2;
    if (event.code === 'Digit3') upgradePick = 3;
    if (event.code === 'Digit4') upgradePick = 4;
    if (event.code === 'Digit5') shopPick = 1;
    if (event.code === 'Digit6') shopPick = 2;
    if (event.code === 'Digit7') shopPick = 3;
    if (event.code === 'Digit8') shopPick = 4;
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    if (event.button !== 0) return;
    mouseDown = true;
    clicked = true;
    onMouseMove(event);
    actions |= ACTION_CONFIRM;
  }

  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }

  function onBlur() {
    held.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    /** The held movement keys as a unit vector (0, 0 when none). */
    moveVector() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const dir = MOVE_KEYS[code];
        if (dir) {
          x += dir[0];
          y += dir[1];
        }
      }
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** The mouse position in canvas CSS pixels. */
    aim() {
      return { x: mouseX, y: mouseY };
    },
    /** True while the fire button (mouse or Space) is held. */
    firing() {
      return mouseDown || held.has('Space');
    },
    /** One-shot actions since the last read; reading clears them. */
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
    /** 1, 2, 3 or 4 when an upgrade key was pressed since the last read, else 0. */
    takeUpgradePick() {
      const out = upgradePick;
      upgradePick = 0;
      return out;
    },
    /** 1-4 when a shop key (5-8) was pressed since the last read, else 0. */
    takeShopPick() {
      const out = shopPick;
      shopPick = 0;
      return out;
    },
    /** True when Enter or Space (keyboard only, never a click) was pressed. */
    takeConfirmKey() {
      const out = confirmKey;
      confirmKey = false;
      return out;
    },
    /** True when Q (fire the ultimates) was pressed since the last read. */
    takeUlt() {
      const out = ult;
      ult = false;
      return out;
    },
    /** True when I (open the status panel) was pressed since the last read. */
    takeStats() {
      const out = stats;
      stats = false;
      return out;
    },
    /** True when R (re-roll the card offer) was pressed since the last read. */
    takeRefresh() {
      const out = refresh;
      refresh = false;
      return out;
    },
    /** True when M (back to the main menu) was pressed since the last read. */
    takeMenu() {
      const out = menu;
      menu = false;
      return out;
    },
    /** True when S (settings from the pause menu) was pressed since the last read. */
    takeSettings() {
      const out = settings;
      settings = false;
      return out;
    },
    /** True once per mouse press since the last read (for card clicks). */
    takeClick() {
      const out = clicked;
      clicked = false;
      return out;
    },
  };
}
