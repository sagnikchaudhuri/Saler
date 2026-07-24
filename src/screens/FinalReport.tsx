import { StatTile, ScoreBar, Badge, Disclosure } from '../components/ui';
import { ScoreTrend } from '../components/ScoreTrend';
import type { SalesStage, TranscriptTurn } from '../types';
import type { StoredSession } from '../persistence/types';
import type { FinalCategoryScores } from '../final/types';
import { buildComparison, LIVE_VS_FINAL_NOTE } from '../final/narrative';
import { evidenceLevel } from '../final/analyze';
import { SALES_SCENARIO } from '../data/scenario';

const STAGE_LABEL: Record<SalesStage, string> = {
  opening: 'Opening',
  discovery: 'Discovery',
  impact: 'Impact',
  value_mapping: 'Value Mapping',
  objection_handling: 'Objection Handling',
  next_step: 'Next Step',
};

/** Truthful labels: 'mixed' means some turns fell back mid-call. */
const MODE_LABEL: Record<string, string> = {
  ai: 'AI (active)',
  demo: 'Deterministic (Demo)',
  mixed: 'Mixed — AI with deterministic fallback',
  none: 'Not used',
};

const CATEGORY_LABELS: [keyof FinalCategoryScores, string][] = [
  ['opening_and_confidence', 'Opening & Confidence'],
  ['discovery_questions', 'Discovery Questions'],
  ['problem_identification', 'Problem Identification'],
  ['value_articulation', 'Value Articulation'],
  ['objection_handling', 'Objection Handling'],
  ['clarity_and_conciseness', 'Clarity & Conciseness'],
  ['closing_and_next_step', 'Closing & Next Step'],
];

