// frontend/src/components/errors/AppErrorBoundary.jsx
import React from "react";

function AppErrorFallback({ onRetry, onReload, onGoHome }) {
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-[32px] border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-rose-50 text-3xl">
            ⚠️
          </div>

          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900">
            Something went wrong
          </h1>

          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
            The app encountered an unexpected interface error. Your data is safe, but this screen
            could not be rendered correctly.
          </p>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Try again
            </button>

            <button
              type="button"
              onClick={onReload}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Reload app
            </button>

            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Go to Feed
            </button>
          </div>

          <p className="mt-6 text-xs leading-5 text-slate-400">
            If the problem persists, refresh the page or sign in again.
          </p>
        </section>
      </div>
    </div>
  );
}

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false
    };
  }

  static getDerivedStateFromError() {
    return {
      hasError: true
    };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.error("[AppErrorBoundary] Render error caught:", error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({
      hasError: false
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.assign("/feed");
  };

  render() {
    if (this.state.hasError) {
      return (
        <AppErrorFallback
          onRetry={this.handleRetry}
          onReload={this.handleReload}
          onGoHome={this.handleGoHome}
        />
      );
    }

    return this.props.children;
  }
}