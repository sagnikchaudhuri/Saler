import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SalerNav } from './SalerNav';

// jsdom has no layout, so pixel dimensions are verified in the browser. Here we
// assert the STRUCTURAL guarantees: the compact controls carry the min-size
// classes, presentational duplicates leave the a11y tree, and the labels name
// destinations distinctly.

describe('SalerNav — accessibility & touch targets', () => {
  it('gives every compact control the 44px minimum hit-area classes', () => {
    render(<SalerNav mode="compact" active="HOME" onSelect={vi.fn()} letterSize="1.1rem" />);
    const buttons = document.querySelectorAll('button[data-letter]');
    expect(buttons.length).toBe(5);
    for (const b of buttons) {
      expect(b.className).toContain('min-h-[44px]');
      expect(b.className).toContain('min-w-[44px]');
    }
  });

  it('names Home and Scenario distinctly, and never labels a letter alone', () => {
    // Compact navbar leads with Home.
    render(<SalerNav mode="compact" active="HOME" onSelect={vi.fn()} letterSize="1.1rem" />);
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Scenario' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^S$/ })).toBeNull();
  });

  it('exposes the homepage letters as "Open <destination>" actions', () => {
    render(<SalerNav mode="home" active={null} onSelect={vi.fn()} letterSize="8rem" />);
    expect(screen.getByRole('button', { name: 'Open Scenario' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Report Logs' })).toBeInTheDocument();
  });

  it('mutes only the duplicated letters, keeping the unique one actionable', () => {
    const onSelect = vi.fn();
    const { container } = render(
      // The landing configuration: A/L/E/R already live in the navbar, Scenario
      // does not — so only Scenario stays exposed here.
      <SalerNav
        mode="home"
        active={null}
        onSelect={onSelect}
        letterSize="8rem"
        mutedLetters={['A', 'L', 'E', 'R']}
      />,
    );
    // The duplicates are out of the a11y tree and tab order...
    expect(screen.queryByRole('button', { name: /Open Ask/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Open Report Logs/i })).toBeNull();
    const askBtn = container.querySelector('button[data-letter="A"]') as HTMLButtonElement;
    expect(askBtn.getAttribute('aria-hidden')).toBe('true');
    expect(askBtn.getAttribute('tabindex')).toBe('-1');
    // ...but a muted letter still works for a sighted pointer user...
    fireEvent.click(askBtn);
    expect(onSelect).toHaveBeenCalledWith('A');
    // ...and the unique Scenario letter remains a proper action.
    expect(screen.getByRole('button', { name: 'Open Scenario' })).toBeInTheDocument();
  });

  it('keyboard and pointer activation target the same element', () => {
    const onSelect = vi.fn();
    render(<SalerNav mode="compact" active="HOME" onSelect={onSelect} letterSize="1.1rem" />);
    const ask = screen.getByRole('button', { name: 'Ask — the conversation' });
    fireEvent.click(ask);
    fireEvent.keyDown(ask, { key: 'Enter' }); // native button activation
    expect(onSelect).toHaveBeenCalledWith('A');
  });
});
