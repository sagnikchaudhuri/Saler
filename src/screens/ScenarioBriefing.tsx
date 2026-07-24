import { SALES_SCENARIO } from '../data/scenario';

/** The six live dimensions the deterministic engine actually scores. */
const SKILLS = [
  'Discovery',
  'Relevance',
  'Clarity',
  'Listening',
  'Objection handling',
  'Progression',
];

export function ScenarioBriefing({
  onStart,
  speechSupported = false,
  voiceProviderName,
  customerLabel = 'Demo customer',
}: {
  onStart: () => void;
  /** Existing capability state, surfaced for readiness — not re-probed here. */
  speechSupported?: boolean;
  voiceProviderName?: string;
  /**
   * Honest customer status. A configured key is NOT evidence the model
   * answered, so this never claims live AI before a successful response.
   */
  customerLabel?: string;
}) {
  const s = SALES_SCENARIO;

  return (
    <div className="mx-auto max-w-3xl animate-rise-in">
      <p className="eyebrow">Scenario</p>

      {/* Lead with the person, not a grid of cards. */}
      <h1 className="display mt-4 text-5xl leading-[1.05] sm:text-6xl">
        {s.customer.name}
      </h1>
      <p className="mt-3 text-lg text-ink-secondary">
        {s.customer.role} · {s.customer.companyType}
      </p>
      <p className="mt-1 text-sm text-ink-muted">{s.customer.teamSize}</p>

      <div className="mt-8 flex flex-wrap gap-2">
        {s.customer.personality.map((trait) => (
          <span key={trait} className="chip">
            {trait}
          </span>
        ))}
      </div>

      {/* The situation, told as prose rather than tiles. */}
      <div className="mt-12 border-t border-line pt-8">
        <h2 className="text-sm font-semibold text-ink">The situation</h2>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-secondary">
          {s.mainProblem} Today the team relies on{' '}
          {s.currentProcess.map((p) => p.toLowerCase()).join(', ')}.
        </p>
      </div>

      <div className="mt-10 border-t border-line pt-8">
        <h2 className="text-sm font-semibold text-ink">Your objective</h2>
        <p className="mt-3 max-w-2xl text-lg leading-relaxed text-ink-secondary">
          {s.sellerObjective}
        </p>
      </div>

      <div className="mt-10 grid gap-8 border-t border-line pt-8 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Skills assessed</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-secondary">
            {SKILLS.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-ink">Before you start</h2>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-secondary">Typical session</dt>
              <dd className="text-ink">5–10 minutes</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-secondary">Customer</dt>
              <dd className="text-ink">{customerLabel}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-secondary">Voice input</dt>
              <dd className="text-ink">
                {speechSupported ? 'Available' : 'Typing only'}
              </dd>
            </div>
            {voiceProviderName && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-secondary">Voice output</dt>
                <dd className="text-ink">{voiceProviderName}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-ink-muted">
            Guidance only — sessions are not timed. You can always type instead
            of speaking.
          </p>
        </div>
      </div>

      {/* One unmistakable action. */}
      <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-line pt-8">
        <button type="button" className="btn-primary px-6 py-3 text-base" onClick={onStart}>
          Start roleplay
        </button>
        <p className="text-sm text-ink-muted">
          Rohan won&rsquo;t make this easy. He&rsquo;s sceptical of vague claims.
        </p>
      </div>

      {/* Objections stay as a quiet aside — they should not be a checklist. */}
      <details className="mt-10 border-t border-line pt-6">
        <summary className="cursor-pointer text-sm font-medium text-ink-secondary hover:text-ink">
          What he might push back on
        </summary>
        <ul className="mt-4 space-y-2 text-sm text-ink-secondary">
          {s.possibleObjections.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-muted">
          These surface naturally during the conversation — never all at once.
        </p>
      </details>

      <p className="mt-10 text-xs text-ink-muted">No real customer data is used.</p>
    </div>
  );
}
