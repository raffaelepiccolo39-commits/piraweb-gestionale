'use client';

import React from 'react';
import { reportUnknown } from '@/lib/report-error';

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

    // Prima finiva qui e basta: l'errore restava nella console del browser
    // dell'utente e non lo vedeva nessuno. Ora arriva in error_logs.
    reportUnknown(error, 'boundary', {
      componentStack: errorInfo.componentStack?.slice(0, 4000) ?? null,
    });
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
