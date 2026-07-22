import { useEffect, useRef, useState } from 'react';
import { SALES_SCENARIO, INITIAL_SCORES } from '../data/scenario';
import { Card, ScoreBar, Badge, StatTile } from '../components/ui';
import type { TranscriptTurn, SalesStage } from '../types';
import type { ConversationEngineState } from '../conversation/engine';

const METRICS: { key: keyof typeof INITIAL_SCORES; label: string }[] = [
  { key: 'discovery', label: 'Discovery' },
  { key: 'relevance', label: 'Relevance' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'listening', label: 'Listening' },
  { key: 'objectionHandling', label: 'Objection Handling' },
  { key: 'progression', label: 'Progression' },
];

const STAGE_LABEL: Record<SalesStage, string> = {
  opening: 'Opening',
  discovery: 'Discovery',
  impact: 'Impact',
  value_mapping: 'Value Mapping',
  objection_handling: 'Objection Handling',
  next_step: 'Next Step',
};

export function LiveRoleplay({
  state,
  providerName,
  onSubmit,
  onRetry,
  onEndCall,
}: {
  state: ConversationEngineState;
  providerName: string;
  onSubmit: (text: string) => void;
  onRetry: () => void;
  onEndCall: () => void;
}) {
  const s = SALES_SCENARIO;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const isBusy = state.status === 'GeneratingReply' || state.status === 'Evaluating';
  const canSend = state.status === 'WaitingForSeller';

  // Auto-scroll the transcript to the newest turn.
  // (Guarded: jsdom/test environments don't implement Element.scrollTo.)
  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [state.transcript.length, isBusy]);

  const send = () => {
    if (!canSend) return;
    onSubmit(draft);
    setDraft('');
  };

  return (
    <div className="space-y-6">
      {/* Header: identity + call controls */}
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
          <CallStatus state={state} />
          <CallTimer startedAt={state.startedAt} running={state.status !== 'Completed'} />
          <button type="button" className="btn-danger" onClick={onEndCall}>
            End Call
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Live status strip */}
          <Card>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile label="Stage" value={STAGE_LABEL[state.stage]} />
              <StatTile
                label="Rapport"
                value={state.memory.receptiveness}
                hint="how warm Rohan is"
              />
              <StatTile label="Your turns" value={state.memory.sellerTurns} />
            </div>
            <p className="mt-3 text-xs text-ink-400">
              Live scoring, coaching, and next-move suggestions arrive in Phase 3.
              Provider: <span className="text-ink-300">{providerName}</span>
            </p>
          </Card>

          {/* Transcript */}
          <Card title="Transcript">
            <div ref={scrollRef} className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
              {state.transcript.length === 0 && (
                <p className="py-8 text-center text-sm text-ink-400">
                  The call hasn’t started yet.
                </p>
              )}
              {state.transcript.map((turn) => (
                <TranscriptBubble key={turn.id} turn={turn} />
              ))}
              {isBusy && <TypingBubble name={s.customer.name} />}
            </div>

            {/* System error (provider failure / invalid response) */}
            {state.status === 'Error' && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-bad/30 bg-bad/10 p-3 text-sm">
                <span className="text-bad">
                  {state.error ?? 'Something went wrong.'}
                </span>
                <button type="button" className="btn-ghost" onClick={onRetry}>
                  Retry
                </button>
              </div>
            )}

            {/* Input controls */}
            <div className="mt-4 border-t border-white/5 pt-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  disabled={!canSend}
                  aria-label="Your response"
                  placeholder={
                    canSend ? 'Type your response…' : 'Waiting for Rohan…'
                  }
                  className="flex-1 rounded-lg border border-white/10 bg-navy-900/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-400 disabled:opacity-60"
                />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={send}
                  disabled={!canSend}
                >
                  Send
                </button>
              </div>
              {state.inputError && (
                <p className="mt-2 text-xs text-warn">{state.inputError}</p>
              )}
              <p className="mt-2 text-[11px] text-ink-400">
                🎙 Voice input arrives in Phase 5 — typed responses for now.
              </p>
            </div>
          </Card>
        </div>

        {/* Right rail: metric breakdown (static until Phase 3) */}
        <div className="space-y-6">
          <Card
            title="Metric Breakdown"
            action={<Badge>Phase 3</Badge>}
          >
            <div className="space-y-3 opacity-70">
              {METRICS.map((m) => (
                <ScoreBar key={m.key} label={m.label} value={INITIAL_SCORES[m.key]} />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-ink-400">
              These become live, explainable scores in Phase 3.
            </p>
          </Card>

          <Card title="Objections Raised">
            {state.objectionsRaised.length === 0 ? (
              <p className="text-sm text-ink-400">None yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {state.objectionsRaised.map((key) => (
                  <li key={key} className="flex items-center justify-between gap-2">
                    <span className="text-ink-200 capitalize">
                      {key.replace(/_/g, ' ')}
                    </span>
                    {state.memory.addressedObjections.includes(key) ? (
                      <Badge tone="good">Addressed</Badge>
                    ) : (
                      <Badge tone="warn">Open</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function CallStatus({ state }: { state: ConversationEngineState }) {
  if (state.status === 'Completed') return <Badge>Ended</Badge>;
  if (state.status === 'Error') return <Badge tone="bad">Error</Badge>;
  if (state.status === 'GeneratingReply' || state.status === 'Evaluating')
    return <Badge tone="accent">Rohan is replying…</Badge>;
  if (state.status === 'Idle') return <Badge>Not started</Badge>;
  return <Badge tone="good">● Live</Badge>;
}

function CallTimer({ startedAt, running }: { startedAt: number | null; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  if (startedAt === null) return <span className="tabular-nums text-sm text-ink-400">00:00</span>;
  const secs = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return <span className="tabular-nums text-sm text-ink-300">{mm}:{ss}</span>;
}

function TranscriptBubble({ turn }: { turn: TranscriptTurn }) {
  const isSeller = turn.speaker === 'seller';
  return (
    <div className={`flex ${isSeller ? 'justify-end' : 'justify-start'} animate-fade-in`}>
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
        {turn.message}
      </div>
    </div>
  );
}

function TypingBubble({ name }: { name: string }) {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm bg-white/5 px-4 py-2 text-sm text-ink-300">
        <div className="mb-0.5 text-[11px] uppercase tracking-wide text-ink-400">
          {name}
        </div>
        <span className="inline-flex gap-1" aria-label="typing">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-300" />
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-300 [animation-delay:200ms]" />
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-300 [animation-delay:400ms]" />
        </span>
      </div>
    </div>
  );
}
