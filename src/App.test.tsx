import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('App shell', () => {
  it('renders the scenario briefing by default', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: /Rohan Mehta/i }),
    ).toBeInTheDocument();
  });

  it('shows the Demo Mode badge in Phase 1', () => {
    render(<App />);
    expect(screen.getByText(/Demo Mode/i)).toBeInTheDocument();
  });

  it('navigates from briefing to the live call', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Start roleplay/i }));
    expect(screen.getByText(/End Call/i)).toBeInTheDocument();
  });
});
