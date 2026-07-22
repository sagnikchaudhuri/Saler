import { useState } from 'react';
import type { Screen } from './types';
import { Layout } from './components/Layout';
import { ScenarioBriefing } from './screens/ScenarioBriefing';
import { LiveRoleplay } from './screens/LiveRoleplay';
import { FinalReport } from './screens/FinalReport';
import { SessionHistory } from './screens/SessionHistory';

export default function App() {
  const [screen, setScreen] = useState<Screen>('briefing');

  // Phase 1: Demo Mode is always on because no live AI/voice services are
  // wired yet. From Phase 2 onward this reflects real service availability.
  const demoMode = true;

  return (
    <Layout screen={screen} onNavigate={setScreen} demoMode={demoMode}>
      {screen === 'briefing' && (
        <ScenarioBriefing onStart={() => setScreen('roleplay')} />
      )}
      {screen === 'roleplay' && (
        <LiveRoleplay onEndCall={() => setScreen('report')} />
      )}
      {screen === 'report' && (
        <FinalReport
          onReplay={() => setScreen('briefing')}
          onHistory={() => setScreen('history')}
        />
      )}
      {screen === 'history' && (
        <SessionHistory onOpen={() => setScreen('report')} />
      )}
    </Layout>
  );
}
