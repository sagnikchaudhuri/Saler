import type { ReactNode } from 'react';
import { SalerNav } from './SalerNav';
import { Badge } from './ui';
import type { SectionId } from '../nav/sections';

// The shell shown once you are inside a section: the compacted S A L E R rail
// at the top, the current viewpoint below, and a quiet footer. Switching
// letters here changes the viewpoint only — it never reloads or resets state.
export function Layout({
  active,
  onSelect,
  onExpand,
  demoMode,
  children,
}: {
  active: SectionId;
  onSelect: (id: SectionId) => void;
  onExpand: () => void;
  demoMode: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
          <button
            type="button"
            onClick={onExpand}
            className="text-xs uppercase tracking-[0.14em] text-ink-muted hover:text-ink"
            aria-label="Back to the Saler home"
          >
            Home
          </button>

          <SalerNav variant="compact" active={active} onSelect={onSelect} onExpand={onExpand} />

          <div className="hidden sm:block">{demoMode && <Badge>Demo Mode</Badge>}</div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">{children}</main>

      <footer className="border-t border-line px-5 py-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span>Practice the conversation before it matters.</span>
          <span>No real customer data</span>
        </div>
      </footer>
    </div>
  );
}
