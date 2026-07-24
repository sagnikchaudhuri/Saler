import { useEffect, useMemo, useRef, useState } from 'react';
import { SalerShell } from './components/SalerShell';
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
import { hasEnteredApp, markAppEntered } from './nav/entrySession';
import { createSpeechProvider } from './speech/provider';
import { SALES_SCENARIO } from './data/scenario';
import type { SectionId, NavTarget } from './nav/sections';
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
  // `phase` is the homepage versus the application. Neither ever restarts the
  // conversation, evaluation, or persistence.
  const [section, setSection] = useState<SectionId>('S');
  // The homepage shows once per browser session. Reading sessionStorage here is
  // a pure read, so StrictMode re-invoking the initializer is harmless.
  const [phase, setPhase] = useState<'home' | 'app'>(() =>
    hasEnteredApp() ? 'app' : 'home',
  );
  // Whether the one-time dock has already happened. Governs presentation only:
  // it decides whether the homepage is the first arrival or a return visit.
  const [entered, setEntered] = useState(() => hasEnteredApp());
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
  const inCallView = phase === 'app' && (section === 'A' || section === 'L');

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

  // --- navigation handlers (state is never reset by navigation) ---
  //
  // Home is the single route back to the landing page. Escape and scroll-up
  // still do nothing — a gesture that discards your place should not be
  // something you can trigger by accident.

  /** Switch viewpoint. Leaving the call view stops mic + audio, not the engine. */
  const selectSection = (id: SectionId) => {
    const leavingCall = (section === 'A' || section === 'L') && id !== 'A' && id !== 'L';
    if (leavingCall) coordinator.stopAll();
    // A viewed historical report only belongs on Evaluation; any other letter
    // returns Evaluation to this browser's own last completed call.
    if (id !== 'E') setHistorySession(null);
    setSection(id);
    setPhase('app');
  };

  /** The one-time entrance from the first-run homepage. */
  const enterSection = (id: SectionId) => {
    markAppEntered();
    setEntered(true);
    selectSection(id);
  };

  /**
   * Back to the landing page. The call is not ended, reset, or unmounted —
   * only the microphone and any playing audio stop, exactly as when moving to
   * any other letter. `section` is deliberately left alone so the next letter
   * press returns to precisely where the user was.
   */
  const goHome = () => {
    coordinator.stopAll();
    setPhase('home');
  };

  const handleNavSelect = (id: NavTarget) => {
    if (id === 'HOME') goHome();
    else selectSection(id);
  };

  /** Begin (or restart) the roleplay — the one place a fresh engine is made. */
  const startRoleplay = () => {
    coordinator.stopAll();
    setHistorySession(null);
    if (status === 'Completed') convo.reset();
    setSection('A');
    setPhase('app');
  };

  const handleEndCall = () => {
    coordinator.stopAll();
    convo.endCall();
    setHistorySession(null);
    setSection('E');
    setPhase('app');
  };

  const openHistorySession = (session: StoredSession, focus: LogFocus = 'evaluation') => {
    setHistorySession(session);
    setLogFocus(focus);
    setSection('E');
    setPhase('app');
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
        <SalerShell
          phase={phase}
          entered={entered}
          section={section}
          onSelect={handleNavSelect}
          onEnter={enterSection}
          previews={previews}
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
        </SalerShell>
      </div>
    </>
  );
}
