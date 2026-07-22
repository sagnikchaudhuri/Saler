import type { ReactNode } from 'react';

/** A titled content card. */
export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h3 className="text-sm font-semibold tracking-wide text-ink-100">
              {title}
            </h3>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** A single labelled statistic tile. */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-navy-900/60 p-4">
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink-100">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

/** A labelled 0–100 score bar. */
export function ScoreBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone =
    clamped >= 66 ? 'bg-good' : clamped >= 40 ? 'bg-warn' : 'bg-bad';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-ink-300">{label}</span>
        <span className="tabular-nums text-ink-200">{Math.round(clamped)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/** A small status pill. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
}) {
  const tones: Record<string, string> = {
    neutral: 'border-white/10 bg-white/5 text-ink-300',
    good: 'border-good/30 bg-good/10 text-good',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    bad: 'border-bad/30 bg-bad/10 text-bad',
    accent: 'border-accent/30 bg-accent/10 text-accent-soft',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
