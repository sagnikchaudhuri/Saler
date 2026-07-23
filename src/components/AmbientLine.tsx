// ============================================================================
// A single hairline at the top of the roleplay, reflecting who currently holds
// the conversation. Derived entirely from existing engine/voice state — it
// starts nothing and subscribes to nothing.
//
//   idle      a quiet static line
//   customer  a slow travelling highlight while Rohan speaks
//   seller    a highlight from the other side while the mic is open
//   thinking  three settling dots while the engine evaluates/generates
// ============================================================================

export type AmbientState = 'idle' | 'customer' | 'seller' | 'thinking';

const DESCRIPTION: Record<AmbientState, string> = {
  idle: 'Waiting',
  customer: 'Rohan is speaking',
  seller: 'Listening to you',
  thinking: 'Thinking',
};

export function AmbientLine({ state }: { state: AmbientState }) {
  return (
    <div className="relative h-px w-full overflow-hidden bg-line" role="presentation">
      {state === 'customer' && (
        <span className="absolute inset-y-0 w-1/4 animate-ambient-drift bg-accent motion-reduce:animate-none motion-reduce:w-full motion-reduce:opacity-40" />
      )}
      {state === 'seller' && (
        <span className="absolute inset-y-0 w-1/4 animate-ambient-drift bg-ink motion-reduce:animate-none motion-reduce:w-full motion-reduce:opacity-30" />
      )}
      {state === 'thinking' && (
        <span className="absolute inset-y-0 left-0 w-full animate-pulse-soft bg-accent/40 motion-reduce:animate-none" />
      )}
      {/* Non-visual mirror of the same information. */}
      <span className="sr-only" aria-live="polite">
        {DESCRIPTION[state]}
      </span>
    </div>
  );
}
