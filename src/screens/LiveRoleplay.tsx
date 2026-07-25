import { useEffect, useRef, useState } from 'react';
import { SALES_SCENARIO } from '../data/scenario';
import { ScoreBar, Badge, Disclosure } from '../components/ui';
import { ScoreTrend } from '../components/ScoreTrend';
import { SellerInput } from '../components/SellerInput';
import { VoiceControls } from '../components/VoiceControls';
import { ConversationHealth } from '../components/ConversationHealth';
import { AmbientLine, type AmbientState } from '../components/AmbientLine';
import type { SpeechRecognitionProvider } from '../speech/types';
import type { MediaCoordinator } from '../media/MediaCoordinator';
import type { UseVoiceOutput } from '../hooks/useVoiceOutput';
import type { TranscriptTurn, SalesStage, Scores, Momentum } from '../types';
import type { ConversationEngineState } from '../conversation/engine';

const METRICS: { key: keyof Scores; label: string }[] = [
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
  evaluatorName,
  onSubmit,
  onRetry,
  onEndCall,
  speechProvider,
  coordinator,
  voice,
  customerName = 'Demo Customer',
  view,
  onDraftActiveChange,
}: {
  state: ConversationEngineState;
  evaluatorName: string;
  /** Which implementation last produced a customer reply. */
  customerName?: string;
  onSubmit: (text: string) => void;
  onRetry: () => void;
  onEndCall: () => void;
  /** Injectable speech provider (tests); defaults to the browser provider. */
  speechProvider?: SpeechRecognitionProvider;
  /** Broker for microphone/audio exclusivity. */
  coordinator?: MediaCoordinator;
  /** Voice-output controller; omitted in tests that don't exercise audio. */
  voice?: UseVoiceOutput;
  /**
   * Which viewpoint to emphasise. 'conversation' (A) hides the intelligence
   * rail; 'readings' (L) hides the conversation column. Undefined shows both.
   *
   * CRITICAL: this only toggles CSS visibility — both columns stay mounted, so
   * switching A ↔ L never remounts the input, speech provider, draft, or any
   * engine state. The active call is preserved.
   */
  view?: 'conversation' | 'readings';
  /** Reports a non-empty unsent draft upward for the active-call unload guard. */
  onDraftActiveChange?: (active: boolean) => void;
}) {
  const s = SALES_SCENARIO;
  const scrollRef = useRef<HTMLDivElement>(null);

  const isBusy = state.status === 'GeneratingReply' || state.status === 'Evaluating';
  const canSend = state.status === 'WaitingForSeller';

  const { scoreState } = state;
  const latest = scoreState.history.at(-1) ?? null;
  const objectionActive = state.objectionsRaised.length > 0;
  const momentum: Momentum = latest?.momentum ?? 'Stable';
  const feedback = latest?.briefFeedback ?? 'Open with a discovery question to get started.';
  const nextMove = latest?.recommendedNextMove ?? 'Ask how Divika trains new reps.';
  const trendValues = scoreState.history.map((h) => h.visibleOverall);

  const ambient: AmbientState = voice?.isSpeaking
    ? 'customer'
    : isBusy
      ? 'thinking'
      : 'idle';

  // View-driven layout. Both columns always render (never unmount) so the call
  // survives A ↔ L; visibility is toggled with `hidden`.
  const gridClass = view ? 'grid gap-10' : 'grid gap-10 lg:grid-cols-[1fr_260px]';
  const conversationHidden = view === 'readings' ? 'hidden' : '';
  const asideHidden = view === 'conversation' ? 'hidden' : '';

  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [state.transcript.length, isBusy]);

  return (
    <div className="animate-rise-in">
      <AmbientLine state={ambient} />

      {/* Who you are talking to, and the state of the call. */}
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-surface text-sm font-semibold text-ink">
            {s.customer.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-ink">{s.customer.name}</div>
            <div className="truncate text-sm text-ink-muted">{s.customer.role}</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <CallStatus state={state} />
          <CallTimer startedAt={state.startedAt} running={state.status !== 'Completed'} />
          <button type="button" className="btn-danger" onClick={onEndCall}>
            End Call
          </button>
        </div>
      </header>

      <div className={gridClass}>
        {/* ---------------- The conversation dominates ---------------- */}
        <div className={`min-w-0 ${conversationHidden}`}>
          {/* A-view only: a quiet line of context. Full readings live in L, so
              this deliberately shows just health, stage, and the next move —
              never the metric breakdown — and stays subordinate to the words. */}
          {view === 'conversation' && (
            <div className="mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-line pb-4">
              <span className="flex items-baseline gap-1.5">
                <span className="eyebrow">Health</span>
                <span className="numeric text-lg font-semibold text-ink">
                  {scoreState.visibleOverall}
                </span>
                <span className="text-xs text-ink-muted">{momentum}</span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="eyebrow">Stage</span>
                <span className="text-sm text-ink">{STAGE_LABEL[state.stage]}</span>
              </span>
              <span className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                <span className="eyebrow">Next move</span>
                <span className="ml-1.5 text-sm text-ink-secondary">{nextMove}</span>
              </span>
            </div>
          )}

          <div
            ref={scrollRef}
            role="log"
            aria-label="Conversation transcript"
            className="max-h-[52vh] space-y-6 overflow-y-auto pr-1"
          >
            {state.transcript.length === 0 && (
              <p className="py-10 text-center text-sm text-ink-muted">
                The call hasn&rsquo;t started yet.
              </p>
            )}
            {state.transcript.map((turn) => (
              <TranscriptTurnView key={turn.id} turn={turn} />
            ))}
            {isBusy && <ThinkingLine name={s.customer.name} />}
          </div>

          {state.status === 'Error' && (
            <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-critical/25 bg-critical/5 p-3 text-sm">
              <span className="text-critical">{state.error ?? 'Something went wrong.'}</span>
              <button type="button" className="btn-ghost" onClick={onRetry}>
                Retry
              </button>
            </div>
          )}

          <SellerInput
            canSend={canSend}
            inputError={state.inputError}
            onSubmit={onSubmit}
            speechProvider={speechProvider}
            coordinator={coordinator}
            isOutputSpeaking={voice?.isSpeaking}
            isOutputPreparing={voice?.isPreparing}
            onDraftActiveChange={onDraftActiveChange}
          />

          {voice && <VoiceControls voice={voice} />}
        </div>

        {/* ---------------- Coaching: the side rail, or the whole L view ------- */}
        <aside
          className={`min-w-0 space-y-8 ${asideHidden} ${
            view === 'readings' ? '' : 'lg:border-l lg:border-line lg:pl-8'
          }`}
        >
          <ConversationHealth
            score={scoreState.visibleOverall}
            momentum={momentum}
            stage={STAGE_LABEL[state.stage]}
          />

          <div className="space-y-3">
            <div>
              <div className="eyebrow">Coaching</div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{feedback}</p>
            </div>
            <div className="rounded-lg bg-accent-wash p-3">
              <div className="eyebrow text-accent">Next move</div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink">{nextMove}</p>
            </div>
          </div>

          {state.objectionsRaised.length > 0 && (
            <div>
              <div className="eyebrow">Objections</div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {state.objectionsRaised.map((key) => (
                  <li key={key} className="flex items-center justify-between gap-2">
                    <span className="capitalize text-ink-secondary">
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
            </div>
          )}

          {/* Detail is available, but never competes with the conversation. */}
          <div className="border-t border-line">
            <Disclosure summary="Score detail">
              <div className="space-y-3">
                {METRICS.map((m) => {
                  if (m.key === 'objectionHandling' && !objectionActive) {
                    return (
                      <div key={m.key} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-ink-secondary">{m.label}</span>
                        <span className="text-ink-muted">Not yet assessed</span>
                      </div>
                    );
                  }
                  return (
                    <ScoreBar key={m.key} label={m.label} value={scoreState.metrics[m.key]} />
                  );
                })}
              </div>
              <div className="mt-6">
                <div className="eyebrow mb-2">Trend</div>
                <ScoreTrend values={trendValues} />
              </div>
            </Disclosure>

            <Disclosure summary="Session details">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-secondary">Customer</dt>
                  <dd className="text-right text-ink">{customerName}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-secondary">Evaluation</dt>
                  <dd className="text-right text-ink">{evaluatorName}</dd>
                </div>
              </dl>
            </Disclosure>
          </div>

          {/* Non-blocking notices: scoring fell back, or a capability changed
              mid-call. Neither interrupts the conversation. */}
          {state.evaluatorWarning && (
            <p role="status" className="text-xs leading-relaxed text-caution">
              {state.evaluatorWarning} The call continues normally.
            </p>
          )}
          {state.capabilityWarning && (
            <p role="status" className="text-xs leading-relaxed text-caution">
              {state.capabilityWarning}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function CallStatus({ state }: { state: ConversationEngineState }) {
  if (state.status === 'Completed') return <Badge>Ended</Badge>;
  if (state.status === 'Error') return <Badge tone="bad">Error</Badge>;
  if (state.status === 'Evaluating') return <Badge tone="accent">Scoring…</Badge>;
  if (state.status === 'GeneratingReply') return <Badge tone="accent">Divika is replying…</Badge>;
  if (state.status === 'Idle') return <Badge>Not started</Badge>;
  return <Badge tone="good">Live</Badge>;
}

function CallTimer({ startedAt, running }: { startedAt: number | null; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);

  const secs = startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return (
    <span className="numeric text-sm text-ink-secondary">
      {mm}:{ss}
    </span>
  );
}

/**
 * Speech is set as dialogue, not chat bubbles: the speaker is named once and
 * the words carry the weight. Customer and seller are distinguished by
 * typography and indentation rather than coloured blocks.
 */
function TranscriptTurnView({ turn }: { turn: TranscriptTurn }) {
  const isSeller = turn.speaker === 'seller';
  return (
    <div className="animate-turn-in">
      <div
        className={`eyebrow mb-1.5 ${isSeller ? 'text-accent' : 'text-ink-muted'}`}
      >
        {isSeller ? 'You' : SALES_SCENARIO.customer.name}
      </div>
      <p
        className={`max-w-[62ch] text-[17px] leading-relaxed ${
          isSeller ? 'pl-4 text-ink-secondary' : 'text-ink'
        }`}
      >
        {turn.message}
      </p>
    </div>
  );
}

function ThinkingLine({ name }: { name: string }) {
  return (
    <div>
      <div className="eyebrow mb-1.5 text-ink-muted">{name}</div>
      <span className="inline-flex items-center gap-1" aria-label="Thinking">
        <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-muted motion-reduce:animate-none" />
        <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-muted [animation-delay:200ms] motion-reduce:animate-none" />
        <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-muted [animation-delay:400ms] motion-reduce:animate-none" />
      </span>
    </div>
  );
}
