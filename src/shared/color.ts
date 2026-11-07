// Color helpers. Only hexadecimal colors are accepted anywhere in DevTrace, so a
// color can never carry markup, a url() reference or any other SVG syntax.

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** The value written in SVG attributes for a fully transparent paint. */
export const NO_PAINT = "none";

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/** Lowercase `#rrggbb`, or `none` for the `transparent` keyword. */
export function normalizeColor(value: string): string {
  if (value === "transparent") return NO_PAINT;
  const hex = value.slice(1).toLowerCase();
  const full = hex.length === 3 ? Array.from(hex, (digit) => digit + digit).join("") : hex;
  return `#${full}`;
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Linear interpolation in sRGB. `amount` 0 returns `from`, 1 returns `to`. */
export function mixColors(from: string, to: string, amount: number): string {
  const [r1, g1, b1] = channels(from);
  const [r2, g2, b2] = channels(to);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount);
  const hex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${hex(mix(r1, r2))}${hex(mix(g1, g2))}${hex(mix(b1, b2))}`;
}

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2 relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 2 contrast ratio, from 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}
