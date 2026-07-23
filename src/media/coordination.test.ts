import { describe, it, expect } from 'vitest';
import { computeMediaActivity } from './coordination';

const base = {
  isListening: false,
  conversationAcceptsInput: true,
  speechSupported: true,
  permissionBlocked: false,
};

describe('computeMediaActivity', () => {
  it('allows listening when everything is ready', () => {
    expect(computeMediaActivity(base).canStartListening).toBe(true);
  });

  it('blocks listening when speech is unsupported', () => {
    expect(computeMediaActivity({ ...base, speechSupported: false }).canStartListening).toBe(false);
  });

  it('blocks listening when permission was denied', () => {
    expect(computeMediaActivity({ ...base, permissionBlocked: true }).canStartListening).toBe(false);
  });

  it('blocks a second session while already listening', () => {
    expect(computeMediaActivity({ ...base, isListening: true }).canStartListening).toBe(false);
  });

  it('blocks listening while the conversation is busy', () => {
    expect(
      computeMediaActivity({ ...base, conversationAcceptsInput: false }).canStartListening,
    ).toBe(false);
  });

  // Phase 6 preparation: the mic must never be open while the customer speaks.
  it('blocks listening while customer audio is playing', () => {
    const m = computeMediaActivity({ ...base, isOutputSpeaking: true });
    expect(m.canStartListening).toBe(false);
    expect(m.isOutputSpeaking).toBe(true);
  });

  it('blocks listening while customer audio is being prepared', () => {
    expect(computeMediaActivity({ ...base, isOutputPreparing: true }).canStartListening).toBe(false);
  });

  it('defaults output flags to false when omitted', () => {
    const m = computeMediaActivity(base);
    expect(m.isOutputSpeaking).toBe(false);
  });
});
