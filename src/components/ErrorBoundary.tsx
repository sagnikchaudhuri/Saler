import { Component, type ErrorInfo, type ReactNode } from 'react';

// ============================================================================
// Top-level error containment.
//
// A render or effect error anywhere in the tree would otherwise leave a blank
// white page. This boundary catches it and shows a minimal, branded recovery
// screen instead. It is deliberately self-contained: no providers, no hooks, no
// app state — so it can still render when everything below it has failed.
//
// The user never sees a stack trace or any internal detail. In development the
// error is logged to the console for debugging; in production nothing is
// surfaced or stored.
// ============================================================================

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Development-only diagnostics. Never shown in the UI, never persisted.
    if (import.meta.env.DEV) {
      console.error('[Saler] Uncaught error:', error, info.componentStack);
    }
  }

  private reload = (): void => {
    try {
      window.location.reload();
    } catch {
      // Nothing more we can safely do.
    }
  };

  private restart = (): void => {
    // Return to a safe start: drop this browser session's entry/intro flags so
    // the app re-opens on the landing page, then reload. Never touches saved
    // Report Logs.
    try {
      sessionStorage.removeItem('saler.entered');
      sessionStorage.removeItem('saler.intro.seen');
    } catch {
      // Storage may be unavailable; the reload alone is still useful.
    }
    this.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-center"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Saler</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-ink">
          Something went wrong.
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-secondary">
          The app hit an unexpected error and stopped to keep your saved report logs safe. Reloading
          usually fixes it.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {/* autoFocus so keyboard users land on the primary recovery action. */}
          <button type="button" className="btn-primary" onClick={this.reload} autoFocus>
            Reload application
          </button>
          <button type="button" className="btn-ghost" onClick={this.restart}>
            Return to start
          </button>
        </div>
      </div>
    );
  }
}
