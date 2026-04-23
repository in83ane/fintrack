"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: undefined,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#131313] text-white p-6">
          <div className="max-w-md w-full bg-[#1C1B1B] border border-white/10 rounded-2xl p-8">
            <h1 className="text-2xl font-bold mb-4 text-[#FFB4AB]">Something went wrong</h1>
            <p className="text-gray-400 mb-6">
              An error occurred while rendering this page. Please try refreshing or contact support if the problem persists.
            </p>
            {this.state.error && (
              <details className="text-sm text-gray-500">
                <summary className="cursor-pointer mb-2">Error details</summary>
                <pre className="whitespace-pre-wrap text-xs bg-[#131313] p-3 rounded">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-6 w-full bg-[#ADC6FF] text-[#131313] font-semibold py-3 rounded-lg hover:bg-[#ADC6FF]/90 transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
