import { useEffect, useMemo, useRef, useState } from 'react';
import { Layout } from './components/Layout';
import { CarouselHome } from './components/CarouselHome';
import { ReportIssue } from './components/ReportIssue';
import { ScenarioBriefing } from './screens/ScenarioBriefing';
import { LiveRoleplay } from './screens/LiveRoleplay';
import { FinalReport } from './screens/FinalReport';
import { SessionHistory } from './screens/SessionHistory';
import { useConversation } from './hooks/useConversation';
import { useSessions } from './hooks/useSessions';
import type { CreateProviderConfig } from './conversation/provider';
import { sessionRepository } from './persistence/repository';
import type { StoredSession } from './persistence/types';
import { createMediaCoordinator } from './media/MediaCoordinator';
import { useVoiceOutput } from './hooks/useVoiceOutput';
import { SalerIntro } from './components/SalerIntro';
import { hasSeenIntro } from './components/introSession';
import { createSpeechProvider } from './speech/provider';
import { SALES_SCENARIO } from './data/scenario';
import type { SectionId } from './nav/sections';
import type { SalerNavPreviews } from './components/SalerNav';
import type { LogFocus } from './screens/SessionHistory';
import { customerStatusLabel } from './ai/labels';

// Stable config reference so the engine/hook don't recreate every render.
const CONVO_CONFIG: CreateProviderConfig = { demoDelayMs: 500 };

const STARTUP_RECOVERY_WARNING = sessionRepository.consumeRecoveryWarning();

// Capability read once at module load. `isSupported()` only checks for the
// browser API — it never requests microphone permission.
const SPEECH_SUPPORTED = createSpeechProvider().supported;

