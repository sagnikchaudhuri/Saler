import type { Momentum } from '../types';

// ============================================================================
// A single vertical "conversation health" indicator, replacing six equally
// loud progress bars. The marker sits where the live score sits; momentum is
// stated in words as well as direction, so meaning never depends on colour.
// Purely presentational — it reads existing state and computes nothing.
// ============================================================================

const MOMENTUM_MARK: Record<Momentum, { arrow: string; tone: string }> = {
  Improving: { arrow: '↑', tone: 'text-positive' },
  Stable: { arrow: '→', tone: 'text-ink-secondary' },
  Declining: { arrow: '↓', tone: 'text-caution' },
};

export function ConversationHealth({
  score,
  momentum,
  stage,
}: {
  score: number;
  momentum: Momentum;
  stage: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const mark = MOMENTUM_MARK[momentum];

  return (
    <div className="flex items-stretch gap-4">
      {/* The track is decorative: the score and momentum are already stated in
          text beside it, so announcing it again would just be noise. */}
      <div className="relative w-[3px] shrink-0 rounded-full bg-line" aria-hidden>
        <div
          className="absolute inset-x-0 bottom-0 rounded-full bg-accent/25 transition-[height] duration-700 ease-out"
          style={{ height: `${clamped}%` }}
        />
        <div
          className="absolute -left-[3px] h-[9px] w-[9px] rounded-full border-2 border-canvas bg-accent transition-[bottom] duration-700 ease-out"
          style={{ bottom: `calc(${clamped}% - 4px)` }}
        />
      </div>

      <div className="min-w-0">
        <div className="eyebrow">Conversation health</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="numeric text-3xl font-semibold tracking-editorial text-ink">
            {Math.round(clamped)}
          </span>
          <span className={`text-sm ${mark.tone}`}>
            <span aria-hidden>{mark.arrow}</span> {momentum}
          </span>
        </div>
        <div className="mt-1 truncate text-sm text-ink-secondary">{stage}</div>
      </div>
    </div>
  );
}
