import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected application error' };
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendly = `Database operation (${parsed.operationType}) failed on ${parsed.path}: ${parsed.error}`;
        }
      } catch {
        // Non-JSON error message
      }

      return (
        <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-neutral-200 rounded-xl p-8">
            <h1 className="text-xl font-semibold text-neutral-900">Something went wrong</h1>
            <p className="mt-2 text-sm text-neutral-600 leading-relaxed break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2 text-sm font-medium text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors cursor-pointer"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
