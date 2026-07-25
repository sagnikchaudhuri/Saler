// ============================================================================
// Pure WCAG contrast maths. No DOM, no dependencies — usable in tests and
// tooling to prove that meaningful text meets AA against the surfaces it sits
// on. Ratios are computed from actual colour VALUES, never from CSS classes.
// ============================================================================

export type Rgb = { r: number; g: number; b: number };

/** Parse a #rrggbb string into 0–255 channels. */
export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an opaque colour. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio between two opaque colours (order-independent). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Composite a colour at `alpha` over an opaque background — models Tailwind's
 * `/5` etc. tint surfaces (e.g. `bg-caution/5` = caution at 0.05 over white).
 */
export function blendOver(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
  };
}

/** Convenience: contrast of two hex strings. */
export function ratio(fgHex: string, bgHex: string): number {
  return contrastRatio(hexToRgb(fgHex), hexToRgb(bgHex));
}
