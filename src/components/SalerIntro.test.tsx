import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { SalerIntro } from './SalerIntro';
import { hasSeenIntro, INTRO_SESSION_KEY } from './introSession';

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  sessionStorage.clear();
  setReducedMotion(false);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SalerIntro — choreography', () => {
  it('renders all five letters and the tagline', () => {
    render(<SalerIntro onReveal={vi.fn()} onDone={vi.fn()} />);
    for (const ch of ['S', 'A', 'L', 'E', 'R']) {
      expect(screen.getByText(ch)).toBeInTheDocument();
    }
    expect(
      screen.getByText('Practice the conversation before it matters.'),
    ).toBeInTheDocument();
  });

  it('reveals the interface before it finishes, so the transition is continuous', () => {
    const onReveal = vi.fn();
    const onDone = vi.fn();
    render(<SalerIntro onReveal={onReveal} onDone={onDone} />);

    // Letters converge and the tagline holds; nothing revealed yet.
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onReveal).not.toHaveBeenCalled();

    // Dispersal starts the reveal while the overlay is still on screen.
    act(() => { vi.advanceTimersByTime(150); });
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();

    // Overlay retires shortly after.
    act(() => { vi.advanceTimersByTime(700); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('completes within roughly three seconds', () => {
    const onDone = vi.fn();
    render(<SalerIntro onReveal={vi.fn()} onDone={onDone} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(onDone).toHaveBeenCalled();
  });

  it('marks the session so it never replays on navigation', () => {
    render(<SalerIntro onReveal={vi.fn()} onDone={vi.fn()} />);
    expect(hasSeenIntro()).toBe(false);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(sessionStorage.getItem(INTRO_SESSION_KEY)).toBe('1');
    expect(hasSeenIntro()).toBe(true);
  });
});

describe('SalerIntro — skip and accessibility', () => {
  it('exposes a keyboard-reachable Skip control that ends the intro at once', () => {
    const onReveal = vi.fn();
    const onDone = vi.fn();
    render(<SalerIntro onReveal={onReveal} onDone={onDone} />);

    const skip = screen.getByRole('button', { name: /skip intro/i });
    skip.focus();
    expect(document.activeElement).toBe(skip);

    fireEvent.click(skip);
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasSeenIntro()).toBe(true);
  });

  it('does not fire its callbacks twice when skipped then timed out', () => {
    const onDone = vi.fn();
    render(<SalerIntro onReveal={vi.fn()} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: /skip intro/i }));
    act(() => { vi.advanceTimersByTime(4000); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('names the wordmark for assistive technology', () => {
    render(<SalerIntro onReveal={vi.fn()} onDone={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Saler' })).toBeInTheDocument();
  });
});

describe('SalerIntro — reduced motion', () => {
  it('finishes almost immediately and still reveals the app', () => {
    setReducedMotion(true);
    const onReveal = vi.fn();
    const onDone = vi.fn();
    render(<SalerIntro onReveal={onReveal} onDone={onDone} />);

    // The wordmark is shown statically, then hands over well under a second.
    act(() => { vi.advanceTimersByTime(500); });
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows the tagline immediately rather than animating it in', () => {
    setReducedMotion(true);
    render(<SalerIntro onReveal={vi.fn()} onDone={vi.fn()} />);
    const tagline = screen.getByText('Practice the conversation before it matters.');
    expect(tagline.className).toContain('opacity-100');
  });
});

describe('SalerIntro — resilience', () => {
  it('still completes when sessionStorage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });

    const onDone = vi.fn();
    expect(() => {
      render(<SalerIntro onReveal={vi.fn()} onDone={onDone} />);
      act(() => { vi.advanceTimersByTime(3000); });
    }).not.toThrow();
    expect(onDone).toHaveBeenCalled();

    if (original) Object.defineProperty(window, 'sessionStorage', original);
  });
});
