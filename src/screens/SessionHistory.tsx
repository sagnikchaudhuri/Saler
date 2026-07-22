import { Card, Badge } from '../components/ui';

// Static placeholder rows for the Phase 1 shell.
// Real rows are read from localStorage in Phase 4.
const SAMPLE_SESSIONS = [
  { id: 's3', date: 'Today · 14:20', score: 61, demo: true, stage: 'Next step' },
  { id: 's2', date: 'Today · 11:05', score: 48, demo: true, stage: 'Objection' },
  { id: 's1', date: 'Yesterday · 17:40', score: 39, demo: true, stage: 'Discovery' },
];

export function SessionHistory({ onOpen }: { onOpen: () => void }) {
  const hasSessions = SAMPLE_SESSIONS.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-accent-soft">
          Session History
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-100">
          Your Practice Log
        </h1>
        <p className="mt-1 text-sm text-ink-300">
          Sessions are stored locally in your browser. Nothing leaves this
          device.
        </p>
      </div>

      {hasSessions ? (
        <Card>
          <ul className="divide-y divide-white/5">
            {SAMPLE_SESSIONS.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/5 text-sm font-semibold text-ink-100">
                    {s.score}
                  </div>
                  <div>
                    <div className="text-sm text-ink-100">{s.date}</div>
                    <div className="text-xs text-ink-400">
                      Reached: {s.stage}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {s.demo && <Badge tone="warn">Demo</Badge>}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={onOpen}
                  >
                    Open
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <div className="grid place-items-center gap-2 py-10 text-center">
            <div className="text-3xl" aria-hidden>
              🗂️
            </div>
            <p className="text-sm text-ink-300">
              No sessions yet. Complete a call to see it here.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
