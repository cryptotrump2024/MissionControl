import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-screen flex items-center justify-center bg-mc-bg-primary">
          <div className="mc-card max-w-lg w-full mx-4 text-center">
            <p className="text-3xl mb-3">⚠</p>
            <h2 className="text-lg font-bold text-mc-accent-red mb-2">Something went wrong</h2>
            <p className="text-xs text-mc-text-muted mb-4 font-mono break-all">
              {this.state.error?.message ?? 'Unknown error'}
            </p>
            <button className="mc-btn-primary text-sm" onClick={this.handleReset}>
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
