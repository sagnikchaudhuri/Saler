import type { ReactNode } from 'react';

/** A light content surface defined by a hairline, not a shadow. */
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
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h3 className="text-sm font-semibold text-ink">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** A quiet labelled figure. Numbers are tabular so they don't jitter. */
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
    <div>
      <div className="eyebrow">{label}</div>
      <div className="numeric mt-1.5 text-2xl font-semibold tracking-editorial text-ink">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

/**
 * A restrained 0–100 bar. Detail metrics are deliberately secondary to the
 * single conversation-health indicator, so these stay thin and monochrome
 * with the value carried in text.
 */
export function ScoreBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-secondary">{label}</span>
        <span className="numeric text-ink">{Math.round(clamped)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/** A small status pill. Tone is conveyed by label text as well as colour. */
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
}) {
  const tones: Record<string, string> = {
    neutral: 'border-line bg-canvas text-ink-secondary',
    good: 'border-positive/25 bg-positive/5 text-positive',
    warn: 'border-caution/25 bg-caution/5 text-caution',
    bad: 'border-critical/25 bg-critical/5 text-critical',
    accent: 'border-accent/25 bg-accent-wash text-accent',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Progressive disclosure for secondary detail. Keeps the report readable as a
 * narrative instead of a wall of panels.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-line py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-ink marker:content-['']">
        {summary}
        <span
          aria-hidden
          className="text-ink-muted transition-transform duration-200 group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}
