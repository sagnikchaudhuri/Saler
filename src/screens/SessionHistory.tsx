import { useState } from 'react';
import { Card, Badge } from '../components/ui';
import { useSessions } from '../hooks/useSessions';
import type { StoredSession } from '../persistence/types';
import type { SalesStage } from '../types';

const STAGE_LABEL: Record<SalesStage, string> = {
  opening: 'Opening',
  discovery: 'Discovery',
  impact: 'Impact',
  value_mapping: 'Value Mapping',
  objection_handling: 'Objection Handling',
  next_step: 'Next Step',
};

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
  onOpen: (session: StoredSession) => void;
  onStart: () => void;
  recoveryWarning: string | null;
}) {
  const { sessions, remove, clearAll } = useSessions();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="text-xs uppercase tracking-widest text-accent-soft">
            Session History
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-ink-100">Your Practice Log</h1>
          <p className="mt-1 text-sm text-ink-300">
            Completed sessions are stored locally in this browser. Nothing leaves
            your device.
          </p>
        </div>
        {sessions.length > 0 && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setConfirmClear(true)}
          >
            Clear All
          </button>
        )}
      </div>

      {recoveryWarning && (
        <div role="status" className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
          ⚠ {recoveryWarning}
        </div>
      )}

      {confirmClear && (
        <Card>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-ink-100">
              Delete all {sessions.length} saved session
              {sessions.length === 1 ? '' : 's'}? This cannot be undone.
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
        </Card>
      )}

      {sessions.length === 0 ? (
        <Card>
          <div className="grid place-items-center gap-3 py-12 text-center">
            <div className="text-3xl" aria-hidden>🗂️</div>
            <p className="text-sm text-ink-300">
              No sessions yet. Complete a call and it will appear here.
            </p>
            <button type="button" className="btn-primary" onClick={onStart}>
              Start a Call
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-white/5">
            {sessions.map((s) => {
              const result = resultLabel(s);
              const isConfirming = confirmDelete === s.id;
              return (
                <li key={s.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 flex-none place-items-center rounded-lg bg-white/5 text-base font-semibold text-ink-100">
                        {s.finalReport.overall_score}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-ink-100">
                          {new Date(s.date).toLocaleString()}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
                          <span>{formatDuration(s.durationMs)}</span>
                          <span>Live avg {s.liveAverage}</span>
                          <span>
                            {s.sellerTurnCount} turn{s.sellerTurnCount === 1 ? '' : 's'}
                          </span>
                          <span>Reached {STAGE_LABEL[s.finalStage]}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={result.tone}>{result.text}</Badge>
                      {s.demoMode && <Badge>Demo</Badge>}
                      <button type="button" className="btn-ghost" onClick={() => onOpen(s)}>
                        View Report
                      </button>
                      {!isConfirming ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          aria-label={`Delete session from ${new Date(s.date).toLocaleString()}`}
                          onClick={() => setConfirmDelete(s.id)}
                        >
                          Delete
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setConfirmDelete(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn-danger"
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
        </Card>
      )}
    </div>
  );
}
