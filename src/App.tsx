import { useEffect, useState } from 'react';
import type { Screen } from './types';
import { Layout } from './components/Layout';
import { ScenarioBriefing } from './screens/ScenarioBriefing';
import { LiveRoleplay } from './screens/LiveRoleplay';
import { FinalReport } from './screens/FinalReport';
import { SessionHistory } from './screens/SessionHistory';
import { useConversation } from './hooks/useConversation';
import type { CreateProviderConfig } from './conversation/provider';
import { sessionRepository } from './persistence/repository';
import type { StoredSession } from './persistence/types';

// Stable config reference so the engine/hook don't recreate every render.
const CONVO_CONFIG: CreateProviderConfig = { demoDelayMs: 500 };

// Read any corrupted-storage notice ONCE at module load. This must not live in
// a useState initializer: consuming is a one-shot side effect and StrictMode
// double-invokes initializers, which would silently swallow the warning.
const STARTUP_RECOVERY_WARNING = sessionRepository.consumeRecoveryWarning();

export default function App() {
  const [screen, setScreen] = useState<Screen>('briefing');
  // A session opened from history (viewed read-only, no new roleplay started).
  const [historySession, setHistorySession] = useState<StoredSession | null>(null);
  const convo = useConversation(CONVO_CONFIG);
  const { status } = convo.state;
  const { start } = convo;

  // Auto-start the call when the roleplay screen is shown with a fresh engine.
  useEffect(() => {
    if (screen === 'roleplay' && status === 'Idle') start();
  }, [screen, status, start]);

  const goToRoleplay = () => {
    setHistorySession(null);
    // A finished call needs a fresh engine before another attempt.
    if (status === 'Completed') convo.reset();
    setScreen('roleplay');
  };

  const handleEndCall = () => {
    convo.endCall();
    setHistorySession(null);
    setScreen('report');
  };

  const handleNavigate = (target: Screen) => {
    if (target === 'roleplay') {
      goToRoleplay();
      return;
    }
    if (target !== 'report') setHistorySession(null);
    setScreen(target);
  };

  const openHistorySession = (session: StoredSession) => {
    setHistorySession(session);
    setScreen('report');
  };

  // The report shows a history session when one is open, otherwise the session
  // just completed in this browser tab.
  const reportSession = historySession ?? convo.state.completedSession;

  return (
    <Layout screen={screen} onNavigate={handleNavigate} demoMode={convo.state.demoMode}>
      {screen === 'briefing' && <ScenarioBriefing onStart={goToRoleplay} />}
      {screen === 'roleplay' && (
        <LiveRoleplay
          state={convo.state}
          evaluatorName={convo.evaluatorName}
          onSubmit={convo.submit}
          onRetry={convo.retry}
          onEndCall={handleEndCall}
        />
      )}
      {screen === 'report' && (
        <FinalReport
          session={reportSession}
          onReplay={goToRoleplay}
          onBriefing={() => {
            setHistorySession(null);
            setScreen('briefing');
          }}
          onHistory={() => setScreen('history')}
          onStart={goToRoleplay}
        />
      )}
      {screen === 'history' && (
        <SessionHistory
          onOpen={openHistorySession}
          onStart={goToRoleplay}
          recoveryWarning={STARTUP_RECOVERY_WARNING}
        />
      )}
    </Layout>
  );
}
