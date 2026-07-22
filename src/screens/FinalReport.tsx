import { Card, StatTile, ScoreBar, Badge } from '../components/ui';
import type { SalesStage } from '../types';
import type { DemoReport } from '../conversation/report';

const STAGE_LABEL: Record<SalesStage, string> = {
  opening: 'Opening',
  discovery: 'Discovery',
  impact: 'Impact',
  value_mapping: 'Value Mapping',
  objection_handling: 'Objection Handling',
  next_step: 'Next Step',
};

const CATEGORY_ROWS = [
  ['Discovery', 'discovery'],
  ['Relevance', 'relevance'],
  ['Clarity', 'clarity'],
  ['Listening', 'listening'],
  ['Objection Handling', 'objectionHandling'],
  ['Progression', 'progression'],
] as const;

export function FinalReport({
  report,
  onReplay,
  onHistory,
  onStart,
}: {
  report: DemoReport | null;
  onReplay: () => void;
  onHistory: () => void;
  onStart: () => void;
}) {
  if (!report) {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-accent-soft">
              Coaching Report
            </span>
            <Badge tone="warn">Placeholder · real evaluator in Phase 4</Badge>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">Call Summary</h1>
          <p className="mt-1 text-sm text-ink-400">
            Reached stage: {STAGE_LABEL[report.stageReached]}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onHistory}>
            View History
          </button>
          <button type="button" className="btn-primary" onClick={onReplay}>
            Practice Again
          </button>
        </div>
      </div>

      {/* Headline scores */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Overall Final" value={report.overallFinal} hint="blended score" />
        <StatTile label="Live Average" value={report.liveAverage} hint="across the call" />
        <StatTile label="Transcript Eval" value={report.transcriptEval} hint="post-call review" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Category Scores" className="lg:col-span-1">
          <div className="space-y-3">
            {CATEGORY_ROWS.map(([label, key]) => (
              <ScoreBar key={key} label={label} value={report.categoryScores[key]} />
            ))}
          </div>
        </Card>

        <Card title="Strengths" className="lg:col-span-1">
          <ul className="space-y-2 text-sm text-ink-200">
            {report.strengths.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className="mt-1 text-good">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Missed Opportunities" className="lg:col-span-1">
          <ul className="space-y-2 text-sm text-ink-200">
            {report.missedOpportunities.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className="mt-1 text-warn">!</span>
                {t}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Key Moments" className="lg:col-span-2">
          <div className="space-y-3 text-sm">
            <Moment tone="good" label="Strongest statement" text={report.strongestStatement} />
            <Moment tone="bad" label="Weakest statement" text={report.weakestStatement} />
            <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
              <div className="text-xs uppercase tracking-wide text-ink-400">
                Better response
              </div>
              <p className="mt-1 text-ink-100">{report.betterResponse}</p>
            </div>
          </div>
        </Card>

        <Card title="Objections Encountered" className="lg:col-span-1">
          {report.objections.length === 0 ? (
            <p className="text-sm text-ink-400">No objections were raised.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {report.objections.map((o) => (
                <li key={o.key} className="flex items-center justify-between gap-2">
                  <span className="text-ink-200 capitalize">
                    {o.key.replace(/_/g, ' ')}
                  </span>
                  {o.handled ? (
                    <Badge tone="good">Handled</Badge>
                  ) : (
                    <Badge tone="bad">Missed</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recommended Practice" className="lg:col-span-3">
          <p className="text-sm text-ink-200">{report.recommendedPractice}</p>
          <div className="mt-3 rounded-lg border border-white/5 bg-navy-900/60 p-3 text-sm text-ink-300">
            <span className="text-ink-400">Coaching summary: </span>
            {report.coachingSummary}
          </div>
        </Card>
      </div>
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
  text: string | null;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === 'good' ? 'border-good/20 bg-good/5' : 'border-bad/20 bg-bad/5'
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <p className="mt-1 text-ink-100">{text ? `“${text}”` : '—'}</p>
    </div>
  );
}
