import { SalerNav, type SalerNavPreviews } from './SalerNav';
import { Badge } from './ui';
import type { SectionId } from '../nav/sections';

// The root experience: SALER at rest, each letter a doorway. White, spacious,
// editorial. The letters here are the same nav that lives compacted at the top
// of every section — entering one is a change of viewpoint, not a page load.
export function CarouselHome({
  onSelect,
  previews,
  demoMode,
}: {
  onSelect: (id: SectionId) => void;
  previews: SalerNavPreviews;
  demoMode: boolean;
}) {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <div className="flex items-center justify-between px-6 py-6">
        <span className="text-sm text-ink-muted">Saler</span>
        {demoMode && <Badge>Demo Mode</Badge>}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-16 py-10">
        <SalerNav variant="carousel" active={null} onSelect={onSelect} previews={previews} />
        <p className="max-w-sm px-6 text-center text-base text-ink-secondary">
          Practice the conversation before it matters.
        </p>
      </div>

      <div className="px-6 py-6 text-center text-xs text-ink-muted">
        Pick a letter to begin — or press Enter on Scenario.
      </div>
    </div>
  );
}
