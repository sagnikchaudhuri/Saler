import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SECTIONS,
  SECTION_ORDER,
  LETTER_SHADOW,
  type SectionId,
} from '../nav/sections';
import {
  dockScale,
  focusFromPointer,
  letterStyle,
  HOME_DOCK,
  COMPACT_DOCK,
} from '../nav/dock';

// ============================================================================
// SALER as navigation — one component, one mounted instance, two visual states.
//
//   home     large, widely spaced, centred. The letters ARE the entrance.
//   compact  the same letters docked into a quiet bar at the top of the app.
//
// There is no second navbar component to cross-fade with. SalerShell keeps
// exactly one of these mounted and animates `letterSize` across the boundary,
// so the homepage letters physically become the navbar rather than handing off
// to a look-alike.
//
// Selecting a letter never reloads or resets state — App only changes which
// viewpoint is shown. Keyboard: arrows move between letters, Enter/Space open.
// Escape does nothing here: the homepage is not a place you can go back to.
// Motion respects the global reduced-motion rule in index.css.
// ============================================================================

export type SalerNavPreviews = Partial<Record<SectionId, string[]>>;

export function SalerNav({
  mode,
  active,
  onSelect,
  previews,
  letterSize,
  transitionMs = 0,
}: {
  mode: 'home' | 'compact';
  /** Current section, or null on the homepage where nothing is current yet. */
  active: SectionId | null;
  onSelect: (id: SectionId) => void;
  previews?: SalerNavPreviews;
  /** Font size of the letters; animated by the shell during the dock. */
  letterSize: string;
  /** Duration of the home→compact size change, 0 outside the transition. */
  transitionMs?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isHome = mode === 'home';
  const cfg = isHome ? HOME_DOCK : COMPACT_DOCK;

  // Continuous position on the letter axis, from pointer or keyboard focus.
  const [focus, setFocus] = useState<number | null>(null);

  const buttons = useCallback(
    () =>
      Array.from(
        containerRef.current?.querySelectorAll<HTMLButtonElement>('button[data-letter]') ?? [],
      ),
    [],
  );

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const centers = buttons().map((b) => {
      const r = b.getBoundingClientRect();
      return r.left + r.width / 2;
    });
    setFocus(focusFromPointer(e.clientX, centers));
  };

  const focusLetter = (index: number) => {
    const list = buttons();
    if (list.length === 0) return;
    list[(index + list.length) % list.length]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = SECTION_ORDER.indexOf(
      (e.target as HTMLElement)?.getAttribute?.('data-letter') as SectionId,
    );
    if (idx < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusLetter(idx + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusLetter(idx - 1);
    }
  };

  // Keep the current letter visible when the row scrolls horizontally on a
  // narrow screen. Guarded: jsdom has no scrollIntoView on every element.
  useEffect(() => {
    if (!active) return;
    const row = containerRef.current;
    // Only when the row genuinely scrolls, so a non-scrolling navbar can never
    // be nudged sideways (or drag the page with it).
    if (!row || row.scrollWidth <= row.clientWidth) return;
    const el = row.querySelector<HTMLElement>(`button[data-letter="${active}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }, [active]);

  return (
    <div
      ref={containerRef}
      role={isHome ? 'group' : 'navigation'}
      aria-label={isHome ? 'Choose where to begin' : 'Saler sections'}
      onKeyDown={onKeyDown}
      onPointerMove={onPointerMove}
      onPointerLeave={() => setFocus(null)}
      // Focus leaving the whole row (not just moving between letters) rests it.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(null);
      }}
      className={
        // `overflow-x-auto` also clips vertically, so the row needs bottom
        // padding deep enough to contain the absolutely-positioned labels —
        // otherwise they are silently cut off on a narrow screen.
        isHome
          ? 'flex snap-x snap-mandatory items-end justify-start overflow-x-auto px-1 pb-11 sm:justify-center sm:overflow-visible sm:px-4 sm:pb-10'
          // Five single letters always fit: no scrolling, so nothing can be
          // scrolled out of reach and the navbar width stays stable.
          : 'flex shrink-0 items-end justify-center'
      }
    >
      {SECTIONS.map((sec, i) => {
        const isActive = sec.id === active;
        const scale = dockScale(i, focus, cfg);
        const lines = isHome ? (previews?.[sec.id] ?? []) : [];

        return (
          <button
            key={sec.id}
            type="button"
            data-letter={sec.id}
            data-scale={scale.toFixed(3)}
            onClick={() => onSelect(sec.id)}
            // Touch has no hover: a press magnifies, matching the pointer feel.
            onPointerDown={() => setFocus(i)}
            onFocus={() => setFocus(i)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={isHome ? `Open ${sec.name}` : sec.name}
            style={{
              ...letterStyle(scale, cfg),
              fontSize: letterSize,
              transitionDuration: transitionMs > 0 ? `${transitionMs}ms` : undefined,
            }}
            className={[
              'group relative flex shrink-0 snap-center flex-col items-center outline-none',
              // The two properties that make the dock: a visual lift and the
              // horizontal room that stops magnified letters colliding.
              'origin-bottom [transform:scale(var(--dock-s))]',
              '[padding-inline:calc((var(--dock-s)_-_1)_*_var(--dock-pad))]',
              'transition-[transform,padding,font-size] ease-[cubic-bezier(0.22,1,0.36,1)]',
              transitionMs > 0 ? '' : '[transition-duration:var(--dock-ms)]',
              // Homepage letters are widely spaced; the gap also has to clear
              // the section labels beneath them, the longest of which is
              // "Report Logs".
              // On a narrow screen each cell is at least as wide as its label,
              // so labels can never collide; the row then scroll-snaps, which
              // is the documented mobile behaviour. Desktop needs no minimum.
              // On a narrow screen every cell is as wide as its (wrapped)
              // label, so labels cannot collide and all five letters still read
              // as one word. Desktop needs no minimum.
              isHome ? 'mx-0.5 min-w-[4rem] sm:mx-7 sm:min-w-0' : 'mx-0.5 sm:mx-1',
            ].join(' ')}
          >
            {/* The letter, with its own grounded shadow-copy behind it. */}
            <span className="relative block leading-none">
              <span
                aria-hidden
                className={[
                  'display absolute inset-0 select-none leading-none transition-all',
                  '[transition-duration:var(--dock-ms)]',
                  // Soft and low-contrast: a letter resting on paper, not a
                  // second copy of the letter printed behind the first.
                  isHome ? 'text-ink/[0.07] blur-[6px]' : 'text-ink/[0.05] blur-[2px]',
                  'group-hover:text-accent/20 group-focus-visible:text-accent/20',
                ].join(' ')}
                style={{ transform: LETTER_SHADOW[sec.id] }}
              >
                {sec.letter}
              </span>
              <span
                className={[
                  'display relative block leading-none transition-colors',
                  '[transition-duration:var(--dock-ms)]',
                  isActive
                    ? 'font-semibold text-accent'
                    : 'text-ink group-hover:text-ink group-focus-visible:text-accent',
                ].join(' ')}
              >
                {sec.letter}
              </span>
            </span>

            {/* Current-section marker. Never colour alone: a dot carries the
                same meaning for anyone who cannot separate blue from black,
                and it survives another letter being hovered. */}
            <span
              aria-hidden
              className={[
                'absolute -bottom-1 h-1 w-1 rounded-full bg-accent transition-opacity',
                '[transition-duration:var(--dock-ms)]',
                isActive ? 'opacity-100' : 'opacity-0',
              ].join(' ')}
            />

            {/* Section label. Absolutely positioned so fading it out during the
                dock cannot change the navbar's height. */}
            <span
              className={[
                'pointer-events-none absolute top-full mt-3 text-[9px] font-medium leading-tight',
                'w-16 uppercase tracking-[0.04em] transition-opacity duration-300',
                'sm:w-auto sm:whitespace-nowrap sm:text-xs sm:tracking-[0.12em]',
                isHome ? 'opacity-100' : 'opacity-0',
                isActive ? 'text-accent' : 'text-ink-muted',
                'group-hover:text-accent group-focus-visible:text-accent',
              ].join(' ')}
            >
              {sec.label}
            </span>

            {/* Real-state preview, revealed on hover/focus. Homepage only. */}
            {lines.length > 0 && (
              <span className="pointer-events-none absolute top-full mt-10 flex w-max max-w-[40vw] flex-col items-center gap-0.5 rounded-lg border border-line bg-canvas px-3 py-2 text-center text-xs text-ink-secondary opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:max-w-[16rem]">
                {lines.map((line, li) => (
                  <span key={li} className={li === 0 ? 'font-medium text-ink' : ''}>
                    {line}
                  </span>
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
