// Session-scoped memory for the SALER homepage.
//
// The homepage is an entrance, not a destination: it belongs to the moment you
// arrive, and re-showing it mid-session would imply the call you left behind
// had been discarded. So it is shown once per browser session and is then
// unreachable — no Home button, no Escape, no scroll-up.
//
// sessionStorage, deliberately: localStorage would suppress the homepage
// forever, including on a genuinely fresh visit days later. A full refresh or
// a new tab is a new session and legitimately shows it again.
//
// Kept out of the component file so React Fast Refresh keeps working.

export const ENTRY_SESSION_KEY = 'saler.entered';

/** True when a section has already been entered in this browser session. */
export function hasEnteredApp(): boolean {
  try {
    return sessionStorage.getItem(ENTRY_SESSION_KEY) === '1';
  } catch {
    // Storage unavailable (private mode): treat as a fresh arrival, never crash.
    return false;
  }
}

export function markAppEntered(): void {
  try {
    sessionStorage.setItem(ENTRY_SESSION_KEY, '1');
  } catch {
    // Non-fatal — showing the homepage once more beats a broken entrance.
  }
}
