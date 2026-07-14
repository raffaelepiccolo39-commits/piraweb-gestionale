'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ToastProvider } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ErrorReporter } from '@/components/error-reporter';
import { VersionWatcher } from '@/components/version-watcher';
import { AttendanceGate } from '@/components/layout/attendance-gate';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/database';

/**
 * Guscio client della dashboard.
 *
 * Riceve il profilo già caricato dal server e lo mette nello store PRIMA che i
 * figli facciano il loro primo render. È il punto di tutta l'operazione: le
 * pagine sono tutte protette da `if (!profile) return`, quindi finché il
 * profilo non c'era non partiva nemmeno una query. Prima il profilo arrivava
 * dopo due giri di rete dal browser (getUser + fetch profilo), e per tutto
 * quel tempo la pagina restava vuota.
 */
export function DashboardShell({
  initialProfile,
  children,
}: {
  initialProfile: Profile | null;
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Lazy initializer: gira una volta sola, durante il primo render di questo
  // componente e quindi prima del render dei figli. Al loro primo render il
  // profilo è già nello store e possono partire subito con le query.
  useState(() => {
    if (initialProfile) {
      useAuthStore.setState({
        profile: initialProfile,
        isLoading: false,
        _hydrated: true,
      });
    }
  });

  return (
    <ToastProvider>
    <div className="min-h-screen bg-pw-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-pw-accent focus:text-pw-bg focus:font-semibold focus:text-sm"
      >
        Vai al contenuto principale
      </a>

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Il menu mobile è ora autonomo dentro l'Header (MobileMenu) */}

      {/* Main content */}
      <div
        className={cn(
          'sidebar-transition',
          sidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-[240px]'
        )}
      >
        <Header />
        <main id="main-content" className="p-4 lg:p-6 xl:p-8 min-w-0">
          <ErrorBoundary>
            <AttendanceGate>{children}</AttendanceGate>
          </ErrorBoundary>
        </main>
      </div>
      <VersionWatcher />
      <ErrorReporter />
    </div>
    </ToastProvider>
  );
}
