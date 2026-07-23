import { describe, it, expect } from 'vitest';
import { SessionRepository, MemoryStorage } from './repository';
import { SESSIONS_STORAGE_KEY, SESSION_SCHEMA_VERSION, type StoredSession } from './types';
import type { ScoreHistoryEntry } from '../scoring/types';
import { emptySignals } from '../evaluation/validate';

function makeEntry(sellerTurn: number): ScoreHistoryEntry {
  const m = { discovery: 50, relevance: 50, clarity: 50, listening: 50, objectionHandling: 50, progression: 50 };
  return {
    sellerTurn, timestamp: sellerTurn, stage: 'discovery',
    previousMetrics: m, updatedMetrics: m, rawOverall: 50, visibleOverall: 50 + sellerTurn,
    momentum: 'Stable', signals: emptySignals(), briefFeedback: 'f', recommendedNextMove: 'n', reasons: [],
  };
}

function makeSession(id: string, endTime: number): StoredSession {
  return {
    id,
    schemaVersion: SESSION_SCHEMA_VERSION,
    date: new Date(endTime).toISOString(),
    startTime: endTime - 60_000,
    endTime,
    durationMs: 60_000,
    scenarioId: 'scenario-1',
    providerNames: { conversation: 'c', realtimeEvaluator: 'r', finalEvaluator: 'f' },
    demoMode: true,
    transcript: [
      { id: 't1', speaker: 'customer', message: 'hello?', stage: 'opening', timestamp: 1 },
      { id: 't2', speaker: 'seller', message: 'how do you train reps?', stage: 'discovery', timestamp: 2 },
    ],
    finalStage: 'discovery',
    objectionsRaised: [],
    addressedObjections: [],
    scoreHistory: [makeEntry(1), makeEntry(2)],
    liveAverage: 52,
    finalReport: {
      overall_score: 55,
      category_scores: {
        opening_and_confidence: 55, discovery_questions: 55, problem_identification: 55,
        value_articulation: 55, objection_handling: 55, clarity_and_conciseness: 55,
        closing_and_next_step: 55,
      },
      strengths: ['a', 'b', 'c'],
      missed_opportunities: ['x', 'y', 'z'],
      strongest_statement: 'how do you train reps?',
      weakest_statement: '',
      better_response: 'better',
      missed_discovery_questions: ['q'],
      objection_results: [],
      recommended_practice: 'practice',
      summary: 'summary',
    },
    fallbackWarnings: [],
    sellerTurnCount: 1,
  };
}

function freshRepo(max?: number) {
  return new SessionRepository(new MemoryStorage(), max ? { maxSessions: max } : {});
}

describe('SessionRepository — basic CRUD', () => {
  it('saves and lists a completed session', () => {
    const repo = freshRepo();
    repo.save(makeSession('a', 1000));
    expect(repo.list()).toHaveLength(1);
    expect(repo.list()[0].id).toBe('a');
  });

  it('lists newest first', () => {
    const repo = freshRepo();
    repo.save(makeSession('old', 1000));
    repo.save(makeSession('new', 5000));
    repo.save(makeSession('mid', 3000));
    expect(repo.list().map((s) => s.id)).toEqual(['new', 'mid', 'old']);
  });

  it('gets a session by id', () => {
    const repo = freshRepo();
    repo.save(makeSession('a', 1000));
    expect(repo.get('a')?.id).toBe('a');
    expect(repo.get('missing')).toBeNull();
  });

  it('deletes a single session', () => {
    const repo = freshRepo();
    repo.save(makeSession('a', 1000));
    repo.save(makeSession('b', 2000));
    repo.delete('a');
    expect(repo.list().map((s) => s.id)).toEqual(['b']);
  });

  it('clears all sessions', () => {
    const repo = freshRepo();
    repo.save(makeSession('a', 1000));
    repo.save(makeSession('b', 2000));
    repo.clearAll();
    expect(repo.list()).toHaveLength(0);
  });

  it('does not duplicate when the same session id is saved twice', () => {
    const repo = freshRepo();
    const s = makeSession('same', 1000);
    repo.save(s);
    repo.save(s);
    repo.save(s);
    expect(repo.list()).toHaveLength(1);
  });

  it('preserves the transcript and score history exactly', () => {
    const storage = new MemoryStorage();
    const repo = new SessionRepository(storage);
    const s = makeSession('a', 1000);
    repo.save(s);
    // Re-read through a brand-new repository (round-trips through JSON).
    const reloaded = new SessionRepository(storage).get('a')!;
    expect(reloaded.transcript).toEqual(s.transcript);
    expect(reloaded.scoreHistory).toEqual(s.scoreHistory);
    expect(reloaded.finalReport).toEqual(s.finalReport);
  });
});

describe('SessionRepository — persistence & recovery', () => {
  it('persists across repository instances', () => {
    const storage = new MemoryStorage();
    new SessionRepository(storage).save(makeSession('a', 1000));
    expect(new SessionRepository(storage).list()).toHaveLength(1);
  });

  it('recovers safely from corrupted JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSIONS_STORAGE_KEY, '{not valid json!!');
    const repo = new SessionRepository(storage);
    expect(repo.list()).toEqual([]);
    expect(repo.consumeRecoveryWarning()).toMatch(/corrupt/i);
    // Storage was reset to a usable value.
    expect(storage.getItem(SESSIONS_STORAGE_KEY)).toBe('[]');
  });

  it('recovers when the stored value is not an array', () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSIONS_STORAGE_KEY, '{"nope":true}');
    const repo = new SessionRepository(storage);
    expect(repo.list()).toEqual([]);
    expect(repo.consumeRecoveryWarning()).toBeTruthy();
  });

  it('drops sessions with an unsupported schema version', () => {
    const storage = new MemoryStorage();
    const future = { ...makeSession('future', 1000), schemaVersion: 999 };
    storage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify([future, makeSession('ok', 2000)]));
    const repo = new SessionRepository(storage);
    expect(repo.list().map((s) => s.id)).toEqual(['ok']);
    expect(repo.consumeRecoveryWarning()).toMatch(/could not be read/i);
  });

  it('skips malformed entries but keeps good ones', () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify([{ garbage: true }, makeSession('ok', 2000)]));
    const repo = new SessionRepository(storage);
    expect(repo.list().map((s) => s.id)).toEqual(['ok']);
  });

  it('consumes the recovery warning only once', () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSIONS_STORAGE_KEY, 'broken');
    const repo = new SessionRepository(storage);
    expect(repo.consumeRecoveryWarning()).toBeTruthy();
    expect(repo.consumeRecoveryWarning()).toBeNull();
  });
});

describe('SessionRepository — retention', () => {
  it('retains only the newest N sessions', () => {
    const repo = freshRepo(3);
    for (let i = 1; i <= 6; i++) repo.save(makeSession(`s${i}`, i * 1000));
    const ids = repo.list().map((s) => s.id);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(['s6', 's5', 's4']);
  });
});

describe('SessionRepository — change notification', () => {
  it('notifies subscribers on save and delete', () => {
    const repo = freshRepo();
    let calls = 0;
    const unsub = repo.subscribe(() => calls++);
    repo.save(makeSession('a', 1000));
    repo.delete('a');
    unsub();
    repo.save(makeSession('b', 2000));
    expect(calls).toBe(2);
  });

  it('returns a stable list reference until a mutation occurs', () => {
    const repo = freshRepo();
    const first = repo.list();
    expect(repo.list()).toBe(first);
    repo.save(makeSession('a', 1000));
    expect(repo.list()).not.toBe(first);
  });
});
