import type { ReactNode } from 'react';
import type { Screen } from '../types';
import { Badge } from './ui';

const NAV: { key: Screen; label: string }[] = [
  { key: 'briefing', label: 'Scenario' },
  { key: 'roleplay', label: 'Roleplay' },
  { key: 'report', label: 'Report' },
  { key: 'history', label: 'History' },
];

export function Layout({
  screen,
  onNavigate,
  demoMode,
  children,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
  demoMode: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        {/* Wraps rather than overflowing on narrow screens. */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3">
          <button
            type="button"
            onClick={() => onNavigate('briefing')}
            className="display -mx-1 rounded px-1 py-2 text-[15px] tracking-[0.16em] hover:opacity-70"
            aria-label="Saler — go to scenario"
          >
            SALER
          </button>

          <nav className="flex items-center gap-0.5" aria-label="Primary">
            {NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                aria-current={screen === item.key ? 'page' : undefined}
                className={`rounded-lg px-2 py-2 text-[13px] transition-colors sm:px-3 sm:text-sm ${
                  screen === item.key
                    ? 'bg-surface font-medium text-ink'
                    : 'text-ink-secondary hover:text-ink'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="hidden sm:block">
            {demoMode && <Badge>Demo Mode</Badge>}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">{children}</main>

      <footer className="border-t border-line px-5 py-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span>Practice the conversation before it matters.</span>
          <span>Practice environment · No real customer data</span>
        </div>
      </footer>
    </div>
  );
}
