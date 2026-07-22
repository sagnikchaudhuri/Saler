import { Card, StatTile, ScoreBar, Badge } from '../components/ui';
import { INITIAL_SCORES } from '../data/scenario';

// Static placeholder report for the Phase 1 shell.
// Real values are produced by the transcript evaluator in Phase 4.
export function FinalReport({
  onReplay,
  onHistory,
}: {
  onReplay: () => void;
  onHistory: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent-soft">
            Coaching Report
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">
            Call Summary
          </h1>
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
        <StatTile label="Overall Final" value="61" hint="blended score" />
        <StatTile label="Live Average" value="54" hint="across the call" />
        <StatTile label="Transcript Eval" value="68" hint="post-call review" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Category Scores" className="lg:col-span-1">
          <div className="space-y-3">
            {(
              [
                ['Discovery', 'discovery'],
                ['Relevance', 'relevance'],
                ['Clarity', 'clarity'],
                ['Listening', 'listening'],
                ['Objection Handling', 'objectionHandling'],
                ['Progression', 'progression'],
              ] as const
            ).map(([label, key]) => (
              <ScoreBar key={key} label={label} value={INITIAL_SCORES[key]} />
            ))}
          </div>
        </Card>

        <Card title="Strengths" className="lg:col-span-1">
          <ul className="space-y-2 text-sm text-ink-200">
            <li>Opened with a strong discovery question.</li>
            <li>Acknowledged the manager-time concern.</li>
            <li>Kept the conversation customer-led.</li>
          </ul>
        </Card>

        <Card title="Missed Opportunities" className="lg:col-span-1">
          <ul className="space-y-2 text-sm text-ink-200">
            <li>Did not quantify the cost of slow ramp-up.</li>
            <li>Skipped the decision-making process.</li>
            <li>No clear next step proposed.</li>
          </ul>
        </Card>

        <Card title="Key Moments" className="lg:col-span-2">
          <div className="space-y-3 text-sm">
            <Moment
              tone="good"
              label="Strongest statement"
              text="How do you currently ramp up your new reps?"
            />
            <Moment
              tone="bad"
              label="Weakest statement"
              text="Our platform is the best on the market, trust me."
            />
            <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
              <div className="text-xs uppercase tracking-wide text-ink-400">
                Better response
              </div>
              <p className="mt-1 text-ink-100">
                Instead of a broad claim, tie the value to their pain: “You
                mentioned mock calls eat manager time — reps can practise
                unlimited calls here without a manager present.”
              </p>
            </div>
          </div>
        </Card>

        <Card title="Objections Encountered" className="lg:col-span-1">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-ink-200">Already do mock calls</span>
              <Badge tone="good">Handled</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-ink-200">How is this different?</span>
              <Badge tone="bad">Missed</Badge>
            </li>
          </ul>
        </Card>

        <Card title="Recommended Practice" className="lg:col-span-3">
          <p className="text-sm text-ink-200">
            Run this scenario again and focus on <em>quantifying impact</em>:
            after the customer names a problem, always ask a follow-up that
            turns it into a number (hours, dollars, or ramp weeks).
          </p>
          <div className="mt-3 rounded-lg border border-white/5 bg-navy-900/60 p-3 text-sm text-ink-300">
            <span className="text-ink-400">Coaching summary: </span>
            Solid discovery instincts, weak on value-mapping and closing. Your
            next rep-out should end every problem statement with a
            quantification question and a proposed next step.
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
  text: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === 'good'
          ? 'border-good/20 bg-good/5'
          : 'border-bad/20 bg-bad/5'
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <p className="mt-1 text-ink-100">“{text}”</p>
    </div>
  );
}
