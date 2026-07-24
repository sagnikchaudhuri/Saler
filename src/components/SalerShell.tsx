import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SalerNav, type SalerNavPreviews } from './SalerNav';
import { Badge } from './ui';
import type { SectionId, NavTarget } from '../nav/sections';

// ============================================================================
// The SALER shell: homepage and application chrome as one continuous object.
//
// There is exactly ONE SalerNav mounted for the lifetime of the session. It
// starts centred and enormous (the homepage), and when a letter is chosen it
// travels up and shrinks into the navbar. Nothing cross-fades, because there
// is no second navigation to fade to — the same DOM nodes simply change size
// and position.
//
// The homepage is entered ONCE with the dock animation. After that it becomes
// an ordinary destination reachable from the navbar's leading S: the letters
// are already docked, so returning simply shows the landing layout beneath the
// bar — no dock, no intro, no entry sequence. Escape and scroll-up still do
// nothing; Home is the only way back, and it is always in the same place.
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
  entered,
  section,
  onSelect,
  onEnter,
  previews,
  demoMode,
  children,
}: {
  phase: 'home' | 'app';
  /** True once a section has been entered — the dock has already happened. */
  entered: boolean;
  /** Current section; null while the homepage is showing. */
  section: SectionId | null;
  /** Letter chosen from the navbar, including Home. */
  onSelect: (id: NavTarget) => void;
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
  const didEnter = useRef(false);

  const isHome = phase === 'home';
  /** The very first arrival: the only time the letters start big and travel. */
  const firstRun = isHome && !entered;

  const enter = (id: NavTarget) => {
    if (didEnter.current || id === 'HOME') return;
    didEnter.current = true;
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

  // "large" means the single docking instance is still at homepage size. Only
  // the first run qualifies: on a later visit the letters are already the bar.
  const large = firstRun && !docking;

  return (
    <div className="relative flex min-h-full flex-col bg-canvas">
      {/* --- the navigation layer: fixed, and the only SALER on the page --- */}
      <div
        className="fixed inset-x-0 top-0 z-30"
        style={{
          transform: large ? 'translateY(38vh)' : 'translateY(0)',
          // Animated ONLY while docking. Otherwise returning Home would play
          // the dock backwards, which is exactly what must not happen.
          transition: docking ? `transform ${DOCK_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
        }}
      >
        {/* Bar surface. Absent on the FIRST-RUN homepage, which has no navbar
            at all, and it fades in as the letters arrive. On a later visit to
            the landing page the bar is already there and stays. */}
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
            // On the landing page the navbar's own Home letter is the current
            // destination; inside the app it is the section being viewed.
            active={large ? null : isHome ? 'HOME' : section}
            onSelect={large ? enter : onSelect}
            previews={previews}
            letterSize={large ? HOME_LETTER : COMPACT_LETTER}
            transitionMs={docking ? DOCK_MS : 0}
          />
        </div>
      </div>

      {/* --- landing letters: the homepage as seen on a RETURN visit ---
          A second, deliberately static instance. The docking instance is by
          then the navbar above, and it must stay there: re-using it here would
          mean animating the letters back down, i.e. replaying the dock. */}
      {isHome && entered && (
        <div className="fixed inset-x-0 top-[38vh] z-20 flex justify-center">
          <SalerNav
            mode="home"
            active={null}
            onSelect={onSelect}
            previews={previews}
            letterSize={HOME_LETTER}
          />
        </div>
      )}

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

      {/* --- the application ---
          Hidden with `display: none` on the homepage rather than unmounted.
          Unmounting would destroy the live call's local state — most visibly
          the unsent draft — so going Home and coming back would quietly throw
          away what the user had typed. */}
      <>
          <main
            ref={mainRef}
            tabIndex={-1}
            aria-label="Section content"
            className={`mx-auto w-full max-w-5xl flex-1 px-5 pb-10 pt-24 outline-none transition-opacity duration-500 ${
              isHome ? 'hidden' : ''
            } ${docking ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          >
            {/* Deliberately NOT keyed on the section. A `key` here would give
                each viewpoint its own entrance animation, but it would also
                remount the subtree — and A and L share one live call, so
                switching between them would silently discard the unsent draft.
                Section entrances are handled inside the screens instead. */}
            {children}
          </main>

          <footer className={`border-t border-line px-5 py-6 ${isHome ? 'hidden' : ''}`}>
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-xs text-ink-muted">
              <span>Practice the conversation before it matters.</span>
              <div className="flex items-center gap-3">
                {demoMode && <Badge>Demo Mode</Badge>}
                <span>No real customer data</span>
              </div>
            </div>
          </footer>
      </>
    </div>
  );
}
