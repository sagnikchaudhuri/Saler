import { useCallback, useEffect, useRef, useState } from 'react';
import { markIntroSeen } from './introSession';

// ============================================================================
// SALER intro.
//
// Renders as an OVERLAY above an already-mounted application. It never gates
// mounting, never fetches anything, and never touches providers, speech,
// voice, or persistence — if it fails or is skipped the product is simply
// there, fully interactive.
//
// Choreography (ms from mount):
//    0   white canvas
//  200   S      each letter arrives on its own, widely tracked
//  350   A
//  500   L
//  650   E
//  800   R
// 1200   letters converge into the wordmark  SALER
// 1500   tagline fades in
// 1900   hold
// 2100   letters disperse toward the regions of the interface they name —
//        S→scenario rail, A→conversation canvas, L→live coaching,
//        E→evaluation, R→report — while the canvas beneath is revealed
// 2700   overlay unmounts; nothing left to intercept input
// ============================================================================

export type IntroPhase = 'letters' | 'word' | 'tagline' | 'disperse' | 'done';

const LETTERS = [
  // Each letter's dispersal vector points at the part of the UI it stands for.
  { char: 'S', label: 'Scenario', x: '-42vw', y: '-30vh' },
  { char: 'A', label: 'Ask', x: '-14vw', y: '-34vh' },
  { char: 'L', label: 'Live coaching', x: '0vw', y: '30vh' },
  { char: 'E', label: 'Evaluation', x: '30vw', y: '-6vh' },
  { char: 'R', label: 'Report', x: '44vw', y: '-32vh' },
];

const ARRIVAL_MS = [200, 350, 500, 650, 800];

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

export function SalerIntro({
  onReveal,
  onDone,
}: {
  /** Fires when the letters begin dispersing, so the app can grow in. */
  onReveal: () => void;
  /** Fires when the overlay is finished and should be removed. */
  onDone: () => void;
}) {
  const reduced = useRef(prefersReducedMotion());
  const [phase, setPhase] = useState<IntroPhase>(reduced.current ? 'tagline' : 'letters');
  const finished = useRef(false);

  // Single exit path, safe to call twice (Skip + timer race, StrictMode).
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    markIntroSeen();
    onReveal();
    onDone();
  }, [onReveal, onDone]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    if (reduced.current) {
      // No travel, no convergence — a brief static wordmark, then the product.
      at(450, finish);
    } else {
      at(1200, () => setPhase('word'));
      at(1500, () => setPhase('tagline'));
      at(2100, () => {
        setPhase('disperse');
        onReveal();
      });
      at(2700, finish);
    }

    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [finish, onReveal]);

  const dispersing = phase === 'disperse';
  const converged = phase === 'word' || phase === 'tagline' || dispersing;

  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center bg-canvas transition-opacity duration-500 ${
        dispersing ? 'opacity-0' : 'opacity-100'
      }`}
      // Decorative: the product name is already the page's <h1> underneath.
      aria-hidden={phase === 'done'}
    >
      <div className="relative flex flex-col items-center px-6">
        <div
          className="flex items-baseline justify-center"
          aria-label="Saler"
          role="img"
        >
          {LETTERS.map((letter, i) => (
            <span
              key={letter.char}
              className="display block text-[13vw] leading-none sm:text-[8rem]"
              style={{
                // Wide tracking collapses to a tight wordmark on convergence.
                marginInline: converged ? '0.005em' : '0.11em',
                opacity: reduced.current ? 1 : undefined,
                transform: dispersing
                  ? `translate(${letter.x}, ${letter.y}) scale(0.35)`
                  : 'translate(0, 0) scale(1)',
                transition: reduced.current
                  ? 'none'
                  : 'margin 700ms cubic-bezier(0.22, 1, 0.36, 1), transform 620ms cubic-bezier(0.65, 0, 0.35, 1), opacity 500ms ease',
                animation: reduced.current
                  ? 'none'
                  : `intro-letter 420ms cubic-bezier(0.22, 1, 0.36, 1) ${ARRIVAL_MS[i]}ms both`,
              }}
            >
              {letter.char}
            </span>
          ))}
        </div>

        <p
          className={`mt-6 max-w-sm text-center text-base text-ink-secondary transition-opacity duration-500 sm:text-lg ${
            phase === 'tagline' || phase === 'disperse' || reduced.current
              ? 'opacity-100'
              : 'opacity-0'
          }`}
        >
          Practice the conversation before it matters.
        </p>
      </div>

      {/* Real, focusable control — first in the tab order, never trapped. */}
      <button
        type="button"
        onClick={finish}
        className="btn-quiet absolute bottom-8 right-8 text-xs"
      >
        Skip intro
      </button>
    </div>
  );
}
