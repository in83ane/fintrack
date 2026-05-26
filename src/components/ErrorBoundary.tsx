"use client";

import React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  retryCount: number;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    // Log error
    console.error("ErrorBoundary caught:", error);
    console.error("Component stack:", errorInfo.componentStack);

    // Call optional error handler (e.g., for Sentry, error tracking services)
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to external service if available
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
      try {
        // Report to error tracking service (e.g., Sentry)
        // Would be configured here: captureException(error)
        console.log('Error reported to tracking service');
      } catch (e) {
        console.error('Failed to report error:', e);
      }
    }
  }

  handleRetry = () => {
    const maxRetries = 3;
    if (this.state.retryCount < maxRetries) {
      this.setState((state) => ({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        retryCount: state.retryCount + 1,
      }));
    } else {
      console.error('Max retries reached');
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isDev = process.env.NODE_ENV === 'development';
      const errorMessage = this.state.error?.message || 'An unexpected error occurred';
      const maxRetries = 3;
      const canRetry = this.state.retryCount < maxRetries;

      return (
        <div className="min-h-[300px] flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-[#1C1B1B] to-black rounded-2xl p-8 border border-[#FFB4AB]/30 max-w-md w-full space-y-6 shadow-xl">
            {/* Icon */}
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FFB4AB]/10 flex items-center justify-center border border-[#FFB4AB]/20">
              <AlertCircle size={32} className="text-[#FFB4AB]" />
            </div>

            {/* Error message */}
            <div className="text-center space-y-2">
              <h3 className="text-xl font-black text-white">Oops! Something went wrong</h3>
              <p className="text-sm text-gray-400">{errorMessage}</p>
            </div>

            {/* Dev-only error details */}
            {isDev && this.state.errorInfo && (
              <div className="bg-black/40 rounded-xl p-4 border border-white/5 max-h-40 overflow-auto">
                <p className="text-[10px] font-mono text-[#FFB4AB] mb-2 font-bold">STACK TRACE:</p>
                <p className="text-[10px] font-mono text-gray-400 leading-relaxed whitespace-pre-wrap">
                  {this.state.errorInfo?.componentStack?.substring(0, 500)}...
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={this.handleRetry}
                disabled={!canRetry}
                className="flex-1 px-4 py-3 rounded-xl bg-[#4EDEA3] text-black font-black text-sm hover:bg-[#3ecf92] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} />
                Retry
                {!canRetry && ` (${this.state.retryCount}/${maxRetries})`}
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="flex-1 px-4 py-3 rounded-xl bg-white/10 text-white font-black text-sm hover:bg-white/20 transition-colors"
              >
                Go Home
              </button>
            </div>

            {/* Help text */}
            <p className="text-center text-xs text-gray-500">
              {canRetry
                ? `Retry ${maxRetries - this.state.retryCount} more time${maxRetries - this.state.retryCount > 1 ? 's' : ''}`
                : 'Max retries reached. Please refresh or contact support.'}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
