import { describe, it, expect } from 'vitest';
import { computeMomentum, MOMENTUM_THRESHOLD } from './momentum';

describe('computeMomentum', () => {
  it('returns Improving when the score rose by >= threshold over the window', () => {
    expect(computeMomentum([40, 44, 50])).toBe('Improving');
  });

  it('returns Declining when the score fell by >= threshold over the window', () => {
    expect(computeMomentum([50, 45, 40])).toBe('Declining');
  });

  it('returns Stable for small fluctuations (never on a one-point change)', () => {
    expect(computeMomentum([40, 41, 42])).toBe('Stable'); // +2 < threshold
    expect(computeMomentum([44, 43, 44])).toBe('Stable'); // net 0
  });

  it('treats a single-point difference as Stable', () => {
    expect(MOMENTUM_THRESHOLD).toBeGreaterThan(1);
    expect(computeMomentum([50, 50, 51])).toBe('Stable');
  });

  it('returns Stable with insufficient history (< 3 samples)', () => {
    expect(computeMomentum([])).toBe('Stable');
    expect(computeMomentum([44])).toBe('Stable');
    expect(computeMomentum([44, 60])).toBe('Stable');
  });

  it('uses only the most recent window of samples', () => {
    // Older decline is ignored; the last three (48,52,56) are Improving.
    expect(computeMomentum([90, 10, 48, 52, 56])).toBe('Improving');
  });
});
