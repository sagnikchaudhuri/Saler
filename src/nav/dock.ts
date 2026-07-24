// ============================================================================
// Dock magnification.
//
// The macOS Dock effect, reduced to arithmetic so it can be unit-tested
// without a layout engine. Nothing here touches the DOM: the component feeds
// in a pointer position and gets back a scale per letter, which it writes to a
// CSS custom property. jsdom has no layout, so the maths is the thing we can
// actually verify — see dock.test.ts.
//
// Falloff is piecewise-linear in "letter index" space:
//   distance 0  → active      (the letter under the pointer)
//   distance 1  → neighbour   (its immediate neighbours)
//   distance 2+ → base        (everything further away)
// Linear between those points, so the row swells and settles continuously
// rather than stepping. No spring, no overshoot — the brief asks for
// controlled easing, and overshoot on typography reads as a toy.
// ============================================================================

export interface DockConfig {
  /** Scale of the letter directly under the pointer. */
  active: number;
  /** Scale of the letters either side of it. */
  neighbour: number;
  /** Resting scale for everything else. */
  base: number;
  /** Transition duration in ms for scale and spacing. */
  durationMs: number;
  /**
   * Horizontal padding growth per unit of scale, in em of the letter's own
   * size. This is what stops magnified letters overlapping: the transform
   * grows the glyph visually, the padding grows the box that reserves space.
   */
  padEm: number;
}

/** Homepage: deliberately dramatic. */
export const HOME_DOCK: DockConfig = {
  active: 1.42,
  neighbour: 1.16,
  base: 1,
  durationMs: 260,
  padEm: 0.34,
};

/** Navbar: the same idea, smaller and faster. */
export const COMPACT_DOCK: DockConfig = {
  active: 1.13,
  neighbour: 1.05,
  base: 1,
  durationMs: 170,
  padEm: 0.3,
};

/**
 * Scale for the letter at `index` given the current focus position.
 *
 * `focus` is continuous, not an integer: a pointer halfway between L and E
 * sits at 2.5 and both letters lift equally. `null` means nothing is focused,
 * so every letter rests at base.
 */
export function dockScale(index: number, focus: number | null, cfg: DockConfig): number {
  if (focus === null || !Number.isFinite(focus)) return cfg.base;
  const d = Math.abs(index - focus);
  if (d >= 2) return cfg.base;
  if (d <= 1) return cfg.active + (cfg.neighbour - cfg.active) * d;
  return cfg.neighbour + (cfg.base - cfg.neighbour) * (d - 1);
}

/**
 * Map a pointer x-coordinate onto the continuous letter-index axis.
 *
 * Outside the row the focus keeps decaying rather than clamping to the end
 * letter, so approaching from the left doesn't snap S to full size before the
 * pointer has arrived.
 */
export function focusFromPointer(x: number, centers: number[]): number | null {
  const n = centers.length;
  if (n === 0) return null;
  if (n === 1) return 0;
  // Degenerate geometry (jsdom, display:none, pre-layout): no meaningful focus.
  if (centers.every((c) => c === centers[0])) return null;

  if (x <= centers[0]) {
    const gap = centers[1] - centers[0];
    return gap > 0 ? -(centers[0] - x) / gap : 0;
  }
  const last = n - 1;
  if (x >= centers[last]) {
    const gap = centers[last] - centers[last - 1];
    return gap > 0 ? last + (x - centers[last]) / gap : last;
  }
  for (let i = 0; i < last; i++) {
    const a = centers[i];
    const b = centers[i + 1];
    if (x >= a && x <= b && b > a) return i + (x - a) / (b - a);
  }
  return null;
}

/** The inline custom properties a letter needs for its current scale. */
export function letterStyle(scale: number, cfg: DockConfig): React.CSSProperties {
  return {
    // Consumed by the class-level transform and padding rules.
    ['--dock-s' as string]: scale.toFixed(3),
    ['--dock-pad' as string]: `${cfg.padEm}em`,
    ['--dock-ms' as string]: `${cfg.durationMs}ms`,
  };
}
