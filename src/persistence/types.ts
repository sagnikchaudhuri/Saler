import type { SalesStage, TranscriptTurn } from '../types';
import type { ObjectionKey } from '../conversation/types';
import type { ScoreHistoryEntry } from '../scoring/types';
import type { FinalReport } from '../final/types';

// ============================================================================
// Persistence schema.
//
// Only COMPLETED sessions are stored (an in-progress call has no final report
// and would pollute history). The record is versioned so future shape changes
// can be migrated rather than silently breaking older saves. It deliberately
// contains NO raw audio, NO API keys, NO hidden prompts, and NO environment
// data — only what the report and history screens need.
// ============================================================================

/** Bump when the stored shape changes; add a migration in the repository. */
export const SESSION_SCHEMA_VERSION = 2;

/** localStorage key that holds the array of stored sessions. */
export const SESSIONS_STORAGE_KEY = 'salessim.sessions';

/** Maximum sessions retained (newest kept, oldest dropped). */
export const MAX_RETAINED_SESSIONS = 25;

export interface StoredProviderNames {
  conversation: string;
  realtimeEvaluator: string;
  finalEvaluator: string;
}

/** Which implementation actually handled each capability during the call. */
export type CapabilityMode = 'ai' | 'demo' | 'mixed' | 'none';

export interface StoredProviderModes {
  customer: CapabilityMode;
  turnEvaluator: CapabilityMode;
  finalReport: CapabilityMode;
}

/** A completed, persisted roleplay session. */
export interface StoredSession {
  id: string;
  schemaVersion: number;
  /** ISO date string for display. */
  date: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  scenarioId: string;
  providerNames: StoredProviderNames;
  /** Honest record of AI vs deterministic handling, per capability. */
  providerModes: StoredProviderModes;
  demoMode: boolean;
  transcript: TranscriptTurn[];
  finalStage: SalesStage;
  objectionsRaised: ObjectionKey[];
  addressedObjections: ObjectionKey[];
  scoreHistory: ScoreHistoryEntry[];
  liveAverage: number;
  finalReport: FinalReport;
  fallbackWarnings: string[];
  sellerTurnCount: number;
}

/** Minimal Storage surface (matches window.localStorage) for testability. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
