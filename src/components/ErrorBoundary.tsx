import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-6">
          <div className="max-w-2xl w-full bg-zinc-900 border border-red-800 rounded-lg p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4 text-red-500 border-b border-red-900/50 pb-4">
              <AlertTriangle className="h-8 w-8" />
              <h1 className="text-2xl font-bold">Application Crashed</h1>
            </div>

            <div className="space-y-4">
              <p className="text-zinc-300">
                Something went wrong and the application could not render.
              </p>

              {this.state.error && (
                <div className="bg-black/50 p-4 rounded-md border border-zinc-800 overflow-auto max-h-64">
                  <p className="text-red-400 font-mono font-bold mb-2">
                    {this.state.error.toString()}
                  </p>
                  <pre className="text-xs text-zinc-500 font-mono whitespace-pre-wrap">
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </div>
              )}

              <button
                onClick={() => window.location.reload()}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors"
                type="button"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
