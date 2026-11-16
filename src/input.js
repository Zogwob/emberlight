// Keyboard and mouse, read fresh every frame. Movement is WASD or arrows;
// the mouse aims; hold the left button (or Space) to shoot. Enter/Space
// confirms on menus, P or Escape pauses, 1/2/3 pick an upgrade card.

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
  let clicked = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    if (event.code === 'Digit1') upgradePick = 1;
    if (event.code === 'Digit2') upgradePick = 2;
    if (event.code === 'Digit3') upgradePick = 3;
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
    /** 1, 2 or 3 when an upgrade key was pressed since the last read, else 0. */
    takeUpgradePick() {
      const out = upgradePick;
      upgradePick = 0;
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
