import {
  MAX_RETAINED_SESSIONS,
  SESSIONS_STORAGE_KEY,
  SESSION_SCHEMA_VERSION,
  type StorageLike,
  type StoredSession,
} from './types';

// ============================================================================
// Versioned session repository.
//
// The one place localStorage is touched. React components never read/write
// storage directly — they go through this abstraction, which handles:
//   - corrupted-JSON recovery (reset to empty, surface a warning)
//   - schema-version migration (unknown/newer versions are dropped, not trusted)
//   - retention limits (keep newest MAX_RETAINED_SESSIONS)
//   - de-duplication by id (idempotent save prevents duplicate rows)
//   - change notifications so the UI re-renders
// ============================================================================

/** In-memory fallback storage (used when localStorage is unavailable / in tests). */
export class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function isValidSession(x: unknown): x is StoredSession {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.schemaVersion === 'number' &&
    typeof s.date === 'string' &&
    Array.isArray(s.transcript) &&
    typeof s.finalReport === 'object' &&
    s.finalReport !== null
  );
}

/** Migrate a raw stored session to the current version, or null if unusable. */
function migrate(raw: unknown): StoredSession | null {
  if (!isValidSession(raw)) return null;
  // Only the current version is known so far. A newer/unknown version cannot be
  // trusted, so it is dropped rather than misread. Add real migrations here.
  if (raw.schemaVersion !== SESSION_SCHEMA_VERSION) return null;
  return raw;
}

export class SessionRepository {
  private readonly storage: StorageLike;
  private readonly maxSessions: number;
  private cache: StoredSession[] = [];
  private recoveryWarning: string | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(storage: StorageLike, opts: { maxSessions?: number } = {}) {
    this.storage = storage;
    this.maxSessions = opts.maxSessions ?? MAX_RETAINED_SESSIONS;
    this.load();
  }

  /** Load + sanitise from storage. Corrupt data recovers to an empty list. */
  private load(): void {
    const raw = this.storage.getItem(SESSIONS_STORAGE_KEY);
    if (raw === null) {
      this.cache = [];
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      const migrated = parsed
        .map(migrate)
        .filter((s): s is StoredSession => s !== null);
      // Sort newest first.
      migrated.sort((a, b) => b.endTime - a.endTime);
      this.cache = migrated.slice(0, this.maxSessions);
      // If we dropped anything malformed, note it and rewrite clean storage.
      if (migrated.length !== parsed.length) {
        this.recoveryWarning = 'Some saved sessions could not be read and were skipped.';
        this.persist();
      }
    } catch {
      this.cache = [];
      this.recoveryWarning = 'Saved session data was corrupted and has been reset.';
      this.storage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify([]));
    }
  }

  private persist(): void {
    this.storage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(this.cache));
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Newest-first snapshot. Stable reference until a mutation occurs. */
  list(): StoredSession[] {
    return this.cache;
  }

  get(id: string): StoredSession | null {
    return this.cache.find((s) => s.id === id) ?? null;
  }

  /**
   * Save a completed session. Idempotent by id: saving the same id again
   * replaces the existing row rather than adding a duplicate.
   */
  save(session: StoredSession): void {
    const withoutDupe = this.cache.filter((s) => s.id !== session.id);
    const next = [session, ...withoutDupe]
      .sort((a, b) => b.endTime - a.endTime)
      .slice(0, this.maxSessions);
    this.cache = next;
    this.persist();
    this.emit();
  }

  delete(id: string): void {
    const next = this.cache.filter((s) => s.id !== id);
    if (next.length === this.cache.length) return;
    this.cache = next;
    this.persist();
    this.emit();
  }

  clearAll(): void {
    this.cache = [];
    this.persist();
    this.emit();
  }

  /** Read and clear any pending corrupted-storage recovery warning. */
  consumeRecoveryWarning(): string | null {
    const w = this.recoveryWarning;
    this.recoveryWarning = null;
    return w;
  }
}

/** Pick the best available storage backend for the browser. */
function defaultStorage(): StorageLike {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Probe: some environments throw on access (private mode, disabled).
      const probe = '__salessim_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return window.localStorage;
    }
  } catch {
    // fall through to memory
  }
  return new MemoryStorage();
}

/** App-wide singleton used by the hooks/UI. */
export const sessionRepository = new SessionRepository(defaultStorage());
