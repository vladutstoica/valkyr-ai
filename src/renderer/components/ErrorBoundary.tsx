import React from 'react';
import { captureComponentError } from '../lib/errorTracking';

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

type ErrorBoundaryProps = {
  children?: React.ReactNode;
  componentName?: string;
  /** 'page' = full-screen crash (default), 'panel' = compact inline fallback */
  variant?: 'page' | 'panel';
};

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      // Track error with PostHog
      captureComponentError(error, this.props.componentName || 'App', {
        component_stack: info.componentStack,
        error_boundary: true,
        severity: 'critical',
      });

      // Also log to app logger if available
      void import('../lib/logger').then(({ log }) => {
        try {
          log.error('Renderer crash caught by ErrorBoundary', { error, info });
        } catch {}
      });
    } catch {}
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch {}
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children as React.ReactElement;

    const message = this.state.error?.message || 'An unexpected error occurred.';
    const variant = this.props.variant ?? 'page';
    const label = this.props.componentName || 'This section';

    if (variant === 'panel') {
      return (
        <div className="text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-2 p-4">
          <p className="text-sm font-medium">{label} crashed</p>
          <p className="max-w-sm text-center text-xs break-all opacity-70">{message}</p>
          <button
            type="button"
            className="border-input bg-secondary text-secondary-foreground mt-2 inline-flex h-7 items-center justify-center rounded-sm border px-3 text-xs font-medium"
            onClick={this.handleRetry}
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="bg-background flex h-screen w-screen items-center justify-center p-6">
        <div className="border-border bg-card text-card-foreground max-w-xl rounded-none border p-6 shadow-xs">
          <h1 className="mb-2 text-lg font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground mb-4 text-sm break-all">{message}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="border-input bg-primary text-primary-foreground inline-flex h-9 items-center justify-center rounded-none border px-4 text-sm font-medium shadow-xs"
              onClick={this.handleReload}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
