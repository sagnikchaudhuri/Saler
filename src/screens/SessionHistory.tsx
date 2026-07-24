import { useState } from 'react';
import { Badge } from '../components/ui';
import { useSessions } from '../hooks/useSessions';
import type { StoredSession, CapabilityMode } from '../persistence/types';
import type { SalesStage } from '../types';

// ============================================================================
// REPORT LOGS — the call-log system behind the R letter.
//
// One entry per completed call, read straight from the persistence layer. The
// internal domain name (StoredSession / sessionRepository) is deliberately
// unchanged; only the user-facing language is "Report Log".
// ============================================================================

const STAGE_LABEL: Record<SalesStage, string> = {
  opening: 'Opening',
  discovery: 'Discovery',
  impact: 'Impact',
  value_mapping: 'Value Mapping',
  objection_handling: 'Objection Handling',
  next_step: 'Next Step',
};

/** Compact, honest provider label for a log row. */
const MODE_SHORT: Record<CapabilityMode, string> = {
  ai: 'AI',
  demo: 'Demo',
  mixed: 'Mixed',
  none: '—',
};

export type LogFocus = 'evaluation' | 'transcript';

function formatDuration(ms: number): string {
  const secs = Math.max(0, Math.round(ms / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Deterministic outcome label from the stored session. */
function resultLabel(s: StoredSession): { text: string; tone: 'good' | 'warn' | 'bad' } {
  if (s.finalStage === 'next_step') return { text: 'Demo secured', tone: 'good' };
  if (s.sellerTurnCount <= 2) return { text: 'Too short', tone: 'warn' };
  if (s.finalReport.overall_score >= 60) return { text: 'Solid attempt', tone: 'good' };
  if (s.finalReport.overall_score >= 45) return { text: 'Needs work', tone: 'warn' };
  return { text: 'Stalled', tone: 'bad' };
}

export function SessionHistory({
  onOpen,
  onStart,
  recoveryWarning,
}: {
  onOpen: (session: StoredSession, focus: LogFocus) => void;
  onStart: () => void;
  recoveryWarning: string | null;
}) {
  const { sessions, remove, clearAll } = useSessions();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="mx-auto max-w-3xl animate-rise-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Report Logs</p>
          <h1 className="display mt-3 text-4xl">Report Logs</h1>
          <p className="mt-3 text-ink-secondary">
            One log per completed call, stored locally in this browser. Nothing
            leaves your device.
          </p>
        </div>
        {sessions.length > 0 && (
          <button type="button" className="btn-quiet text-sm" onClick={() => setConfirmClear(true)}>
            Clear All Logs
          </button>
        )}
      </div>

      {recoveryWarning && (
        <p role="status" className="mt-6 rounded-lg bg-caution/5 p-3 text-sm text-caution">
          {recoveryWarning}
        </p>
      )}

      {confirmClear && (
        <div className="mt-6 flex flex-col justify-between gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center">
          <p className="text-sm text-ink">
            Delete all {sessions.length} log{sessions.length === 1 ? '' : 's'}? This
            cannot be undone.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                clearAll();
                setConfirmClear(false);
              }}
            >
              Delete All
            </button>
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="mt-16 border-t border-line pt-16 text-center">
          <p className="text-lg text-ink">No report logs yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-secondary">
            Complete a call and it will be logged here, with its transcript,
            score history and evaluation preserved.
          </p>
          <button type="button" className="btn-primary mt-8" onClick={onStart}>
            Start a Call
          </button>
        </div>
      ) : (
        <ul className="mt-10">
          {sessions.map((s) => {
            const result = resultLabel(s);
            const isConfirming = confirmDelete === s.id;
            const handled = s.addressedObjections.length;
            const raised = s.objectionsRaised.length;
            const fallbacks = s.fallbackWarnings.length;
            const modes = s.providerModes ?? {
              customer: 'demo' as CapabilityMode,
              turnEvaluator: 'demo' as CapabilityMode,
              finalReport: 'demo' as CapabilityMode,
            };

            return (
              <li key={s.id} className="border-t border-line py-6 last:border-b">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-baseline gap-5">
                    <span className="numeric text-2xl font-semibold tracking-editorial text-ink">
                      {s.finalReport.overall_score}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm text-ink">
                        {new Date(s.date).toLocaleString()}
                      </div>

                      {/* Call facts */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                        <span className="numeric">{formatDuration(s.durationMs)}</span>
                        <span className="numeric">Live avg {s.liveAverage}</span>
                        <span>
                          {s.sellerTurnCount} turn{s.sellerTurnCount === 1 ? '' : 's'}
                        </span>
                        <span>Reached {STAGE_LABEL[s.finalStage]}</span>
                        <span>{s.scenarioId}</span>
                      </div>

                      {/* Provider + reliability facts */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                        <span>
                          Customer {MODE_SHORT[modes.customer]} · Scoring{' '}
                          {MODE_SHORT[modes.turnEvaluator]} · Review{' '}
                          {MODE_SHORT[modes.finalReport]}
                        </span>
                        <span>
                          {fallbacks === 0
                            ? 'No fallbacks'
                            : `${fallbacks} fallback${fallbacks === 1 ? '' : 's'}`}
                        </span>
                        <span>
                          {raised === 0
                            ? 'No objections'
                            : `${raised} objection${raised === 1 ? '' : 's'} (${handled} handled)`}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone={result.tone}>{result.text}</Badge>
                        {s.demoMode && <Badge>Demo</Badge>}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className="btn-quiet text-sm"
                      onClick={() => onOpen(s, 'evaluation')}
                    >
                      View Evaluation
                    </button>
                    <button
                      type="button"
                      className="btn-quiet text-sm"
                      onClick={() => onOpen(s, 'transcript')}
                    >
                      View Transcript
                    </button>
                    {!isConfirming ? (
                      <button
                        type="button"
                        className="btn-quiet text-sm"
                        aria-label={`Delete log from ${new Date(s.date).toLocaleString()}`}
                        onClick={() => setConfirmDelete(s.id)}
                      >
                        Delete Log
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          className="btn-quiet text-sm"
                          onClick={() => setConfirmDelete(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-danger text-sm"
                          onClick={() => {
                            remove(s.id);
                            setConfirmDelete(null);
                          }}
                        >
                          Confirm Delete
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
