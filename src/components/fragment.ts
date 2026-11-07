import { element } from "../shared/svg.js";

// A component renders to a Fragment: SVG that is drawn from (0, 0) and knows its
// own size. Layout code places fragments with `place`, so a component never
// needs to know where on the card it ends up.

export interface Fragment {
  readonly body: string;
  readonly width: number;
  readonly height: number;
  /** Present on fragments that can grow to fill a taller grid row (panels). */
  readonly resize?: (height: number) => Fragment;
}

/** A component that is given the width it may use. */
export type Builder = (width: number) => Fragment;

/** Rounds to two decimals so that float noise never reaches the SVG. */
export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Negative, infinite and NaN values are drawn as zero instead of breaking the geometry. */
export function safeAmount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** `value / total` as a ratio between 0 and 1; 0 when there is nothing to divide by. */
export function ratio(value: number, total: number): number {
  const part = safeAmount(value);
  const whole = safeAmount(total);
  return whole === 0 ? 0 : Math.min(1, part / whole);
}

export function place(fragment: Fragment, x: number, y: number): string {
  // A group that moves nothing is not written.
  if (round(x) === 0 && round(y) === 0) return fragment.body;
  return element(
    "g",
    { transform: `translate(${String(round(x))} ${String(round(y))})` },
    fragment.body,
  );
}

export function emptyFragment(width: number, height = 0): Fragment {
  return { body: "", width, height };
}
