import { useState } from 'react';
import type { Screen } from './types';
import { Layout } from './components/Layout';
import { ScenarioBriefing } from './screens/ScenarioBriefing';
import { LiveRoleplay } from './screens/LiveRoleplay';
import { FinalReport } from './screens/FinalReport';
import { SessionHistory } from './screens/SessionHistory';
import { useConversation } from './hooks/useConversation';
import type { CreateProviderConfig } from './conversation/provider';

// Stable config reference so the engine/hook don't recreate every render.
// A short delay gives the Demo persona a realistic "typing" pause.
const CONVO_CONFIG: CreateProviderConfig = { demoDelayMs: 500 };

export default function App() {
  const [screen, setScreen] = useState<Screen>('briefing');
  const convo = useConversation(CONVO_CONFIG);

  const goToRoleplay = () => {
    if (convo.state.status === 'Idle') convo.start();
    setScreen('roleplay');
  };

  const handleEndCall = () => {
    convo.endCall();
    setScreen('report');
  };

  const handlePracticeAgain = () => {
    convo.reset();
    setScreen('briefing');
  };

  const handleNavigate = (target: Screen) => {
    if (target === 'roleplay') {
      goToRoleplay();
      return;
    }
    setScreen(target);
  };

  return (
    <Layout
      screen={screen}
      onNavigate={handleNavigate}
      demoMode={convo.state.demoMode}
    >
      {screen === 'briefing' && <ScenarioBriefing onStart={goToRoleplay} />}
      {screen === 'roleplay' && (
        <LiveRoleplay
          state={convo.state}
          providerName={convo.providerName}
          onSubmit={convo.submit}
          onRetry={convo.retry}
          onEndCall={handleEndCall}
        />
      )}
      {screen === 'report' && (
        <FinalReport
          report={convo.report}
          onReplay={handlePracticeAgain}
          onHistory={() => setScreen('history')}
          onStart={goToRoleplay}
        />
      )}
      {screen === 'history' && (
        <SessionHistory onOpen={() => setScreen('report')} />
      )}
    </Layout>
  );
}
