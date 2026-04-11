'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-red-400 text-sm">
              Si è verificato un errore nel caricamento di questo componente.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-2 text-xs text-red-400 underline hover:text-red-300"
            >
              Riprova
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