function formatDuration(ms: number): string {
  const secs = Math.max(0, Math.round(ms / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function FinalReport({
  session,
  onReplay,
  onBriefing,
  onHistory,
  onStart,
  focusTranscript = false,
}: {
  session: StoredSession | null;
  onReplay: () => void;
  onBriefing: () => void;
  onHistory: () => void;
  onStart: () => void;
  /** Opened via "View Transcript" from a Report Log — expand it immediately. */
  focusTranscript?: boolean;
}) {
  if (!session) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="eyebrow">Report</p>
        <h1 className="display mt-4 text-3xl">No report yet</h1>
        <p className="mt-3 text-ink-secondary">
          Complete a call and your coaching summary will appear here.
        </p>
        <button type="button" className="btn-primary mt-8" onClick={onStart}>
          Start a Call
        </button>
      </div>
    );
  }

  const r = session.finalReport;
  const diff = r.overall_score - session.liveAverage;
  const diffLabel = diff > 0 ? `+${diff}` : String(diff);
  const objectionRaised = session.objectionsRaised.length > 0;
  // Minimum-evidence policy: a call with no substantive turns is not scored,
  // and a thin one is qualified rather than presented with false precision.
  const evidence = evidenceLevel(session.sellerTurnCount, session.scoreHistory);
  const notScored = evidence === 'none';
  const limitedEvidence = evidence === 'limited';
  const trend = session.scoreHistory.map((h) => h.visibleOverall);

  return (
    <article className="mx-auto max-w-3xl animate-rise-in">
      <p className="eyebrow">Session complete</p>

      {/* Lead with the coaching, not the numbers. */}
      <h1 className="display mt-4 text-3xl leading-snug sm:text-4xl">{r.summary}</h1>

      <p className="mt-5 text-sm text-ink-muted">
        {new Date(session.date).toLocaleString()} · {formatDuration(session.durationMs)} ·{' '}
        {session.sellerTurnCount} seller turn{session.sellerTurnCount === 1 ? '' : 's'} · reached{' '}
        {STAGE_LABEL[session.finalStage]}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {session.demoMode && <Badge>Demo Mode</Badge>}
      </div>

      {notScored && (
        <p role="status" className="mt-6 rounded-lg bg-caution/5 p-3 text-sm text-caution">
          Not scored: no seller turns were recorded, so there is no performance
          to measure. Start a call and speak with Rohan to get a full report.
        </p>
      )}

      {limitedEvidence && (
        <p role="status" className="mt-6 rounded-lg bg-caution/5 p-3 text-sm text-caution">
          Limited evidence: this call had {session.sellerTurnCount} seller turn
          {session.sellerTurnCount === 1 ? '' : 's'} with little substance, so
          these findings are indicative rather than conclusive.
        </p>
      )}

      {session.fallbackWarnings.length > 0 && (
        <div role="status" className="mt-4 rounded-lg bg-caution/5 p-3 text-sm text-caution">
          <div className="font-medium">Evaluation notices</div>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
            {session.fallbackWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Only now, the score. */}
      <div className="mt-10 grid grid-cols-3 gap-6 border-y border-line py-6">
        <StatTile
          label="Final Score"
          value={notScored ? '—' : r.overall_score}
          hint={notScored ? 'not scored' : 'whole conversation'}
        />
        <StatTile
          label="Live Average"
          value={notScored ? '—' : session.liveAverage}
          hint="turn by turn"
        />
        <StatTile label="Difference" value={notScored ? '—' : diffLabel} hint="final vs live" />
      </div>

      {/* The two moments that matter most. */}
      <section className="mt-10 space-y-8">
        <div>
          <h2 className="eyebrow text-positive">Strongest moment</h2>
          <Quote text={r.strongest_statement} />
        </div>
        <div>
          <h2 className="eyebrow text-caution">Biggest missed opportunity</h2>
          <Quote text={r.weakest_statement} />
          <div className="mt-4 rounded-lg bg-accent-wash p-4">
            <div className="eyebrow text-accent">A stronger alternative</div>
            <p className="mt-2 leading-relaxed text-ink">{r.better_response}</p>
          </div>
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-line p-5">
        <h2 className="text-sm font-semibold text-ink">Practise this next</h2>
        <p className="mt-2 leading-relaxed text-ink-secondary">{r.recommended_practice}</p>
      </section>

      {/* Everything below is available, but folded away by default. */}
      <div className="mt-10">
        <Disclosure summary="Live vs Final Scoring">
          <p className="text-sm leading-relaxed text-ink">
            {buildComparison(session.liveAverage, r.overall_score)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">{LIVE_VS_FINAL_NOTE}</p>
          <div className="mt-5">
            <div className="eyebrow mb-2">Score progression</div>
            <ScoreTrend values={trend} />
          </div>
        </Disclosure>

        <Disclosure summary="Category scores">
          <div className="grid gap-4 sm:grid-cols-2">
            {CATEGORY_LABELS.map(([key, label]) => {
              if (key === 'objection_handling' && !objectionRaised) {
                return (
                  <div key={key} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink-secondary">{label}</span>
                    <Badge>Not applicable</Badge>
                  </div>
                );
              }
              return <ScoreBar key={key} label={label} value={r.category_scores[key]} />;
            })}
          </div>
          {!objectionRaised && (
            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              No objection was raised, so Objection Handling is excluded from the
              final score rather than counted against you.
            </p>
          )}
        </Disclosure>

        <Disclosure summary="What worked, and what didn't">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <div className="eyebrow text-positive">Strengths</div>
              {r.strengths.length === 0 ? (
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  No clear strengths could be established from this call.
                </p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-secondary">
                  {r.strengths.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="eyebrow text-caution">Missed opportunities</div>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-secondary">
                {r.missed_opportunities.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </Disclosure>

        <Disclosure summary="Objection analysis">
          {r.objection_results.length === 0 ? (
            <p className="text-sm text-ink-secondary">
              Rohan never raised an objection in this call.
            </p>
          ) : (
            <ul className="space-y-4">
              {r.objection_results.map((o, i) => (
                <li key={i}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-ink">{o.objection}</span>
                    {o.handled ? (
                      <Badge tone="good">Handled</Badge>
                    ) : (
                      <Badge tone="bad">Not handled</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-ink-secondary">{o.explanation}</p>
                </li>
              ))}
            </ul>
          )}
        </Disclosure>

        <Disclosure summary="Discovery gaps">
          {r.missed_discovery_questions.length === 0 ? (
            <p className="text-sm text-ink-secondary">
              Strong coverage — no major discovery areas were missed.
            </p>
          ) : (
            <ul className="space-y-2 text-sm leading-relaxed text-ink-secondary">
              {r.missed_discovery_questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          )}
        </Disclosure>

        <Disclosure
          summary={`Show the ${session.transcript.length}-message transcript`}
          defaultOpen={focusTranscript}
        >
          <div className="space-y-5">
            {session.transcript.map((t) => (
              <TranscriptLine key={t.id} turn={t} />
            ))}
          </div>
        </Disclosure>

        <Disclosure summary="Session details">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Meta label="Scenario" value={session.scenarioId} />
            <Meta label="Session ID" value={session.id} />
            <Meta label="Customer" value={MODE_LABEL[session.providerModes?.customer ?? 'demo']} />
            <Meta
              label="Turn evaluation"
              value={MODE_LABEL[session.providerModes?.turnEvaluator ?? 'demo']}
            />
            <Meta
              label="Final review"
              value={MODE_LABEL[session.providerModes?.finalReport ?? 'demo']}
            />
            <Meta label="Schema version" value={String(session.schemaVersion)} />
          </dl>
        </Disclosure>
      </div>

      <div className="mt-12 flex flex-wrap gap-3 border-t border-line pt-8">
        <button type="button" className="btn-primary" onClick={onReplay}>
          Try Again
        </button>
        <button type="button" className="btn-ghost" onClick={onBriefing}>
          Back to Briefing
        </button>
        <button type="button" className="btn-ghost" onClick={onHistory}>
          Session History
        </button>
      </div>
    </article>
  );
}

function Quote({ text }: { text: string }) {
  if (!text) {
    return (
      <p className="mt-3 text-ink-muted">Not enough evidence in this call.</p>
    );
  }
  return (
    <blockquote className="mt-3 border-l-2 border-line pl-5 text-xl leading-relaxed text-ink">
      “{text}”
    </blockquote>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line pb-2">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="truncate text-right text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}

function TranscriptLine({ turn }: { turn: TranscriptTurn }) {
  const isSeller = turn.speaker === 'seller';
  return (
    <div>
      <div className={`eyebrow mb-1 ${isSeller ? 'text-accent' : 'text-ink-muted'}`}>
        {isSeller ? 'You' : SALES_SCENARIO.customer.name}
      </div>
      <p className={`leading-relaxed ${isSeller ? 'pl-4 text-ink-secondary' : 'text-ink'}`}>
        {turn.message}
      </p>
    </div>
  );
}
