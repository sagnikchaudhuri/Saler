import { useEffect } from 'react';

// ============================================================================
// beforeunload guard for an active, unsaved call.
//
// A roleplay in progress lives only in memory — only COMPLETED sessions are
// persisted — so a refresh or tab close would silently discard it. When (and
// only when) there is meaningful unsaved call state, we install a
// beforeunload handler so the browser shows its native "leave site?" prompt.
//
// It installs nothing while idle, after completion, or while browsing reports,
// and always removes the handler on cleanup. It stores no secrets and no audio.
// ============================================================================

export function useUnloadGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      // The modern way to request the native confirmation dialog.
      e.preventDefault();
      // Legacy browsers require a returnValue to be set (the string is ignored
      // by modern browsers, which show their own generic message).
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
