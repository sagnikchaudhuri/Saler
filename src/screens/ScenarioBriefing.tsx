import { SALES_SCENARIO } from '../data/scenario';
import { Card, Badge } from '../components/ui';

export function ScenarioBriefing({ onStart }: { onStart: () => void }) {
  const s = SALES_SCENARIO;
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent-soft">
            Scenario Briefing
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">
            Sell to {s.customer.name}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-300">
            You are selling <span className="text-ink-100">{s.product}</span>.
            Read the briefing, then start the call.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={onStart}>
          Start Call →
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="The Customer" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <Row label="Name" value={s.customer.name} />
            <Row label="Role" value={s.customer.role} />
            <Row label="Company" value={s.customer.companyType} />
            <Row label="Team size" value={s.customer.teamSize} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {s.customer.personality.map((p) => (
              <Badge key={p}>{p}</Badge>
            ))}
          </div>
        </Card>

        <Card title="The Situation" className="lg:col-span-2">
          <p className="text-sm text-ink-200">
            <span className="font-medium text-ink-100">Main problem: </span>
            {s.mainProblem}
          </p>
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-ink-400">
              Current training process
            </div>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-ink-200">
              {s.currentProcess.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="Your Objective" className="lg:col-span-2">
          <p className="text-sm text-ink-200">{s.sellerObjective}</p>
          <ol className="mt-3 grid gap-2 text-sm text-ink-300 sm:grid-cols-2">
            {[
              'Discover the business problem',
              'Quantify its impact',
              'Connect the solution to the problem',
              'Address objections',
              'Earn agreement for a demo',
            ].map((step, i) => (
              <li key={step} className="flex items-start gap-2">
                <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-accent/15 text-[11px] text-accent-soft">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Objections to Expect" className="lg:col-span-1">
          <ul className="space-y-2 text-sm text-ink-300">
            {s.possibleObjections.map((o) => (
              <li key={o} className="flex items-start gap-2">
                <span aria-hidden className="mt-1 text-accent-soft">•</span>
                {o}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-400">
            The customer won't raise all of these at once — they surface
            naturally as the conversation develops.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-400">{label}</dt>
      <dd className="text-right text-ink-100">{value}</dd>
    </div>
  );
}
