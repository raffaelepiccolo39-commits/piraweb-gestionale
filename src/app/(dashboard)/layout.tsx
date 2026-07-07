'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ToastProvider } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { VersionWatcher } from '@/components/version-watcher';
import { AttendanceGate } from '@/components/layout/attendance-gate';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
    </div>
    </ToastProvider>
  );
}
