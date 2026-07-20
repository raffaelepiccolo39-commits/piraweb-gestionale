'use client';

import { ToastProvider } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PortalGate } from '@/components/portale/portal-gate';
import { PortalShell } from '@/components/portale/portal-shell';

/**
 * Layout del portale clienti.
 *
 * Deliberatamente separato da quello del gestionale: niente sidebar, niente
 * Header interno, niente AttendanceGate (che aspetta un profilo del team e
 * lascerebbe il cliente su uno spinner infinito). Mobile-first, perché il
 * cliente lo aprirà dal telefono.
 */
export default function PortaleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <PortalGate>
          <PortalShell>{children}</PortalShell>
        </PortalGate>
      </ErrorBoundary>
    </ToastProvider>
  );
}
