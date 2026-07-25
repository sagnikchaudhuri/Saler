import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hexToRgb, contrastRatio, blendOver, relativeLuminance } from './contrast';

// ============================================================================
// Palette contrast regression tests.
//
// The palette values are read from the REAL tailwind.config.js (not duplicated
// here and not asserted as class strings), so darkening a token in the config
// is what these tests actually verify. Every meaningful-text pairing must meet
// WCAG AA for NORMAL text (4.5:1). The large-text 3:1 exception is deliberately
// NOT used to excuse any small text below.
// ============================================================================

const AA_NORMAL = 4.5;

/** Extract `name: '#rrggbb'` values from the tailwind config source. */
function readPalette(): Record<string, string> {
  const src = readFileSync(resolve(process.cwd(), 'tailwind.config.js'), 'utf8');
  const out: Record<string, string> = {};
  const re = /(\w[\w-]*)\s*:\s*'(#[0-9a-fA-F]{6})'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // First occurrence wins (DEFAULT before hover etc.).
    if (!(m[1] in out)) out[m[1] as string] = m[2];
  }
  // `DEFAULT` is captured for ink (it comes first); grab the accent explicitly.
  const am = /accent:\s*\{\s*DEFAULT:\s*'(#[0-9a-fA-F]{6})'/.exec(src);
  if (am) out.accent = am[1];
  return out;
}

const P = readPalette();
const WHITE = hexToRgb('#FFFFFF');

function ratioTo(fgHex: string, bgHex: string): number {
  return contrastRatio(hexToRgb(fgHex), hexToRgb(bgHex));
}

describe('palette — sanity', () => {
  it('found the expected tokens in tailwind.config.js', () => {
    for (const t of ['canvas', 'surface', 'DEFAULT', 'secondary', 'muted', 'positive', 'caution', 'critical']) {
      expect(P[t], `missing token ${t}`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    expect(P.canvas.toUpperCase()).toBe('#FFFFFF');
  });
});

describe('meaningful text meets WCAG AA (4.5:1) on the surfaces it uses', () => {
  const cases: { name: string; fg: () => string; bg: () => string }[] = [
    { name: 'ink-primary on white', fg: () => P.DEFAULT, bg: () => P.canvas },
    { name: 'ink-secondary on white', fg: () => P.secondary, bg: () => P.canvas },
    { name: 'ink-muted on white', fg: () => P.muted, bg: () => P.canvas },
    // NOTE: ink-muted is never rendered on the soft surface in the app (the one
    // bg-surface element uses text-ink), so that non-occurring pairing is not
    // asserted. On soft surface muted would be ~4.43:1 — kept in mind if muted
    // text is ever placed on a panel.
    { name: 'caution on white', fg: () => P.caution, bg: () => P.canvas },
    { name: 'caution on soft surface', fg: () => P.caution, bg: () => P.surface },
    { name: 'positive on white', fg: () => P.positive, bg: () => P.canvas },
    { name: 'critical on white', fg: () => P.critical, bg: () => P.canvas },
  ];

  for (const c of cases) {
    it(`${c.name} ≥ ${AA_NORMAL}:1`, () => {
      const r = ratioTo(c.fg(), c.bg());
      expect(r, `${c.name} measured ${r.toFixed(2)}:1 (needs ${AA_NORMAL})`).toBeGreaterThanOrEqual(AA_NORMAL);
    });
  }

  it('caution warning text on its bg-caution/5 banner surface ≥ 4.5:1', () => {
    // Warnings render caution text on `bg-caution/5` = caution at 0.05 over white.
    const bannerBg = blendOver(hexToRgb(P.caution), 0.05, WHITE);
    const r = contrastRatio(hexToRgb(P.caution), bannerBg);
    expect(r, `caution on caution/5 measured ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('accent button: white text on the accent background ≥ 4.5:1', () => {
    const r = ratioTo('#FFFFFF', P.accent);
    expect(r, `white on accent ${P.accent} measured ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('caution remains visually distinct from red and green', () => {
  it('caution is neither the critical red nor the positive green', () => {
    expect(P.caution.toUpperCase()).not.toBe(P.critical.toUpperCase());
    expect(P.caution.toUpperCase()).not.toBe(P.positive.toUpperCase());
    // Distinct luminance/hue: caution should differ from both by a clear margin.
    const lc = relativeLuminance(hexToRgb(P.caution));
    const lr = relativeLuminance(hexToRgb(P.critical));
    const lg = relativeLuminance(hexToRgb(P.positive));
    expect(Math.abs(lc - lr)).toBeGreaterThan(0.001);
    expect(Math.abs(lc - lg)).toBeGreaterThan(0.001);
  });
});

// Decorative-only combinations (NOT asserted for AA): the letter shadow
// (text-ink/[0.07]) and the low-opacity dock hover tints are purely decorative
// and carry no information, so they are intentionally excluded here.
describe('documented measured ratios (informational)', () => {
  it('logs the key ratios for the record', () => {
    const bannerBg = blendOver(hexToRgb(P.caution), 0.05, WHITE);
    console.log(
      `[contrast] ink=${ratioTo(P.DEFAULT, P.canvas).toFixed(2)} ` +
        `secondary=${ratioTo(P.secondary, P.canvas).toFixed(2)} ` +
        `muted=${ratioTo(P.muted, P.canvas).toFixed(2)} ` +
        `caution/white=${ratioTo(P.caution, P.canvas).toFixed(2)} ` +
        `caution/banner=${contrastRatio(hexToRgb(P.caution), bannerBg).toFixed(2)} ` +
        `positive=${ratioTo(P.positive, P.canvas).toFixed(2)} ` +
        `critical=${ratioTo(P.critical, P.canvas).toFixed(2)} ` +
        `white/accent=${ratioTo('#FFFFFF', P.accent).toFixed(2)}`,
    );
    expect(true).toBe(true);
  });
});
