import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FinalReport } from './FinalReport';
import { SESSION_SCHEMA_VERSION, type StoredSession } from '../persistence/types';
import { OBJECTIONS, type ObjectionKey } from '../conversation/types';
import { emptySignals } from '../evaluation/validate';
import type { ScoreHistoryEntry } from '../scoring/types';

function entry(n: number): ScoreHistoryEntry {
  const m = { discovery: 50, relevance: 50, clarity: 50, listening: 50, objectionHandling: 50, progression: 50 };
  return {
    sellerTurn: n, timestamp: n, stage: 'discovery', previousMetrics: m, updatedMetrics: m,
    rawOverall: 50, visibleOverall: 44 + n, momentum: 'Stable', signals: emptySignals(),
    briefFeedback: 'f', recommendedNextMove: 'n', reasons: [],
  };
}

function makeSession(over: Partial<StoredSession> = {}): StoredSession {
  return {
    id: 'sess-1',
    schemaVersion: SESSION_SCHEMA_VERSION,
    date: new Date(1_700_000_000_000).toISOString(),
    startTime: 1_700_000_000_000 - 120_000,
    endTime: 1_700_000_000_000,
    durationMs: 120_000,
    scenarioId: 'rohan-mehta-sales-enablement',
    providerNames: { conversation: 'Demo customer', realtimeEvaluator: 'Demo evaluator', finalEvaluator: 'Demo final evaluator' },
    providerModes: { customer: 'demo', turnEvaluator: 'demo', finalReport: 'demo' },
    demoMode: true,
    transcript: [
      { id: 't1', speaker: 'customer', message: 'Hi, this is Rohan.', stage: 'opening', timestamp: 1 },
      { id: 't2', speaker: 'seller', message: 'How do you train reps today?', stage: 'discovery', timestamp: 2 },
    ],
    finalStage: 'discovery',
    objectionsRaised: [],
    addressedObjections: [],
    scoreHistory: [entry(1), entry(2), entry(3)],
    liveAverage: 46,
    finalReport: {
      overall_score: 58,
      category_scores: {
        opening_and_confidence: 60, discovery_questions: 70, problem_identification: 55,
        value_articulation: 48, objection_handling: 50, clarity_and_conciseness: 65,
        closing_and_next_step: 30,
      },
      strengths: ['Explored the process.', 'Asked good questions.', 'Stayed composed.'],
      missed_opportunities: ['No impact quantified.', 'No next step.', 'No decision process.'],
      strongest_statement: 'How do you train reps today?',
      weakest_statement: '',
      better_response: 'Tie value to the pain he named.',
      missed_discovery_questions: ['What timeline are you working toward?'],
      objection_results: [],
      recommended_practice: 'Practice closing with a specific next step.',
      summary: 'Good discovery, weak close.',
    },
    fallbackWarnings: [],
    sellerTurnCount: 5,
    ...over,
  };
}

function renderReport(session: StoredSession | null) {
  return render(
    <FinalReport
      session={session}
      onReplay={vi.fn()}
      onBriefing={vi.fn()}
      onHistory={vi.fn()}
      onStart={vi.fn()}
    />,
  );
}

// Read the value out of a specific stat tile (numbers repeat across the page,
// e.g. in the score-trend data table).
function tileValue(label: string): string {
  const tile = screen.getByText(label).parentElement as HTMLElement;
  return within(tile).getByText(/^[+-]?\d+$/).textContent ?? '';
}

