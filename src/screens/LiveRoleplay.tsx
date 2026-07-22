import { SALES_SCENARIO, INITIAL_SCORES } from '../data/scenario';
import { Card, ScoreBar, Badge, StatTile } from '../components/ui';
import type { TranscriptTurn } from '../types';

// Static placeholder transcript for the Phase 1 shell.
// Real turns arrive from the conversation engine in Phase 2.
const SAMPLE_TRANSCRIPT: TranscriptTurn[] = [
  {
    id: 't1',
    speaker: 'customer',
    text: "Hi, this is Rohan. I've got about ten minutes — what's this about?",
    timestamp: 0,
  },
  {
    id: 't2',
    speaker: 'seller',
    text: 'Thanks for making the time. Before I pitch anything — how do you currently ramp up your new reps?',
    timestamp: 0,
  },
  {
    id: 't3',
    speaker: 'customer',
    text: 'Mostly manager-led mock calls and reviewing recorded calls. It works, but it eats up manager time.',
    timestamp: 0,
  },
];

const METRICS: { key: keyof typeof INITIAL_SCORES; label: string }[] = [
  { key: 'discovery', label: 'Discovery' },
  { key: 'relevance', label: 'Relevance' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'listening', label: 'Listening' },
  { key: 'objectionHandling', label: 'Objection Handling' },
  { key: 'progression', label: 'Progression' },
];

export function LiveRoleplay({ onEndCall }: { onEndCall: () => void }) {
  const s = SALES_SCENARIO;
  const overall = 47; // placeholder overall score for the shell

  return (
    <div className="space-y-6">
      {/* Header row: identity + call controls */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-accent/15 text-lg text-accent-soft">
            {s.customer.name.charAt(0)}
          </div>
          <div>
            <div className="font-semibold text-ink-100">{s.customer.name}</div>
            <div className="text-xs text-ink-400">
              {s.customer.role} · {s.customer.companyType}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="good">● Live</Badge>
          <span className="tabular-nums text-sm text-ink-300">02:14</span>
          <button type="button" className="btn-danger" onClick={onEndCall}>
            End Call
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left / center: coaching + transcript */}
        <div className="space-y-6 lg:col-span-2">
          {/* Live coaching strip */}
          <Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile label="Overall" value={overall} hint="live score" />
              <StatTile label="Stage" value="Discovery" />
              <StatTile label="Momentum" value="Stable" />
            </div>
            <div className="mt-4 space-y-2">
              <div className="rounded-lg border border-white/5 bg-navy-900/60 p-3 text-sm">
                <span className="text-ink-400">Coaching: </span>
                <span className="text-ink-100">
                  Good open question — now dig into the cost of slow ramp-up.
                </span>
              </div>
              <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-sm">
                <span className="text-ink-400">Next move: </span>
                <span className="text-ink-100">
                  Ask how long a new rep takes to hit quota today.
                </span>
              </div>
            </div>
          </Card>

          {/* Transcript */}
          <Card title="Transcript">
            <div className="space-y-3">
              {SAMPLE_TRANSCRIPT.map((turn) => (
                <TranscriptBubble key={turn.id} turn={turn} />
              ))}
            </div>

            {/* Input controls (non-functional in the Phase 1 shell) */}
            <div className="mt-4 border-t border-white/5 pt-4">
              <div className="flex items-center gap-2">
                <button type="button" className="btn-ghost" disabled>
                  🎙 Speak
                </button>
                <button type="button" className="btn-ghost" disabled>
                  ⏹ Stop Speaking
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="text"
                  disabled
                  placeholder="Type your response… (enabled in Phase 2)"
                  className="flex-1 rounded-lg border border-white/10 bg-navy-900/60 px-3 py-2 text-sm text-ink-200 placeholder:text-ink-400"
                />
                <button type="button" className="btn-primary" disabled>
                  Send
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* Right rail: metric breakdown */}
        <div className="space-y-6">
          <Card title="Metric Breakdown">
            <div className="space-y-3">
              {METRICS.map((m) => (
                <ScoreBar
                  key={m.key}
                  label={m.label}
                  value={INITIAL_SCORES[m.key]}
                />
              ))}
            </div>
          </Card>

          <Card title="Score Progression">
            <div className="grid h-28 place-items-center rounded-lg border border-dashed border-white/10 text-xs text-ink-400">
              Live chart appears in Phase 3
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TranscriptBubble({ turn }: { turn: TranscriptTurn }) {
  const isSeller = turn.speaker === 'seller';
  return (
    <div className={`flex ${isSeller ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isSeller
            ? 'rounded-br-sm bg-accent/15 text-ink-100'
            : 'rounded-bl-sm bg-white/5 text-ink-200'
        }`}
      >
        <div className="mb-0.5 text-[11px] uppercase tracking-wide text-ink-400">
          {isSeller ? 'You' : SALES_SCENARIO.customer.name}
        </div>
        {turn.text}
      </div>
    </div>
  );
}
