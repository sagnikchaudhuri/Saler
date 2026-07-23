import { Card, StatTile, ScoreBar, Badge } from '../components/ui';
import { ScoreTrend } from '../components/ScoreTrend';
import type { SalesStage, TranscriptTurn } from '../types';
import type { StoredSession } from '../persistence/types';
import type { FinalCategoryScores } from '../final/types';
import { buildComparison, LIVE_VS_FINAL_NOTE } from '../final/narrative';
import { SALES_SCENARIO } from '../data/scenario';

const STAGE_LABEL: Record<SalesStage, string> = {
  opening: 'Opening',
  discovery: 'Discovery',
  impact: 'Impact',
  value_mapping: 'Value Mapping',
  objection_handling: 'Objection Handling',
  next_step: 'Next Step',
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
}: {
  session: StoredSession | null;
  onReplay: () => void;
  onBriefing: () => void;
  onHistory: () => void;
  onStart: () => void;
}) {
  if (!session) {
    return (
      <Card>
        <div className="grid place-items-center gap-3 py-12 text-center">
          <div className="text-3xl" aria-hidden>📊</div>
          <p className="text-sm text-ink-300">
            No report yet. Complete a call to see your coaching summary.
          </p>
          <button type="button" className="btn-primary" onClick={onStart}>
            Start a Call
          </button>
        </div>
      </Card>
    );
  }

  const r = session.finalReport;
  const diff = r.overall_score - session.liveAverage;
  const diffLabel = diff > 0 ? `+${diff}` : String(diff);
  const diffTone = diff > 0 ? 'good' : diff < 0 ? 'bad' : 'neutral';
  const objectionRaised = session.objectionsRaised.length > 0;
  const limitedEvidence = session.sellerTurnCount <= 2;
  const trend = session.scoreHistory.map((h) => h.visibleOverall);

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-accent-soft">
              Coaching Report
            </span>
            {session.demoMode && <Badge tone="warn">Demo Mode</Badge>}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">Call Summary</h1>
          <p className="mt-1 text-sm text-ink-400">
            {new Date(session.date).toLocaleString()} · {formatDuration(session.durationMs)} ·{' '}
            {session.sellerTurnCount} seller turn{session.sellerTurnCount === 1 ? '' : 's'} ·
            reached {STAGE_LABEL[session.finalStage]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={onBriefing}>
            Back to Briefing
          </button>
          <button type="button" className="btn-ghost" onClick={onHistory}>
            Session History
          </button>
          <button type="button" className="btn-primary" onClick={onReplay}>
            Try Again
          </button>
        </div>
      </div>

      {limitedEvidence && (
        <div role="status" className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
          Limited evidence: this call had {session.sellerTurnCount} seller turn
          {session.sellerTurnCount === 1 ? '' : 's'}, so these findings are
          indicative rather than conclusive.
        </div>
      )}

      {session.fallbackWarnings.length > 0 && (
        <div role="status" className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
          <div className="font-medium">Evaluation notices</div>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
            {session.fallbackWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Headline scores */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Final Score" value={r.overall_score} hint="whole conversation" />
        <StatTile label="Live Average" value={session.liveAverage} hint="turn by turn" />
        <StatTile
          label="Difference"
          value={
            <span className={diffTone === 'good' ? 'text-good' : diffTone === 'bad' ? 'text-bad' : 'text-ink-200'}>
              {diffLabel}
            </span>
          }
          hint="final vs live"
        />
      </div>

      {/* Live vs final explanation */}
      <Card title="Live vs Final Scoring">
        <p className="text-sm text-ink-100">{buildComparison(session.liveAverage, r.overall_score)}</p>
        <p className="mt-2 text-xs text-ink-400">{LIVE_VS_FINAL_NOTE}</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Category Scores" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {CATEGORY_LABELS.map(([key, label]) => {
              if (key === 'objection_handling' && !objectionRaised) {
                return (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-ink-300">{label}</span>
                    <Badge>Not applicable</Badge>
                  </div>
                );
              }
              return <ScoreBar key={key} label={label} value={r.category_scores[key]} />;
            })}
          </div>
          {!objectionRaised && (
            <p className="mt-3 text-[11px] text-ink-400">
              No objection was raised, so Objection Handling is excluded from the
              final score rather than counted against you.
            </p>
          )}
        </Card>

        <Card title="Score Progression" className="lg:col-span-1">
          <ScoreTrend values={trend} />
        </Card>

        <Card title="Strengths" className="lg:col-span-1">
          <ul className="space-y-2 text-sm text-ink-200">
            {r.strengths.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className="mt-1 text-good">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Missed Opportunities" className="lg:col-span-1">
          <ul className="space-y-2 text-sm text-ink-200">
            {r.missed_opportunities.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className="mt-1 text-warn">!</span>
                {t}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Recommended Practice" className="lg:col-span-1">
          <p className="text-sm text-ink-100">{r.recommended_practice}</p>
        </Card>

        <Card title="Key Moments" className="lg:col-span-2">
          <div className="space-y-3 text-sm">
            <Moment tone="good" label="Strongest statement" text={r.strongest_statement} />
            <Moment tone="bad" label="Weakest statement" text={r.weakest_statement} />
            <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
              <div className="text-xs uppercase tracking-wide text-ink-400">
                A stronger alternative
              </div>
              <p className="mt-1 text-ink-100">{r.better_response}</p>
            </div>
          </div>
        </Card>

        <Card title="Objection Analysis" className="lg:col-span-1">
          {r.objection_results.length === 0 ? (
            <p className="text-sm text-ink-400">
              Rohan never raised an objection in this call.
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {r.objection_results.map((o, i) => (
                <li key={i} className="rounded-lg border border-white/5 bg-navy-900/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-ink-100">{o.objection}</span>
                    {o.handled ? <Badge tone="good">Handled</Badge> : <Badge tone="bad">Not handled</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-400">{o.explanation}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Missed Discovery Questions" className="lg:col-span-3">
          {r.missed_discovery_questions.length === 0 ? (
            <p className="text-sm text-ink-300">
              Strong coverage — no major discovery areas were missed.
            </p>
          ) : (
            <ul className="grid gap-2 text-sm text-ink-200 sm:grid-cols-2">
              {r.missed_discovery_questions.map((q, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1 text-accent-soft">?</span>
                  {q}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Summary" className="lg:col-span-3">
          <p className="text-sm text-ink-100">{r.summary}</p>
        </Card>

        {/* Collapsible transcript */}
        <Card title="Full Transcript" className="lg:col-span-3">
          <details>
            <summary className="cursor-pointer text-xs text-ink-400 marker:text-ink-400">
              Show the {session.transcript.length}-message transcript
            </summary>
            <div className="mt-3 space-y-2">
              {session.transcript.map((t) => (
                <TranscriptLine key={t.id} turn={t} />
              ))}
            </div>
          </details>
        </Card>

        {/* Session metadata / provider status */}
        <Card title="Session Details" className="lg:col-span-3">
          <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <Meta label="Scenario" value={session.scenarioId} />
            <Meta label="Session ID" value={session.id} />
            <Meta label="Schema version" value={String(session.schemaVersion)} />
            <Meta label="Customer model" value={session.providerNames.conversation} />
            <Meta label="Live evaluator" value={session.providerNames.realtimeEvaluator} />
            <Meta label="Final evaluator" value={session.providerNames.finalEvaluator} />
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 rounded-lg border border-white/5 bg-navy-900/60 px-3 py-2">
      <dt className="text-ink-400">{label}</dt>
      <dd className="truncate text-right text-ink-200" title={value}>{value}</dd>
    </div>
  );
}

function Moment({
  tone,
  label,
  text,
}: {
  tone: 'good' | 'bad';
  label: string;
  text: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === 'good' ? 'border-good/20 bg-good/5' : 'border-bad/20 bg-bad/5'
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <p className="mt-1 text-ink-100">
        {text ? `“${text}”` : 'Not enough evidence in this call.'}
      </p>
    </div>
  );
}

function TranscriptLine({ turn }: { turn: TranscriptTurn }) {
  const isSeller = turn.speaker === 'seller';
  return (
    <div className={`flex ${isSeller ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
          isSeller ? 'rounded-br-sm bg-accent/15 text-ink-100' : 'rounded-bl-sm bg-white/5 text-ink-200'
        }`}
      >
        <div className="mb-0.5 text-[11px] uppercase tracking-wide text-ink-400">
          {isSeller ? 'You' : SALES_SCENARIO.customer.name}
        </div>
        {turn.message}
      </div>
    </div>
  );
}
