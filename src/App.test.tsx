import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from './App';
import { INTRO_SESSION_KEY } from './components/introSession';
import { ENTRY_SESSION_KEY } from './nav/entrySession';

/** Arrive as a returning visitor: intro seen, a section already entered. */
function skipEntrance() {
  sessionStorage.setItem(INTRO_SESSION_KEY, '1');
  sessionStorage.setItem(ENTRY_SESSION_KEY, '1');
}

describe('App shell', () => {
  beforeEach(() => {
    sessionStorage.clear();
    // Skip the intro overlay so tests exercise the app directly. The intro is
    // presentation only and is covered by its own behaviour elsewhere.
    sessionStorage.setItem(INTRO_SESSION_KEY, '1');
  });

  it('opens on the SALER homepage', () => {
    render(<App />);
    // The five letters are the navigation; Scenario is the first doorway.
    expect(screen.getByRole('button', { name: /Open Scenario/i })).toBeInTheDocument();
  });

  it('shows the Demo Mode badge', () => {
    render(<App />);
    // The badge appears on the homepage and again in the application footer,
    // which stays mounted (hidden) so the live call survives going Home.
    expect(screen.getAllByText(/Demo Mode/i).length).toBeGreaterThan(0);
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

describe('App — the homepage is an entrance, not a destination', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(INTRO_SESSION_KEY, '1');
  });

  it('shows the large homepage on a fresh browser session', () => {
    render(<App />);
    // Homepage letters carry the "Open …" phrasing; the navbar does not.
    expect(screen.getByRole('button', { name: /Open Live readings/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /Saler sections/i })).toBeNull();
  });

  it('renders no separate Saler wordmark anywhere on the homepage', () => {
    render(<App />);
    expect(screen.queryByText(/^saler$/i)).toBeNull();
  });

  it('opens the section belonging to the letter that was chosen', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Open Report Logs/i }));
    expect(screen.getByRole('heading', { name: /Report Logs/i })).toBeInTheDocument();
  });

  it('records the entrance so the homepage cannot return this session', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Open Scenario/i }));
    expect(sessionStorage.getItem(ENTRY_SESSION_KEY)).toBe('1');
  });

  it('skips the homepage entirely once a section has been entered', () => {
    skipEntrance();
    render(<App />);
    expect(screen.queryByRole('button', { name: /Open Scenario/i })).toBeNull();
    expect(screen.getByRole('navigation', { name: /Saler sections/i })).toBeInTheDocument();
  });

  it('leaves Escape inert — Home is the only way back', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Open Scenario/i }));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Home' }), { key: 'Escape' });
    // Still inside the application: the landing letters have not come back.
    expect(screen.queryByRole('button', { name: /Open Scenario/i })).toBeNull();
    expect(screen.getByRole('navigation', { name: /Saler sections/i })).toBeInTheDocument();
  });

  it('does not replay the entrance when switching sections', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Open Scenario/i }));
    // Every later move uses the compact navbar, never the homepage letters.
    fireEvent.click(screen.getByRole('button', { name: 'Report Logs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Evaluation' }));
    expect(screen.queryByRole('button', { name: /Open Scenario/i })).toBeNull();
  });
});

describe('App — navbar navigation preserves the call', () => {
  beforeEach(() => {
    sessionStorage.clear();
    skipEntrance();
    localStorage.clear();
  });

  it('marks the current section with aria-current', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Report Logs' }));
    expect(screen.getByRole('button', { name: 'Report Logs' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('keeps the transcript and an unsent draft when moving A → L → A', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Start roleplay/i }));

    const box = screen.getByRole('textbox', { name: /your response/i });
    fireEvent.change(box, { target: { value: 'How do you train reps today?' } });

    // L is the same call seen from a different angle, not a new page.
    fireEvent.click(screen.getByRole('button', { name: 'Live readings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask — the conversation' }));

    expect(screen.getByRole('textbox', { name: /your response/i })).toHaveValue(
      'How do you train reps today?',
    );
    // The call is still the same one — it was never restarted.
    expect(screen.getByText(/End Call/i)).toBeInTheDocument();
  });

  it('does not restart the roleplay when returning to Ask from another letter', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Start roleplay/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Report Logs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask — the conversation' }));

    // Back in the same live call, not on the briefing's start button.
    expect(screen.getByText(/End Call/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start roleplay/i })).toBeNull();
  });
});