describe('FinalReport — scores and explanation', () => {
  it('renders the final score, live average, and difference', () => {
    renderReport(makeSession());
    expect(tileValue('Final Score')).toBe('58');
    expect(tileValue('Live Average')).toBe('46');
    expect(tileValue('Difference')).toBe('+12');
  });

  it('renders the live-vs-final comparison explanation', () => {
    renderReport(makeSession());
    expect(screen.getByText('Live vs Final Scoring')).toBeInTheDocument();
    expect(screen.getByText(/final score was higher/i)).toBeInTheDocument();
    expect(screen.getByText(/judges the conversation as a whole/i)).toBeInTheDocument();
  });

  it('shows no placeholder labelling anywhere', () => {
    renderReport(makeSession());
    expect(screen.queryByText(/placeholder/i)).toBeNull();
  });

  it('renders all seven category scores', () => {
    renderReport(makeSession());
    for (const label of [
      'Opening & Confidence', 'Discovery Questions', 'Problem Identification',
      'Value Articulation', 'Clarity & Conciseness', 'Closing & Next Step',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe('FinalReport — objections', () => {
  it('states no objection was raised when there were none', () => {
    renderReport(makeSession());
    expect(screen.getByText(/never raised an objection/i)).toBeInTheDocument();
    expect(screen.getByText('Not applicable')).toBeInTheDocument();
  });

  it('renders objection analysis only for objections actually raised', () => {
    const session = makeSession({
      objectionsRaised: ['generic_chatbot' as ObjectionKey],
      finalReport: {
        ...makeSession().finalReport,
        objection_results: [
          { objection: OBJECTIONS.generic_chatbot, handled: true, explanation: 'Handled well.' },
        ],
      },
    });
    renderReport(session);
    expect(screen.getByText(OBJECTIONS.generic_chatbot)).toBeInTheDocument();
    expect(screen.getByText('Handled')).toBeInTheDocument();
    expect(screen.queryByText(OBJECTIONS.adoption)).toBeNull();
  });
});

describe('FinalReport — content & transcript', () => {
  it('renders strengths, missed opportunities, practice and summary', () => {
    renderReport(makeSession());
    expect(screen.getByText('Explored the process.')).toBeInTheDocument();
    expect(screen.getByText('No next step.')).toBeInTheDocument();
    expect(screen.getByText('Practice closing with a specific next step.')).toBeInTheDocument();
    expect(screen.getByText('Good discovery, weak close.')).toBeInTheDocument();
  });

  it('shows an expandable full transcript', () => {
    renderReport(makeSession());
    expect(screen.getByText(/Show the 2-message transcript/i)).toBeInTheDocument();
    expect(screen.getByText('Hi, this is Rohan.')).toBeInTheDocument();
  });

  it('says there is not enough evidence when a weakest statement is absent', () => {
    renderReport(makeSession());
    expect(screen.getByText(/Not enough evidence in this call/i)).toBeInTheDocument();
  });

  it('warns about limited evidence on very short calls', () => {
    renderReport(makeSession({ sellerTurnCount: 1 }));
    expect(screen.getByText(/Limited evidence/i)).toBeInTheDocument();
  });

  it('surfaces fallback warnings when the evaluator fell back', () => {
    renderReport(makeSession({ fallbackWarnings: ['The final evaluation was unavailable.'] }));
    expect(screen.getByText(/Evaluation notices/i)).toBeInTheDocument();
    expect(screen.getByText(/final evaluation was unavailable/i)).toBeInTheDocument();
  });

  it('renders session metadata and honest AI/Demo mode labels', () => {
    renderReport(makeSession());
    expect(screen.getByText('sess-1')).toBeInTheDocument();
    // Deterministic run must not be labelled as AI.
    expect(screen.getAllByText('Deterministic (Demo)').length).toBe(3);
    expect(screen.queryByText('AI (active)')).toBeNull();
  });

  it('labels a live-AI run as AI and a partial fallback as mixed', () => {
    renderReport(
      makeSession({
        providerModes: { customer: 'ai', turnEvaluator: 'mixed', finalReport: 'ai' },
      }),
    );
    expect(screen.getAllByText('AI (active)').length).toBe(2);
    expect(screen.getByText(/Mixed — AI with deterministic fallback/)).toBeInTheDocument();
  });

  it('shows an empty state when there is no session', () => {
    renderReport(null);
    expect(screen.getByText(/No report yet/i)).toBeInTheDocument();
  });
});

describe('FinalReport — coaching integrity', () => {
  it('renders an honest empty state when there are no strengths', () => {
    renderReport(makeSession({ finalReport: { ...makeSession().finalReport, strengths: [] } }));
    expect(
      screen.getByText(/No clear strengths could be established from this call/i),
    ).toBeInTheDocument();
  });

  it('does not score a zero-turn call and suppresses the headline number', () => {
    renderReport(
      makeSession({
        sellerTurnCount: 0,
        scoreHistory: [],
        finalReport: { ...makeSession().finalReport, strengths: [] },
      }),
    );
    expect(screen.getByText(/no seller turns were recorded/i)).toBeInTheDocument();
    // The Final Score tile shows a dash, not a fabricated number.
    const tile = screen.getByText('Final Score').parentElement as HTMLElement;
    expect(within(tile).getByText('—')).toBeInTheDocument();
    expect(within(tile).queryByText('58')).toBeNull();
  });

  it('qualifies a thin call as limited evidence', () => {
    renderReport(makeSession({ sellerTurnCount: 1 }));
    expect(screen.getByText(/Limited evidence/i)).toBeInTheDocument();
  });
});

describe('FinalReport — save failure', () => {
  it('shows a non-blocking save warning and still renders the report', () => {
    render(
      <FinalReport
        session={makeSession()}
        saveWarning="This session could not be saved to local storage (it may be full)."
        onReplay={vi.fn()}
        onBriefing={vi.fn()}
        onHistory={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText(/could not be saved to local storage/i)).toBeInTheDocument();
    // The report itself is still fully visible — the score is not hidden.
    expect(tileValue('Final Score')).toBe('58');
    expect(screen.getByText('Good discovery, weak close.')).toBeInTheDocument();
  });

  it('does not claim a save warning when the save succeeded', () => {
    renderReport(makeSession());
    expect(screen.queryByText(/could not be saved/i)).toBeNull();
  });
});
