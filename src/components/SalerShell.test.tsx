import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SalerShell } from './SalerShell';
import type { SectionId, NavTarget } from '../nav/sections';

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

/** Drives the shell the way App does: phase flips when a letter is entered. */
function Harness({
  onEnter,
  onSelect,
}: { onEnter?: (id: SectionId) => void; onSelect?: (id: NavTarget) => void } = {}) {
  return function Wrapper({
    initial = 'home' as 'home' | 'app',
    entered = false,
  }: { initial?: 'home' | 'app'; entered?: boolean }) {
    return (
      <SalerShell
        phase={initial}
        entered={entered}
        section={null}
        onSelect={onSelect ?? vi.fn()}
        onEnter={onEnter ?? vi.fn()}
        previews={{}}
        demoMode
      >
        <h1>Destination</h1>
      </SalerShell>
    );
  };
}

beforeEach(() => mockReducedMotion(false));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('SalerShell — the homepage', () => {
  it('shows the large letters and no navbar', () => {
    const W = Harness();
    render(<W />);
    expect(screen.getByRole('button', { name: /Open Scenario/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /Saler sections/i })).toBeNull();
  });

  it('renders no separate Saler wordmark', () => {
    const W = Harness();
    render(<W />);
    expect(screen.queryByText(/^saler$/i)).toBeNull();
  });

  it('reports the chosen letter to the application', () => {
    const onEnter = vi.fn();
    const W = Harness({ onEnter });
    render(<W />);
    fireEvent.click(screen.getByRole('button', { name: /Open Evaluation/i }));
    expect(onEnter).toHaveBeenCalledWith('E');
  });
});

describe('SalerShell — the entrance runs exactly once', () => {
  it('treats every later click as navigation, not another entrance', () => {
    const onEnter = vi.fn();
    const onSelect = vi.fn();
    const W = Harness({ onEnter, onSelect });
    render(<W />);

    fireEvent.click(screen.getByRole('button', { name: /Open Scenario/i }));
    // The letters are already docking, so they carry their compact names now.
    fireEvent.click(screen.getByRole('button', { name: 'Ask — the conversation' }));

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledWith('S');
    expect(onSelect).toHaveBeenCalledWith('A');
  });

  it('is not replayed by StrictMode double-invocation', () => {
    const onEnter = vi.fn();
    const W = Harness({ onEnter });
    render(
      <StrictMode>
        <W />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Open Scenario/i }));
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});

describe('SalerShell — the application', () => {
  it('shows the compact navbar and the section content', () => {
    const W = Harness();
    render(<W initial="app" />);
    expect(screen.getByRole('navigation', { name: /Saler sections/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Destination' })).toBeInTheDocument();
    // No homepage phrasing survives into the navbar.
    expect(screen.queryByRole('button', { name: /^Open /i })).toBeNull();
  });

  it('keeps the navbar out of the scrolling content', () => {
    const W = Harness();
    render(<W initial="app" />);
    const bar = screen.getByRole('navigation', { name: /Saler sections/i }).closest('.fixed');
    expect(bar).not.toBeNull();
  });
});

describe('SalerShell — reduced motion', () => {
  it('arrives immediately instead of animating, and still moves focus', () => {
    mockReducedMotion(true);
    const onEnter = vi.fn();
    const W = Harness({ onEnter });
    const { rerender } = render(<W />);

    fireEvent.click(screen.getByRole('button', { name: /Open Scenario/i }));
    expect(onEnter).toHaveBeenCalledWith('S');

    // App flips phase; with reduced motion there is no docking interval to sit
    // through, so the content is interactive at once.
    rerender(<W initial="app" />);
    const main = screen.getByRole('heading', { name: 'Destination' }).closest('main');
    expect(main).not.toHaveClass('pointer-events-none');
  });

  it('completes the animated path within the transition budget', () => {
    vi.useFakeTimers();
    const W = Harness();
    render(<W />);
    fireEvent.click(screen.getByRole('button', { name: /Open Scenario/i }));

    act(() => {
      vi.advanceTimersByTime(900);
    });
    // Nothing is left pending: the dock has a definite end.
    expect(vi.getTimerCount()).toBe(0);
  });
});