export default function App() {
  // SALER is the navigation. `section` is which letter/viewpoint is active;
  // `mode` is whether we are on the full carousel or inside a section. Neither
  // ever restarts the conversation, evaluation, or persistence.
  const [section, setSection] = useState<SectionId>('S');
  const [mode, setMode] = useState<'carousel' | 'inside'>('carousel');
  const [historySession, setHistorySession] = useState<StoredSession | null>(null);
  // Which part of a Report Log the user asked to see.
  const [logFocus, setLogFocus] = useState<LogFocus>('evaluation');

  // Intro is presentation only. Reading `hasSeenIntro()` here (a pure read) lets
  // tests skip it via sessionStorage, and StrictMode re-invoking the initializer
  // is harmless.
  const [introVisible, setIntroVisible] = useState(() => !hasSeenIntro());
  const [revealing, setRevealing] = useState(false);

  const convo = useConversation(CONVO_CONFIG);
  const { status } = convo.state;
  const { start } = convo;
  const { sessions } = useSessions();

  const coordinatorRef = useRef(createMediaCoordinator());
  const coordinator = coordinatorRef.current;

  // A and L are two viewpoints of the SAME live call.
  const inCallView = mode === 'inside' && (section === 'A' || section === 'L');

  // Voice is only live while actually viewing an in-progress call, never on the
  // carousel, a historical session, a completed call, or before it starts.
  const isLiveCall =
    inCallView && historySession === null && status !== 'Completed' && status !== 'Idle';

  const voice = useVoiceOutput({ coordinator, isLiveCall });

  // Auto-start the call the first time either call viewpoint is shown.
  useEffect(() => {
    if (inCallView && status === 'Idle') start();
  }, [inCallView, status, start]);

  // Speak genuinely NEW customer turns only (deduplicated inside the hook).
  const latestCustomerTurn = useMemo(() => {
    const t = convo.state.transcript;
    for (let i = t.length - 1; i >= 0; i--) {
      if (t[i].speaker === 'customer') return t[i];
    }
    return null;
  }, [convo.state.transcript]);

  const { speakCustomerTurn } = voice;
  useEffect(() => {
    if (!isLiveCall || !latestCustomerTurn) return;
    speakCustomerTurn(latestCustomerTurn);
  }, [isLiveCall, latestCustomerTurn, speakCustomerTurn]);

  // Expanding back to the carousel: only when already scrolled to the very top
  // and the user keeps scrolling up. Passive, never hijacks normal scrolling.
  useEffect(() => {
    if (mode !== 'inside') return;
    let accum = 0;
    const onWheel = (e: WheelEvent) => {
      if (window.scrollY > 0) {
        accum = 0;
        return;
      }
      if (e.deltaY < 0) {
        accum += -e.deltaY;
        if (accum > 140) {
          accum = 0;
          coordinator.stopAll();
          setMode('carousel');
        }
      } else {
        accum = 0;
      }
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [mode, coordinator]);

  // --- navigation handlers (state is never reset by navigation) ---

  /** Switch viewpoint. Leaving the call view stops mic + audio, not the engine. */
  const selectSection = (id: SectionId) => {
    const leavingCall = (section === 'A' || section === 'L') && id !== 'A' && id !== 'L';
    if (leavingCall) coordinator.stopAll();
    // A viewed historical report only belongs on Evaluation; any other letter
    // returns Evaluation to this browser's own last completed call.
    if (id !== 'E') setHistorySession(null);
    setSection(id);
    setMode('inside');
  };

  const expandToCarousel = () => {
    coordinator.stopAll();
    setMode('carousel');
  };

  /** Begin (or restart) the roleplay — the one place a fresh engine is made. */
  const startRoleplay = () => {
    coordinator.stopAll();
    setHistorySession(null);
    if (status === 'Completed') convo.reset();
    setSection('A');
    setMode('inside');
  };

  const handleEndCall = () => {
    coordinator.stopAll();
    convo.endCall();
    setHistorySession(null);
    setSection('E');
    setMode('inside');
  };

  const openHistorySession = (session: StoredSession, focus: LogFocus = 'evaluation') => {
    setHistorySession(session);
    setLogFocus(focus);
    setSection('E');
    setMode('inside');
  };

  const reportSession = historySession ?? convo.state.completedSession;

  // Never imply live AI from a configured key alone.
  const honestCustomerLabel = customerStatusLabel(convo.aiEnabled, convo.customerMode);

  // Hover previews use ONLY real application state — never invented data.
  const sellerTurns = convo.state.memory.sellerTurns;
  const scoreHistory = convo.state.scoreState.history;
  const latestMomentum = scoreHistory.at(-1)?.momentum ?? 'Stable';
  const completedReport = convo.state.completedSession?.finalReport ?? null;
  const previews: SalerNavPreviews = {
    S: [
      SALES_SCENARIO.customer.name,
      'Sceptical buyer',
      status === 'Idle' ? 'Ready to begin' : 'In progress',
    ],
    A: [status === 'Idle' ? 'Conversation waiting' : `${sellerTurns} turn${sellerTurns === 1 ? '' : 's'} so far`],
    L: scoreHistory.length > 0
      ? [`Health ${convo.state.scoreState.visibleOverall}`, latestMomentum]
      : ['No live data yet'],
    E: completedReport ? [`Last score ${completedReport.overall_score}`] : ['No report yet'],
    R: [`${sessions.length} report log${sessions.length === 1 ? '' : 's'}`],
  };

  return (
    <>
      {introVisible && (
        <SalerIntro
          onReveal={() => setRevealing(true)}
          onDone={() => setIntroVisible(false)}
        />
      )}

      <div className={revealing ? 'animate-app-reveal' : undefined}>
        {mode === 'carousel' ? (
          <CarouselHome
            onSelect={selectSection}
            previews={previews}
            demoMode={convo.state.demoMode}
          />
        ) : (
          <Layout
            active={section}
            onSelect={selectSection}
            onExpand={expandToCarousel}
            demoMode={convo.state.demoMode}
          >
            {section === 'S' && (
              <ScenarioBriefing
                onStart={startRoleplay}
                speechSupported={SPEECH_SUPPORTED}
                voiceProviderName={voice.providerName}
                customerLabel={honestCustomerLabel}
              />
            )}

            {/* A and L share ONE LiveRoleplay instance at a stable position, so
                switching viewpoint preserves the active call entirely. */}
            {(section === 'A' || section === 'L') && (
              <LiveRoleplay
                state={convo.state}
                evaluatorName={convo.evaluatorName}
                customerName={honestCustomerLabel}
                onSubmit={convo.submit}
                onRetry={convo.retry}
                onEndCall={handleEndCall}
                coordinator={coordinator}
                voice={voice}
                view={section === 'L' ? 'readings' : 'conversation'}
              />
            )}

            {section === 'E' && (
              <FinalReport
                session={reportSession}
                onReplay={startRoleplay}
                onBriefing={() => selectSection('S')}
                onHistory={() => selectSection('R')}
                onStart={startRoleplay}
                focusTranscript={historySession !== null && logFocus === 'transcript'}
              />
            )}

            {section === 'R' && (
              <div className="space-y-12">
                <SessionHistory
                  onOpen={openHistorySession}
                  onStart={startRoleplay}
                  recoveryWarning={STARTUP_RECOVERY_WARNING}
                />
                <div className="mx-auto max-w-3xl">
                  <ReportIssue />
                </div>
              </div>
            )}
          </Layout>
        )}
      </div>
    </>
  );
}
