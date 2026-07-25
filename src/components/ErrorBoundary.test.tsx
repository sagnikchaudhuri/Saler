import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('secret-internal-detail-xyz');
}

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('shows a recovery screen instead of a blank page when a child throws', () => {
    // Silence React's expected error log for this render.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload application/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /return to start/i })).toBeInTheDocument();
  });

  it('never exposes the underlying error detail in the fallback UI', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.queryByText(/secret-internal-detail-xyz/)).toBeNull();
    expect(document.body.textContent).not.toContain('secret-internal-detail-xyz');
  });

  it('recovers: "Return to start" clears session entry flags', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.setItem('saler.entered', '1');
    sessionStorage.setItem('saler.intro.seen', '1');
    // jsdom cannot reload; stub it so the handler does not throw.
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /return to start/i }));
    expect(sessionStorage.getItem('saler.entered')).toBeNull();
    expect(sessionStorage.getItem('saler.intro.seen')).toBeNull();
    expect(reload).toHaveBeenCalled();
  });
});
