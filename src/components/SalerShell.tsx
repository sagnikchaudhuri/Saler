import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SalerNav, type SalerNavPreviews } from './SalerNav';
import { Badge } from './ui';
import type { SectionId } from '../nav/sections';

// ============================================================================
// The SALER shell: homepage and application chrome as one continuous object.
//
// There is exactly ONE SalerNav mounted for the lifetime of the session. It
// starts centred and enormous (the homepage), and when a letter is chosen it
// travels up and shrinks into the navbar. Nothing cross-fades, because there
// is no second navigation to fade to — the same DOM nodes simply change size
// and position.
//
// The homepage is an entrance, not a destination. Once a section is entered
// there is no route back to it in this session: no Home button, no Escape, no
// scroll-up gesture. A refresh is a new session and may show it again.
//
// This file is presentation only. It never touches the engine, providers,
// scoring, persistence, speech, or voice — entering a section is a change of
// viewpoint, so no API call, playback, or provider construction happens here.
// ============================================================================

/** Long enough to read as one object moving; short enough not to be a wait. */
const DOCK_MS = 780;

const HOME_LETTER = 'clamp(2.4rem, 13vw, 8rem)';
const COMPACT_LETTER = 'clamp(1rem, 3.4vw, 1.15rem)';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

export function SalerShell({
  phase,
  section,
  onSelect,
  onEnter,
  previews,
  demoMode,
  children,
}: {
  phase: 'home' | 'app';
  /** Current section; null while the homepage is showing. */
  section: SectionId | null;
  /** Letter chosen from the navbar. */
  onSelect: (id: SectionId) => void;
  /** Letter chosen from the homepage — the one-time entrance. */
  onEnter: (id: SectionId) => void;
  previews: SalerNavPreviews;
  demoMode: boolean;
  children: ReactNode;
}) {
  // True only while the letters are travelling from homepage to navbar.
  const [docking, setDocking] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  // The entrance is a one-shot. A ref, not state, so StrictMode's double
  // invocation and any re-render cannot start it twice.
  const entered = useRef(false);

  const isHome = phase === 'home';

  const enter = (id: SectionId) => {
    if (entered.current) return;
    entered.current = true;
    // Tell App first so the destination is mounted underneath and the letters
    // dock onto real content rather than onto an empty page.
    onEnter(id);
    if (prefersReducedMotion()) {
      mainRef.current?.focus();
      return;
    }
    setDocking(true);
  };

  // End of the dock: content becomes interactive and focus follows the user
  // into the section they chose, rather than being left on a letter that has
  // since moved.
  useEffect(() => {
    if (!docking) return;
    const t = setTimeout(() => {
      setDocking(false);
      mainRef.current?.focus();
    }, DOCK_MS);
    return () => clearTimeout(t);
  }, [docking]);

  // The navbar earns its shadow only once content has slipped underneath it.
  useEffect(() => {
    if (isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  // During the dock the letters are already heading for their compact state,
  // so "large" is the homepage at rest, not the homepage mid-departure.
  const large = isHome && !docking;

  return (
    <div className="relative flex min-h-full flex-col bg-canvas">
      {/* --- the navigation layer: fixed, and the only SALER on the page --- */}
      <div
        className="fixed inset-x-0 top-0 z-30"
        style={{
          transform: large ? 'translateY(38vh)' : 'translateY(0)',
          transition: `transform ${DOCK_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      >
        {/* Bar surface. Absent on the homepage — the brief is explicit that the
            homepage has no navbar — and it fades in as the letters arrive. */}
        <div
          aria-hidden
          className={[
            'absolute inset-0 border-b bg-canvas/85 backdrop-blur transition-[opacity,box-shadow,border-color]',
            large ? 'opacity-0' : 'opacity-100',
            scrolled ? 'border-line shadow-dock' : 'border-transparent',
          ].join(' ')}
          style={{ transitionDuration: `${DOCK_MS}ms, 220ms, 220ms` }}
        />

        <div className="relative mx-auto flex max-w-5xl items-center justify-center px-4 py-3">
          <SalerNav
            mode={large ? 'home' : 'compact'}
            active={large ? null : section}
            onSelect={large ? enter : onSelect}
            previews={previews}
            letterSize={large ? HOME_LETTER : COMPACT_LETTER}
            transitionMs={docking ? DOCK_MS : 0}
          />
        </div>
      </div>

      {/* --- homepage copy: the tagline lives with the large letters --- */}
      {isHome && (
        <div
          // Clears the letters, their labels, and the hover preview beneath.
          className={`pointer-events-none fixed inset-x-0 top-[calc(38vh+9rem)] sm:top-[calc(38vh+15rem)] z-20 flex flex-col items-center gap-3 px-6 text-center transition-opacity duration-300 ${
            docking ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <p className="max-w-sm text-base text-ink-secondary">
            Practice the conversation before it matters.
          </p>
          {demoMode && <Badge>Demo Mode</Badge>}
        </div>
      )}

      {/* --- the application --- */}
      {!isHome && (
        <>
          <main
            ref={mainRef}
            tabIndex={-1}
            aria-label="Section content"
            className={`mx-auto w-full max-w-5xl flex-1 px-5 pb-10 pt-24 outline-none transition-opacity duration-500 ${
              docking ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
          >
            {/* Deliberately NOT keyed on the section. A `key` here would give
                each viewpoint its own entrance animation, but it would also
                remount the subtree — and A and L share one live call, so
                switching between them would silently discard the unsent draft.
                Section entrances are handled inside the screens instead. */}
            {children}
          </main>

          <footer className="border-t border-line px-5 py-6">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
              <span>Practice the conversation before it matters.</span>
              <div className="flex items-center gap-3">
                {demoMode && <Badge>Demo Mode</Badge>}
                <span>No real customer data</span>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
