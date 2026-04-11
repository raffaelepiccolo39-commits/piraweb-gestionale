'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ToastProvider } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden" role="dialog" aria-modal="true" aria-label="Menu di navigazione">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <Sidebar collapsed={false} onToggle={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <div
        className={cn(
          'sidebar-transition',
          sidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-[260px]'
        )}
      >
        <Header
          onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
          mobileMenuOpen={mobileMenuOpen}
        />
        <main id="main-content" className="p-4 lg:p-6 min-w-0 overflow-x-hidden">{children}</main>
      </div>
    </div>
    </ToastProvider>
  );
}
