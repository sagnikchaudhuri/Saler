import type { ReactNode } from 'react';
import type { Screen } from '../types';
import { Badge } from './ui';

const NAV: { key: Screen; label: string; icon: string }[] = [
  { key: 'briefing', label: 'Scenario', icon: '📋' },
  { key: 'roleplay', label: 'Live Call', icon: '🎧' },
  { key: 'report', label: 'Report', icon: '📊' },
  { key: 'history', label: 'History', icon: '🗂️' },
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
    <div className="flex min-h-full flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-white/5 bg-navy-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent-soft">
              <span aria-hidden className="text-lg">◈</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-100">SalesSim</div>
              <div className="text-xs text-ink-400">AI Sales Roleplay Coach</div>
            </div>
          </div>

          {/* Primary nav */}
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
            {NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                aria-current={screen === item.key ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  screen === item.key
                    ? 'bg-white/10 text-ink-100'
                    : 'text-ink-300 hover:bg-white/5'
                }`}
              >
                <span aria-hidden className="mr-1.5">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {demoMode && <Badge tone="warn">Demo Mode</Badge>}
        </div>

        {/* Mobile nav */}
        <nav
          className="flex items-center gap-1 overflow-x-auto px-4 pb-2 sm:hidden"
          aria-label="Primary mobile"
        >
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              aria-current={screen === item.key ? 'page' : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                screen === item.key
                  ? 'bg-white/10 text-ink-100'
                  : 'text-ink-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 animate-fade-in">
        {children}
      </main>

      <footer className="border-t border-white/5 px-4 py-4 text-center text-xs text-ink-400">
        SalesSim · Practice environment · No real customer data
      </footer>
    </div>
  );
}
