/**
 * Eingabe: Tastatur und Touch (virtueller Joystick + drei Tasten) liefern dieselbe TeamInput.
 * Jeder Finger wird über Pointer Events mit setPointerCapture einzeln verfolgt,
 * damit Laufen und Schießen gleichzeitig funktionieren.
 */
import type { TeamInput } from './sim/index.ts';

export interface TouchParts {
  /** Fläche, auf der der Daumen aufsetzt; der Joystick erscheint an dieser Stelle. */
  readonly stickZone: HTMLElement;
  readonly stickBase: HTMLElement;
  readonly stickKnob: HTMLElement;
  readonly pass: HTMLElement;
  readonly shoot: HTMLElement;
  readonly swap: HTMLElement;
}

export interface InputSource {
  /** Aktuelle Eingabe; kurze Tipper seit dem letzten Aufruf bleiben erhalten. */
  readonly sample: () => TeamInput;
  readonly dispose: () => void;
}

type ButtonName = 'pass' | 'shoot' | 'swap';

const STICK_RADIUS = 52;
const NO_POINTER = -1;
const ACTIVE_CLASS = 'is-active';
const DOWN_CLASS = 'is-down';
const UNIT = 1;

const MOVE_KEYS: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  KeyW: [0, -UNIT], ArrowUp: [0, -UNIT],
  KeyS: [0, UNIT], ArrowDown: [0, UNIT],
  KeyA: [-UNIT, 0], ArrowLeft: [-UNIT, 0],
  KeyD: [UNIT, 0], ArrowRight: [UNIT, 0],
});
const BUTTON_KEYS: Readonly<Record<string, ButtonName>> = Object.freeze({
  KeyJ: 'pass', Space: 'pass', KeyK: 'shoot', KeyL: 'swap',
});
const PAUSE_KEYS: readonly string[] = ['KeyP', 'Escape'];
const FORM_TAGS: readonly string[] = ['INPUT', 'TEXTAREA', 'SELECT'];

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && FORM_TAGS.includes(target.tagName);

export const createInput = (parts: TouchParts, onPause: () => void): InputSource => {
  const { stickZone, stickBase, stickKnob } = parts;
  const buttons: Readonly<Record<ButtonName, HTMLElement>> = { pass: parts.pass, shoot: parts.shoot, swap: parts.swap };
  const keys = new Set<string>();
  const held = new Set<ButtonName>();
  const latched = new Set<ButtonName>();
  const cleanups: (() => void)[] = [];
  let stickPointer = NO_POINTER;
  let origin = { x: 0, y: 0 };
  let stick = { x: 0, y: 0 };

  const listen = <TEvent extends Event>(target: EventTarget, type: string, handler: (event: TEvent) => void): void => {
    // Der Ereignistyp steht durch den Namen fest (z. B. 'pointerdown' → PointerEvent); addEventListener kennt nur Event.
    const listener = handler as EventListener;
    target.addEventListener(type, listener, { passive: false });
    cleanups.push(() => target.removeEventListener(type, listener));
  };

  const press = (name: ButtonName): void => {
    held.add(name);
    latched.add(name);
    buttons[name].classList.add(DOWN_CLASS);
  };
  const release = (name: ButtonName): void => {
    held.delete(name);
    buttons[name].classList.remove(DOWN_CLASS);
  };

  const placeKnob = (): void => {
    stickKnob.style.setProperty('transform', `translate(${stick.x * STICK_RADIUS}px, ${stick.y * STICK_RADIUS}px)`);
  };
  const resetStick = (): void => {
    stickPointer = NO_POINTER;
    stick = { x: 0, y: 0 };
    stickBase.classList.remove(ACTIVE_CLASS);
    placeKnob();
  };

  listen<PointerEvent>(stickZone, 'pointerdown', (event) => {
    if (stickPointer !== NO_POINTER) return;
    event.preventDefault();
    stickPointer = event.pointerId;
    stickZone.setPointerCapture(event.pointerId);
    const box = stickZone.getBoundingClientRect();
    origin = { x: event.clientX, y: event.clientY };
    stickBase.style.setProperty('left', `${event.clientX - box.left}px`);
    stickBase.style.setProperty('top', `${event.clientY - box.top}px`);
    stickBase.classList.add(ACTIVE_CLASS);
    placeKnob();
  });
  listen<PointerEvent>(stickZone, 'pointermove', (event) => {
    if (event.pointerId !== stickPointer) return;
    event.preventDefault();
    const dx = (event.clientX - origin.x) / STICK_RADIUS;
    const dy = (event.clientY - origin.y) / STICK_RADIUS;
    const length = Math.max(1, Math.hypot(dx, dy));
    stick = { x: dx / length, y: dy / length };
    placeKnob();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
    listen<PointerEvent>(stickZone, type, (event) => {
      if (event.pointerId === stickPointer) resetStick();
    });
  });

  (Object.keys(buttons) as ButtonName[]).forEach((name) => {
    const element = buttons[name];
    listen<PointerEvent>(element, 'pointerdown', (event) => {
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      press(name);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => {
      listen<PointerEvent>(element, type, () => release(name));
    });
    listen<Event>(element, 'contextmenu', (event) => event.preventDefault());
  });

  listen<KeyboardEvent>(window, 'keydown', (event) => {
    if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const button = BUTTON_KEYS[event.code];
    if (PAUSE_KEYS.includes(event.code)) {
      if (!event.repeat) onPause();
      return;
    }
    if (!button && !MOVE_KEYS[event.code]) return;
    event.preventDefault();
    if (button && !event.repeat) press(button);
    keys.add(event.code);
  });
  listen<KeyboardEvent>(window, 'keyup', (event) => {
    keys.delete(event.code);
    const button = BUTTON_KEYS[event.code];
    const stillHeld = button && Object.entries(BUTTON_KEYS).some(([code, name]) => name === button && keys.has(code));
    if (button && !stillHeld) release(button);
  });
  listen<Event>(window, 'blur', () => {
    keys.clear();
    (Object.keys(buttons) as ButtonName[]).forEach(release);
    resetStick();
  });

  const keyboardMove = (): { readonly x: number; readonly y: number } => {
    const sum = [...keys].reduce((acc, code) => {
      const [x, y] = MOVE_KEYS[code] ?? [0, 0];
      return { x: acc.x + x, y: acc.y + y };
    }, { x: 0, y: 0 });
    const length = Math.hypot(sum.x, sum.y);
    return length ? { x: sum.x / length, y: sum.y / length } : sum;
  };

  return {
    sample: (): TeamInput => {
      const move = stickPointer === NO_POINTER ? keyboardMove() : stick;
      const down = (name: ButtonName): boolean => held.has(name) || latched.has(name);
      const input: TeamInput = {
        moveX: move.x, moveY: move.y, pass: down('pass'), shoot: down('shoot'), switchOrTackle: down('swap'),
      };
      latched.clear();
      return input;
    },
    dispose: (): void => {
      cleanups.forEach((cleanup) => cleanup());
      keys.clear();
      held.clear();
      latched.clear();
    },
  };
};
