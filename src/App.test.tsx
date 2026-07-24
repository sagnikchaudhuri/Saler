import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { INTRO_SESSION_KEY } from './components/introSession';

describe('App shell', () => {
  beforeEach(() => {
    // Skip the intro overlay so tests exercise the app directly. The intro is
    // presentation only and is covered by its own behaviour elsewhere.
    sessionStorage.setItem(INTRO_SESSION_KEY, '1');
  });

  it('opens on the SALER carousel', () => {
    render(<App />);
    // The five letters are the navigation; Scenario is the first doorway.
    expect(screen.getByRole('button', { name: /Open Scenario/i })).toBeInTheDocument();
  });

  it('shows the Demo Mode badge', () => {
    render(<App />);
    expect(screen.getByText(/Demo Mode/i)).toBeInTheDocument();
  });

  it('enters Scenario and can start the roleplay', () => {
    render(<App />);
    // Enter the Scenario viewpoint.
    fireEvent.click(screen.getByRole('button', { name: /Open Scenario/i }));
    expect(
      screen.getByRole('heading', { name: /Rohan Mehta/i }),
    ).toBeInTheDocument();

    // Start the conversation.
    fireEvent.click(screen.getByRole('button', { name: /Start roleplay/i }));
    expect(screen.getByText(/End Call/i)).toBeInTheDocument();
  });
});
