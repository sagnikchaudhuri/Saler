import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { hasEnteredApp, markAppEntered, ENTRY_SESSION_KEY } from './entrySession';

describe('entrySession — the homepage shows once per browser session', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('reports a fresh session as not yet entered', () => {
    expect(hasEnteredApp()).toBe(false);
  });

  it('remembers the entrance for the rest of the session', () => {
    markAppEntered();
    expect(hasEnteredApp()).toBe(true);
  });

  it('uses sessionStorage, so a new session sees the homepage again', () => {
    markAppEntered();
    expect(sessionStorage.getItem(ENTRY_SESSION_KEY)).toBe('1');
    // localStorage would suppress the homepage forever, including on a genuine
    // return visit days later.
    expect(localStorage.getItem(ENTRY_SESSION_KEY)).toBeNull();
  });

  it('treats an unreadable store as a fresh arrival rather than crashing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(hasEnteredApp()).toBe(false);
  });

  it('never throws when the store refuses to write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => markAppEntered()).not.toThrow();
  });
});
