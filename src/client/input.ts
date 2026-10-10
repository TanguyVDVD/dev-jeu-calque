// Keyboard read by physical key position (KeyboardEvent.code): ZQSD on AZERTY and WASD on QWERTY
// are the same keys. Gamepad through the Gamepad API.
import { IN_L, IN_R, IN_D, IN_J, IN_X } from '../shared/sim';

const KEYS: Record<string, number> = {
  ArrowLeft: IN_L, KeyA: IN_L, ArrowRight: IN_R, KeyD: IN_R, ArrowDown: IN_D, KeyS: IN_D,
  ArrowUp: IN_J, KeyW: IN_J, Space: IN_J,
  // Several dash keys: five Shift presses in a row trigger Sticky Keys on Windows.
  ShiftLeft: IN_X, ShiftRight: IN_X, KeyX: IN_X, KeyK: IN_X,
};
const held = new Set<string>();
let bits = 0, pads = 0;
addEventListener('gamepadconnected', () => pads++);
addEventListener('gamepaddisconnected', () => (pads = Math.max(0, pads - 1)));

export const input = {
  onEmote: null as ((e: number) => void) | null,
  onKey: null as ((code: string) => void) | null, // one-shot keys: KeyR, Escape, Enter
  script: null as ((tick: number) => number) | null, // automation hook: replaces the keyboard when set

  read(tick: number): number {
    if (input.script) return input.script(tick);
    let b = bits;
    if (!pads) return b; // no gamepad: nothing to poll, nothing allocated
    const list = navigator.getGamepads();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p) continue;
      const bt = p.buttons, n = bt.length;
      if (p.axes[0] < -0.4 || (n > 14 && bt[14].pressed)) b |= IN_L;
      if (p.axes[0] > 0.4 || (n > 15 && bt[15].pressed)) b |= IN_R;
      if (p.axes[1] > 0.6 || (n > 13 && bt[13].pressed)) b |= IN_D;
      if ((n > 0 && bt[0].pressed) || (n > 12 && bt[12].pressed)) b |= IN_J;
      if ((n > 2 && bt[2].pressed) || (n > 1 && bt[1].pressed) || (n > 5 && bt[5].pressed) || (n > 7 && bt[7].pressed)) b |= IN_X;
    }
    return b;
  },
};

const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;

addEventListener('keydown', (e) => {
  if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = KEYS[e.code];
  if (k) { held.add(e.code); bits |= k; e.preventDefault(); return; }
  if (e.repeat) return;
  if (/^Digit[1-4]$/.test(e.code)) input.onEmote?.(Number(e.code[5]) - 1);
  else input.onKey?.(e.code);
});
addEventListener('keyup', (e) => {
  if (!held.delete(e.code)) return;
  bits = 0;
  for (const c of held) bits |= KEYS[c];
});
addEventListener('blur', () => { held.clear(); bits = 0; });

// The letters actually printed on the player's keys, when the browser can tell; arrows otherwise.
export async function keyLabels(): Promise<{ move: string; jump: string; dash: string }> {
  const fallback = { move: 'Flèches', jump: 'Espace ou flèche haut', dash: 'Maj, X ou K' };
  try {
    const map = await (navigator as any).keyboard?.getLayoutMap?.();
    if (!map) return fallback;
    const k = (code: string) => String(map.get(code) ?? '').toUpperCase();
    if (!k('KeyA') || !k('KeyW')) return fallback;
    return { move: `${k('KeyA')} ${k('KeyD')} ${k('KeyS')} ou flèches`, jump: `Espace, ${k('KeyW')} ou flèche haut`, dash: `Maj, ${k('KeyX')} ou ${k('KeyK')}` };
  } catch { return fallback; }
}
