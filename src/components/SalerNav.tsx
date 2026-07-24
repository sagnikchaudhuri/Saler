import { useRef } from 'react';
import {
  SECTIONS,
  SECTION_ORDER,
  LETTER_SHADOW,
  type SectionId,
} from '../nav/sections';

// ============================================================================
// SALER as navigation.
//
// One component, two variants:
//   carousel  large editorial letters on the homepage, each a doorway with a
//             real-state preview on hover/focus.
//   compact   a quiet S A L E R rail at the top of every section; the active
//             letter is larger and accent-coloured, the rest grey.
//
// Selecting a letter never reloads or resets state — App simply changes which
// viewpoint is shown. Keyboard: arrows move between letters, Enter/Space opens
// (native button behaviour), Escape (compact only) returns to the carousel.
// Motion is handled by the global reduced-motion rule in index.css.
// ============================================================================

export type SalerNavPreviews = Partial<Record<SectionId, string[]>>;

export function SalerNav({
  variant,
  active,
  onSelect,
  onExpand,
  previews,
}: {
  variant: 'carousel' | 'compact';
  active: SectionId | null;
  onSelect: (id: SectionId) => void;
  /** compact only: return to the full carousel. */
  onExpand?: () => void;
  previews?: SalerNavPreviews;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const focusLetter = (index: number) => {
    const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[data-letter]',
    );
    if (!buttons) return;
    const clamped = (index + buttons.length) % buttons.length;
    buttons[clamped]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = SECTION_ORDER.indexOf(
      (e.target as HTMLElement)?.getAttribute?.('data-letter') as SectionId,
    );
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      focusLetter(idx + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusLetter(idx - 1);
    } else if (e.key === 'Escape' && variant === 'compact') {
      e.preventDefault();
      onExpand?.();
    }
  };

  if (variant === 'compact') {
    return (
      <nav
        ref={containerRef}
        aria-label="Saler sections"
        onKeyDown={onKeyDown}
        className="flex items-center gap-1"
      >
        {SECTIONS.map((sec) => {
          const isActive = sec.id === active;
          return (
            <button
              key={sec.id}
              type="button"
              data-letter={sec.id}
              onClick={() => onSelect(sec.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={sec.name}
              className={`display rounded px-1.5 leading-none transition-[color,font-size] duration-300 ${
                isActive
                  ? 'text-[22px] text-accent'
                  : 'text-[15px] text-ink-muted hover:text-ink-secondary'
              }`}
            >
              {sec.letter}
            </button>
          );
        })}
      </nav>
    );
  }

  // --- carousel ---
  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Choose where to begin"
      onKeyDown={onKeyDown}
      className="flex snap-x snap-mandatory items-end justify-start gap-2 overflow-x-auto px-6 pb-2 sm:justify-center sm:gap-6 sm:overflow-visible"
    >
      {SECTIONS.map((sec) => {
        const lines = previews?.[sec.id] ?? [];
        return (
          <button
            key={sec.id}
            type="button"
            data-letter={sec.id}
            onClick={() => onSelect(sec.id)}
            aria-label={`Open ${sec.name}`}
            className="group relative flex shrink-0 snap-center flex-col items-center outline-none"
          >
            {/* The letter, with its own soft shadow-copy behind it. */}
            <span className="relative block">
              <span
                aria-hidden
                className="display absolute inset-0 select-none text-[18vw] leading-none text-ink/10 blur-[1px] transition-all duration-300 group-hover:text-accent/20 group-focus-visible:text-accent/20 sm:text-[8rem]"
                style={{ transform: LETTER_SHADOW[sec.id] }}
              >
                {sec.letter}
              </span>
              <span className="display relative block text-[18vw] leading-none text-ink transition-transform duration-300 group-hover:-translate-y-1 group-focus-visible:-translate-y-1 sm:text-[8rem]">
                {sec.letter}
              </span>
            </span>

            <span className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-ink-muted transition-colors duration-300 group-hover:text-accent group-focus-visible:text-accent">
              {sec.label}
            </span>

            {/* Real-state preview, revealed on hover/focus. */}
            {lines.length > 0 && (
              <span
                className="pointer-events-none absolute top-full mt-2 flex w-max max-w-[40vw] flex-col items-center gap-0.5 rounded-lg border border-line bg-canvas px-3 py-2 text-center text-xs text-ink-secondary opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:max-w-[16rem]"
              >
                {lines.map((line, i) => (
                  <span key={i} className={i === 0 ? 'font-medium text-ink' : ''}>
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