describe('App — persistent Home', () => {
  beforeEach(() => {
    sessionStorage.clear();
    skipEntrance();
    localStorage.clear();
  });

  it('offers Home as the leading navbar item, named Home and not Scenario', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: /Saler sections/i });
    const letters = within(nav).getAllByRole('button');
    expect(letters[0]).toHaveAccessibleName('Home');
    expect(within(nav).queryByRole('button', { name: 'Scenario' })).toBeNull();
  });

  it('opens the landing page, keeping the navbar and the actionable Scenario letter', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    // Scenario is NOT in the navbar, so its large letter stays actionable —
    // the only accessible route to the briefing on a return visit.
    expect(screen.getByRole('button', { name: /Open Scenario/i })).toBeInTheDocument();
    // The navbar is present, because Home is persistent.
    expect(screen.getByRole('navigation', { name: /Saler sections/i })).toBeInTheDocument();
  });

  it('exposes each landing destination to assistive tech exactly once', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    // The four navbar-duplicated large letters (A/L/E/R) are muted, so the
    // accessibility tree holds each action once: Home + Scenario + A/L/E/R.
    const names = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
      .filter((n): n is string => n !== null);
    for (const dup of ['Open Ask — the conversation', 'Open Live readings', 'Open Evaluation', 'Open Report Logs']) {
      expect(names.filter((n) => n === dup)).toHaveLength(0);
    }
    expect(names.filter((n) => n === 'Open Scenario')).toHaveLength(1);
    expect(names.filter((n) => n === 'Home')).toHaveLength(1);
  });

  it('marks Home as the current destination while on the landing page', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('includes Home in arrow-key navigation', () => {
    render(<App />);
    const home = screen.getByRole('button', { name: 'Home' });
    home.focus();
    fireEvent.keyDown(home, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Ask — the conversation' }),
    );

    // And it is reachable by wrapping backwards from the first letter.
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(home);
  });

  it('does not replay the entrance animation on the way back', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    // Docking dims the content while the letters travel. Returning Home is a
    // plain change of destination, so nothing is mid-flight.
    const main = document.querySelector('main');
    expect(main).not.toHaveClass('opacity-0');
  });

  it('keeps the live call, its transcript and an unsent draft across Home', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Start roleplay/i }));

    const transcriptBefore = document.querySelector('main')?.textContent ?? '';
    fireEvent.change(screen.getByRole('textbox', { name: /your response/i }), {
      target: { value: 'What does onboarding look like today?' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask — the conversation' }));

    expect(screen.getByRole('textbox', { name: /your response/i })).toHaveValue(
      'What does onboarding look like today?',
    );
    expect(screen.getByText(/End Call/i)).toBeInTheDocument();
    // The same call, not a fresh one: the opening turn is still the same text.
    expect(document.querySelector('main')?.textContent).toContain(
      transcriptBefore.slice(0, 40),
    );
  });

  it('does not restart the roleplay when coming back from Home', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Start roleplay/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask — the conversation' }));

    // Still in the same call — never returned to the briefing's start button.
    expect(screen.queryByRole('button', { name: /Start roleplay/i })).toBeNull();
  });

  it('keeps the section content mounted while Home is showing', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Start roleplay/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));

    // Hidden, not unmounted — this is what preserves the draft and the call.
    const main = document.querySelector('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveClass('hidden');
  });
});

describe('App — Report Logs labelling', () => {
  beforeEach(() => {
    sessionStorage.clear();
    skipEntrance();
    localStorage.clear();
  });

  it('calls R "Report Logs" in the navbar and the section itself', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Report Logs' }));
    expect(screen.getByRole('heading', { name: /Report Logs/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Review/i })).toBeNull();
  });

  it('keeps the issue form secondary, under "Report a problem"', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Report Logs' }));
    expect(screen.getByText(/Report a problem/i)).toBeInTheDocument();
  });
});
