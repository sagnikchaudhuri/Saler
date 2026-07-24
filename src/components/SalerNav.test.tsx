import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SalerNav } from './SalerNav';
import { SECTIONS } from '../nav/sections';
import { HOME_DOCK, COMPACT_DOCK } from '../nav/dock';

function renderNav(over: Partial<Parameters<typeof SalerNav>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <SalerNav
      mode="home"
      active={null}
      onSelect={onSelect}
      letterSize="8rem"
      {...over}
    />,
  );
  return onSelect;
}

/** The scale the component actually applied, read back off the DOM. */
function scaleOf(letter: string): number {
  const el = document.querySelector(`button[data-letter="${letter}"]`);
  return Number(el?.getAttribute('data-scale'));
}

describe('SalerNav — letters are the navigation', () => {
  it('renders all five letters as real buttons', () => {
    renderNav();
    for (const sec of SECTIONS) {
      expect(screen.getByRole('button', { name: `Open ${sec.name}` })).toBeInTheDocument();
    }
  });

  it('shows a section label under each homepage letter', () => {
    renderNav();
    expect(screen.getByText('Scenario')).toBeInTheDocument();
    expect(screen.getByText('Report Logs')).toBeInTheDocument();
  });

  it('never renders a separate Saler wordmark', () => {
    renderNav({ mode: 'compact', active: 'S' });
    expect(screen.queryByText(/^saler$/i)).toBeNull();
  });

  it('selects the letter that was clicked', () => {
    const onSelect = renderNav();
    fireEvent.click(screen.getByRole('button', { name: /Open Report Logs/i }));
    expect(onSelect).toHaveBeenCalledWith('R');
  });

  it('marks the current section with aria-current, not colour alone', () => {
    renderNav({ mode: 'compact', active: 'L' });
    const current = screen.getByRole('button', { name: 'Live readings' });
    expect(current).toHaveAttribute('aria-current', 'page');
    // Every other letter must not claim to be current.
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });
});

describe('SalerNav — dock magnification', () => {
  it('gives a focused letter the active scale and its neighbours less', () => {
    renderNav();
    // L is the middle letter: neighbours on both sides.
    fireEvent.focus(screen.getByRole('button', { name: /Open Live readings/i }));

    expect(scaleOf('L')).toBeCloseTo(HOME_DOCK.active, 3);
    expect(scaleOf('A')).toBeCloseTo(HOME_DOCK.neighbour, 3);
    expect(scaleOf('E')).toBeCloseTo(HOME_DOCK.neighbour, 3);
  });

  it('leaves distant letters at base scale', () => {
    renderNav();
    fireEvent.focus(screen.getByRole('button', { name: /Open Live readings/i }));
    expect(scaleOf('S')).toBeCloseTo(HOME_DOCK.base, 3);
    expect(scaleOf('R')).toBeCloseTo(HOME_DOCK.base, 3);
  });

  it('rests every letter before anything is focused', () => {
    renderNav();
    for (const sec of SECTIONS) expect(scaleOf(sec.id)).toBeCloseTo(1, 3);
  });

  it('rests the row again when focus leaves it entirely', () => {
    renderNav();
    const letter = screen.getByRole('button', { name: /Open Ask/i });
    fireEvent.focus(letter);
    expect(scaleOf('A')).toBeCloseTo(HOME_DOCK.active, 3);

    // relatedTarget outside the row: the whole dock settles.
    fireEvent.blur(letter, { relatedTarget: document.body });
    expect(scaleOf('A')).toBeCloseTo(1, 3);
  });

  it('keyboard focus produces the same magnification as a pointer', () => {
    renderNav();
    // Focus is the only input jsdom can model faithfully, and the component
    // deliberately drives both from one focus value.
    fireEvent.focus(screen.getByRole('button', { name: /Open Evaluation/i }));
    expect(scaleOf('E')).toBeCloseTo(HOME_DOCK.active, 3);
  });

  it('uses smaller limits in the navbar than on the homepage', () => {
    renderNav({ mode: 'compact', active: 'S', letterSize: '1.1rem' });
    fireEvent.focus(screen.getByRole('button', { name: 'Live readings' }));

    expect(scaleOf('L')).toBeCloseTo(COMPACT_DOCK.active, 3);
    expect(scaleOf('L')).toBeLessThan(HOME_DOCK.active);
    expect(scaleOf('A')).toBeCloseTo(COMPACT_DOCK.neighbour, 3);
    expect(scaleOf('A')).toBeLessThan(HOME_DOCK.neighbour);
  });

  it('reserves horizontal room so magnified letters do not overlap', () => {
    renderNav();
    fireEvent.focus(screen.getByRole('button', { name: /Open Live readings/i }));
    const el = document.querySelector('button[data-letter="L"]') as HTMLElement;
    // Padding is driven by the same variable as the transform, so the box
    // grows with the glyph rather than letting it collide with its neighbour.
    expect(el.style.getPropertyValue('--dock-s')).toBe(HOME_DOCK.active.toFixed(3));
    expect(el.style.getPropertyValue('--dock-pad')).toBe(`${HOME_DOCK.padEm}em`);
  });
});

describe('SalerNav — keyboard', () => {
  it('moves between letters with the arrow keys', () => {
    renderNav();
    const s = screen.getByRole('button', { name: /Open Scenario/i });
    s.focus();

    fireEvent.keyDown(s, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Open Ask/i }));
  });

  it('wraps around at the ends', () => {
    renderNav();
    const s = screen.getByRole('button', { name: /Open Scenario/i });
    s.focus();
    fireEvent.keyDown(s, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /Open Report Logs/i }),
    );
  });

  it('does not treat Escape as a way back to the homepage', () => {
    const onSelect = renderNav({ mode: 'compact', active: 'A' });
    const a = screen.getByRole('button', { name: 'Ask — the conversation' });
    fireEvent.keyDown(a, { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
