import { describe, it, expect } from 'vitest';
import { SessionRepository } from './repository';
import { SESSION_SCHEMA_VERSION, type StorageLike, type StoredSession } from './types';

// A storage double whose setItem behaviour we can switch to model quota limits.
class ControllableStorage implements StorageLike {
  private map = new Map<string, string>();
  mode: 'ok' | 'quota-always' | 'quota-until-few' | 'security' = 'ok';
  /** Under 'quota-until-few', a write succeeds once the array is this short. */
  maxRecords = 3;
  writes = 0;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.writes += 1;
    if (this.mode === 'quota-always') throw new DOMException('full', 'QuotaExceededError');
    if (this.mode === 'security') throw new DOMException('blocked', 'SecurityError');
    if (this.mode === 'quota-until-few') {
      const count = Array.isArray(JSON.parse(value)) ? (JSON.parse(value) as unknown[]).length : 0;
      if (count > this.maxRecords) throw new DOMException('full', 'QuotaExceededError');
    }
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function session(id: string, endTime: number): StoredSession {
  return {
    id,
    schemaVersion: SESSION_SCHEMA_VERSION,
    date: new Date(endTime).toISOString(),
    startTime: endTime - 1000,
    endTime,
    durationMs: 1000,
    scenarioId: 's',
    providerNames: { conversation: 'c', realtimeEvaluator: 'r', finalEvaluator: 'f' },
    providerModes: { customer: 'demo', turnEvaluator: 'demo', finalReport: 'demo' },
    demoMode: true,
    transcript: [{ id: 't1', speaker: 'seller', message: 'hi', stage: 'opening', timestamp: 1 }],
    finalStage: 'discovery',
    objectionsRaised: [],
    addressedObjections: [],
    scoreHistory: [],
    liveAverage: 50,
    finalReport: {
      overall_score: 50,
      category_scores: {
        opening_and_confidence: 50, discovery_questions: 50, problem_identification: 50,
        value_articulation: 50, objection_handling: 50, clarity_and_conciseness: 50,
        closing_and_next_step: 50,
      },
      strengths: [], missed_opportunities: ['a', 'b', 'c'],
      strongest_statement: '', weakest_statement: '', better_response: 'x',
      missed_discovery_questions: [], objection_results: [],
      recommended_practice: 'p', summary: 'sum',
    },
    fallbackWarnings: [],
    sellerTurnCount: 1,
  };
}

describe('repository — localStorage quota handling', () => {
  it('a clean save reports success and evicts nothing', () => {
    const store = new ControllableStorage();
    const repo = new SessionRepository(store);
    expect(repo.save(session('a', 1000))).toEqual({ ok: true, evicted: 0 });
  });

  it('on quota, evicts the oldest and retries once, keeping the newest', () => {
    const store = new ControllableStorage();
    const repo = new SessionRepository(store);
    // Seed several older sessions while writes are cheap.
    for (let i = 0; i < 6; i++) repo.save(session(`old-${i}`, 1000 + i));

    // Now the store rejects while more than a few records are present.
    store.mode = 'quota-until-few';
    const outcome = repo.save(session('newest', 9999));

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.evicted).toBeGreaterThan(0);
    // The just-saved session survived; an older one was dropped first.
    expect(repo.get('newest')).not.toBeNull();
    expect(repo.list()[0].id).toBe('newest');
    expect(repo.list().length).toBeLessThan(7);
  });

  it('on repeated quota failure, returns a typed warning and preserves the newest in memory', () => {
    const store = new ControllableStorage();
    const repo = new SessionRepository(store);
    repo.save(session('older', 1000));
    store.mode = 'quota-always';

    const outcome = repo.save(session('newest', 5000));
    expect(outcome).toEqual({ ok: false, reason: 'quota' });
    // The active report is still available in memory even though disk failed.
    expect(repo.get('newest')).not.toBeNull();
    expect(repo.list()[0].id).toBe('newest');
  });

  it('reports "unavailable" for a security error and never throws', () => {
    const store = new ControllableStorage();
    const repo = new SessionRepository(store);
    store.mode = 'security';
    let outcome: ReturnType<typeof repo.save> | undefined;
    expect(() => {
      outcome = repo.save(session('x', 1));
    }).not.toThrow();
    expect(outcome).toEqual({ ok: false, reason: 'unavailable' });
    expect(repo.get('x')).not.toBeNull(); // still in memory
  });

  it('does not loop indefinitely — bounded write attempts on persistent quota', () => {
    const store = new ControllableStorage();
    const repo = new SessionRepository(store);
    store.mode = 'quota-always';
    store.writes = 0;
    repo.save(session('n', 1));
    // At most: initial write + one eviction retry + one best-effort quiet write.
    expect(store.writes).toBeLessThanOrEqual(3);
  });
});
