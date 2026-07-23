// Session-scoped memory for the intro, kept out of the component file so fast
// refresh keeps working. Deliberately sessionStorage, not localStorage: the
// intro may play once per fresh browser session, never on navigation.

export const INTRO_SESSION_KEY = 'saler.intro.seen';

/** True when the intro has already played in this browser session. */
export function hasSeenIntro(): boolean {
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) === '1';
  } catch {
    // Storage unavailable (private mode): treat as unseen, never crash.
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    sessionStorage.setItem(INTRO_SESSION_KEY, '1');
  } catch {
    // Non-fatal — a replayed intro is far better than a broken app.
  }
}
