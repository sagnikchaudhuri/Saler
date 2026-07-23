import { describe, it, expect } from 'vitest';
import { createMediaCoordinator } from './MediaCoordinator';
import { computeMediaActivity } from './coordination';

describe('MediaCoordinator', () => {
  it('stops recognition for output only when it is active', () => {
    const c = createMediaCoordinator();
    let active = false;
    let stops = 0;
    c.registerRecognition({ stop: () => { stops++; active = false; }, isActive: () => active });

    expect(c.stopRecognitionForOutput()).toBe(false);
    expect(stops).toBe(0);

    active = true;
    expect(c.stopRecognitionForOutput()).toBe(true);
    expect(stops).toBe(1);
  });

  it('reports whether recognition is active', () => {
    const c = createMediaCoordinator();
    let active = true;
    c.registerRecognition({ stop: () => {}, isActive: () => active });
    expect(c.isRecognitionActive()).toBe(true);
    active = false;
    expect(c.isRecognitionActive()).toBe(false);
  });

  it('stops output through the registered controller', () => {
    const c = createMediaCoordinator();
    let stops = 0;
    c.registerOutput({ stop: () => stops++ });
    c.stopOutput();
    expect(stops).toBe(1);
  });

  it('stopAll stops both directions', () => {
    const c = createMediaCoordinator();
    let outStops = 0;
    let recActive = true;
    let recStops = 0;
    c.registerOutput({ stop: () => outStops++ });
    c.registerRecognition({ stop: () => { recStops++; recActive = false; }, isActive: () => recActive });

    c.stopAll();
    expect(outStops).toBe(1);
    expect(recStops).toBe(1);
  });

  it('unregistering detaches the controller', () => {
    const c = createMediaCoordinator();
    let stops = 0;
    const unregister = c.registerOutput({ stop: () => stops++ });
    unregister();
    c.stopOutput();
    expect(stops).toBe(0);
  });

  it('is safe with nothing registered', () => {
    const c = createMediaCoordinator();
    expect(() => c.stopAll()).not.toThrow();
    expect(c.isRecognitionActive()).toBe(false);
    expect(c.stopRecognitionForOutput()).toBe(false);
  });
});

describe('computeMediaActivity — output side', () => {
  const base = {
    isListening: false,
    conversationAcceptsInput: true,
    speechSupported: true,
    permissionBlocked: false,
  };

  it('allows output when idle', () => {
    expect(computeMediaActivity(base).canStartOutput).toBe(true);
  });

  it('blocks output while recognition is active', () => {
    const m = computeMediaActivity({ ...base, isListening: true });
    expect(m.canStartOutput).toBe(false);
    expect(m.mustStopRecognitionForOutput).toBe(true);
  });

  it('blocks output while already speaking or preparing', () => {
    expect(computeMediaActivity({ ...base, isOutputSpeaking: true }).canStartOutput).toBe(false);
    expect(computeMediaActivity({ ...base, isOutputPreparing: true }).canStartOutput).toBe(false);
  });

  it('blocks output when the user turned voice off', () => {
    expect(computeMediaActivity({ ...base, voiceEnabled: false }).canStartOutput).toBe(false);
  });

  it('never allows listening and output to start simultaneously', () => {
    const speaking = computeMediaActivity({ ...base, isOutputSpeaking: true });
    expect(speaking.canStartListening).toBe(false);
    const listening = computeMediaActivity({ ...base, isListening: true });
    expect(listening.canStartOutput).toBe(false);
  });

  it('exposes the preparing flag', () => {
    expect(computeMediaActivity({ ...base, isOutputPreparing: true }).isOutputPreparing).toBe(true);
  });
});
