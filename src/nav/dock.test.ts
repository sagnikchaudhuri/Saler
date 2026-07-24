import { describe, it, expect } from 'vitest';
import {
  dockScale,
  focusFromPointer,
  letterStyle,
  HOME_DOCK,
  COMPACT_DOCK,
} from './dock';

// jsdom has no layout engine, so a magnification effect can only be verified
// honestly at the level where it is actually decided: the arithmetic. These
// tests pin the curve and the spec's scale ranges; the visual result is
// verified in a real browser.

describe('dock — magnification curve', () => {
  it('gives the letter under the pointer the strongest scale', () => {
    expect(dockScale(2, 2, HOME_DOCK)).toBe(HOME_DOCK.active);
  });

  it('gives immediate neighbours a moderate scale', () => {
    expect(dockScale(1, 2, HOME_DOCK)).toBe(HOME_DOCK.neighbour);
    expect(dockScale(3, 2, HOME_DOCK)).toBe(HOME_DOCK.neighbour);
  });

  it('leaves distant letters at base scale', () => {
    expect(dockScale(0, 2, HOME_DOCK)).toBe(HOME_DOCK.base);
    expect(dockScale(4, 2, HOME_DOCK)).toBe(HOME_DOCK.base);
  });

  it('rests every letter when nothing is focused', () => {
    for (let i = 0; i < 5; i++) expect(dockScale(i, null, HOME_DOCK)).toBe(HOME_DOCK.base);
  });

  it('decays monotonically with distance', () => {
    const scales = [0, 0.5, 1, 1.5, 2, 3].map((d) => dockScale(d, 0, HOME_DOCK));
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeLessThanOrEqual(scales[i - 1]);
    }
  });

  it('interpolates between letters rather than stepping', () => {
    // A pointer halfway between two letters lifts both equally.
    const left = dockScale(1, 1.5, HOME_DOCK);
    const right = dockScale(2, 1.5, HOME_DOCK);
    expect(left).toBeCloseTo(right, 5);
    expect(left).toBeGreaterThan(HOME_DOCK.neighbour);
    expect(left).toBeLessThan(HOME_DOCK.active);
  });

  it('never overshoots the active scale', () => {
    for (let f = -3; f <= 8; f += 0.25) {
      for (let i = 0; i < 5; i++) {
        const s = dockScale(i, f, HOME_DOCK);
        expect(s).toBeGreaterThanOrEqual(HOME_DOCK.base);
        expect(s).toBeLessThanOrEqual(HOME_DOCK.active);
      }
    }
  });

  it('ignores a non-finite focus rather than producing NaN', () => {
    expect(dockScale(0, Number.NaN, HOME_DOCK)).toBe(HOME_DOCK.base);
  });
});

describe('dock — homepage is dramatic, navbar is restrained', () => {
  it('keeps the homepage within the approved range', () => {
    expect(HOME_DOCK.active).toBeGreaterThanOrEqual(1.35);
    expect(HOME_DOCK.active).toBeLessThanOrEqual(1.5);
    expect(HOME_DOCK.neighbour).toBeGreaterThanOrEqual(1.12);
    expect(HOME_DOCK.neighbour).toBeLessThanOrEqual(1.22);
    expect(HOME_DOCK.base).toBe(1);
  });

  it('keeps the navbar within the approved range', () => {
    expect(COMPACT_DOCK.active).toBeGreaterThanOrEqual(1.1);
    expect(COMPACT_DOCK.active).toBeLessThanOrEqual(1.16);
    expect(COMPACT_DOCK.neighbour).toBeGreaterThanOrEqual(1.03);
    expect(COMPACT_DOCK.neighbour).toBeLessThanOrEqual(1.07);
    expect(COMPACT_DOCK.base).toBe(1);
  });

  it('makes the navbar effect smaller and faster than the homepage', () => {
    expect(COMPACT_DOCK.active).toBeLessThan(HOME_DOCK.active);
    expect(COMPACT_DOCK.neighbour).toBeLessThan(HOME_DOCK.neighbour);
    expect(COMPACT_DOCK.durationMs).toBeLessThan(HOME_DOCK.durationMs);
  });

  it('keeps the navbar duration within the approved 140-220ms window', () => {
    expect(COMPACT_DOCK.durationMs).toBeGreaterThanOrEqual(140);
    expect(COMPACT_DOCK.durationMs).toBeLessThanOrEqual(220);
  });
});

describe('dock — pointer mapping', () => {
  const centers = [100, 200, 300, 400, 500];

  it('maps a letter centre to that letter', () => {
    expect(focusFromPointer(300, centers)).toBe(2);
  });

  it('maps the midpoint between two letters to a half index', () => {
    expect(focusFromPointer(250, centers)).toBeCloseTo(1.5, 5);
  });

  it('keeps decaying past the ends instead of clamping', () => {
    // Approaching from far left must not already magnify S at full strength.
    const focus = focusFromPointer(-100, centers);
    expect(focus).toBeLessThan(-1);
    expect(dockScale(0, focus, HOME_DOCK)).toBe(HOME_DOCK.base);
    expect(focusFromPointer(700, centers)).toBeGreaterThan(5);
  });

  it('returns null when there is no usable geometry', () => {
    // Pre-layout, display:none, or jsdom: every rect is zero.
    expect(focusFromPointer(50, [0, 0, 0, 0, 0])).toBeNull();
    expect(focusFromPointer(50, [])).toBeNull();
  });

  it('handles a single letter without dividing by zero', () => {
    expect(focusFromPointer(50, [100])).toBe(0);
  });
});

describe('dock — style output', () => {
  it('emits the custom properties the letter rules consume', () => {
    const style = letterStyle(1.42, HOME_DOCK) as Record<string, string>;
    expect(style['--dock-s']).toBe('1.420');
    expect(style['--dock-pad']).toBe(`${HOME_DOCK.padEm}em`);
    expect(style['--dock-ms']).toBe(`${HOME_DOCK.durationMs}ms`);
  });

  it('reserves horizontal room so magnified letters cannot overlap', () => {
    // Padding grows with scale; that is what keeps the row from colliding.
    expect(HOME_DOCK.padEm).toBeGreaterThan(0);
    expect(COMPACT_DOCK.padEm).toBeGreaterThan(0);
  });
});
