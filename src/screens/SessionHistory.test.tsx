import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionHistory } from './SessionHistory';
import { sessionRepository } from '../persistence/repository';
import { SESSION_SCHEMA_VERSION, type StoredSession } from '../persistence/types';
import { emptySignals } from '../evaluation/validate';
import type { ScoreHistoryEntry } from '../scoring/types';

function entry(n: number): ScoreHistoryEntry {
  const m = { discovery: 50, relevance: 50, clarity: 50, listening: 50, objectionHandling: 50, progression: 50 };
  return {
    sellerTurn: n, timestamp: n, stage: 'discovery', previousMetrics: m, updatedMetrics: m,
    rawOverall: 50, visibleOverall: 50, momentum: 'Stable', signals: emptySignals(),
    briefFeedback: 'f', recommendedNextMove: 'n', reasons: [],
  };
}

function makeSession(id: string, endTime: number, score = 55): StoredSession {
  return {
    id,
    schemaVersion: SESSION_SCHEMA_VERSION,
    date: new Date(endTime).toISOString(),
    startTime: endTime - 90_000,
    endTime,
    durationMs: 90_000,
    scenarioId: 'scenario',
    providerNames: { conversation: 'c', realtimeEvaluator: 'r', finalEvaluator: 'f' },
    demoMode: true,
    transcript: [{ id: 't1', speaker: 'seller', message: 'hi', stage: 'opening', timestamp: 1 }],
    finalStage: 'discovery',
    objectionsRaised: [],
    addressedObjections: [],
    scoreHistory: [entry(1), entry(2), entry(3)],
    liveAverage: 48,
    finalReport: {
      overall_score: score,
      category_scores: {
        opening_and_confidence: 50, discovery_questions: 50, problem_identification: 50,
        value_articulation: 50, objection_handling: 50, clarity_and_conciseness: 50,
        closing_and_next_step: 50,
      },
      strengths: ['a', 'b', 'c'],
      missed_opportunities: ['x', 'y', 'z'],
      strongest_statement: 'hi',
      weakest_statement: '',
      better_response: 'better',
      missed_discovery_questions: [],
      objection_results: [],
      recommended_practice: 'practice',
      summary: 'summary',
    },
    fallbackWarnings: [],
    sellerTurnCount: 4,
  };
}

function renderHistory(onOpen = vi.fn(), recoveryWarning: string | null = null) {
  render(
    <SessionHistory onOpen={onOpen} onStart={vi.fn()} recoveryWarning={recoveryWarning} />,
  );
  return onOpen;
}

beforeEach(() => {
  sessionRepository.clearAll();
});

describe('SessionHistory — empty state', () => {
  it('shows an empty state when nothing is saved', () => {
    renderHistory();
    expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument();
    expect(screen.queryByText('Clear All')).toBeNull();
  });
});

describe('SessionHistory — listing', () => {
  it('lists saved sessions newest first with their key figures', () => {
    sessionRepository.save(makeSession('old', 1_700_000_000_000, 40));
    sessionRepository.save(makeSession('new', 1_700_000_900_000, 72));
    renderHistory();

    const scores = screen.getAllByText(/^(40|72)$/).map((el) => el.textContent);
    expect(scores[0]).toBe('72'); // newest first
    expect(screen.getAllByText(/Live avg 48/).length).toBe(2);
    expect(screen.getAllByText(/4 turns/).length).toBe(2);
    expect(screen.getAllByText(/Reached Discovery/).length).toBe(2);
  });

  it('opens the saved report without starting a new roleplay', () => {
    sessionRepository.save(makeSession('a', 1_700_000_000_000));
    const onOpen = renderHistory();
    fireEvent.click(screen.getByRole('button', { name: /View Report/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].id).toBe('a');
  });

  it('shows a corrupted-storage recovery warning when one is present', () => {
    renderHistory(vi.fn(), 'Saved session data was corrupted and has been reset.');
    expect(screen.getByText(/corrupted and has been reset/i)).toBeInTheDocument();
  });
});

describe('SessionHistory — deletion', () => {
  it('requires confirmation before deleting a session', () => {
    sessionRepository.save(makeSession('a', 1_700_000_000_000));
    renderHistory();

    fireEvent.click(screen.getByRole('button', { name: /Delete session from/i }));
    // Still present until confirmed.
    expect(sessionRepository.list()).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Confirm Delete/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));
    expect(sessionRepository.list()).toHaveLength(0);
    expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument();
  });

  it('can cancel a deletion', () => {
    sessionRepository.save(makeSession('a', 1_700_000_000_000));
    renderHistory();
    fireEvent.click(screen.getByRole('button', { name: /Delete session from/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(sessionRepository.list()).toHaveLength(1);
  });

  it('clears all sessions after confirmation', () => {
    sessionRepository.save(makeSession('a', 1_700_000_000_000));
    sessionRepository.save(makeSession('b', 1_700_000_500_000));
    renderHistory();

    fireEvent.click(screen.getByRole('button', { name: /Clear All/i }));
    expect(sessionRepository.list()).toHaveLength(2); // not yet
    fireEvent.click(screen.getByRole('button', { name: /Delete All/i }));
    expect(sessionRepository.list()).toHaveLength(0);
    expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument();
  });
});
