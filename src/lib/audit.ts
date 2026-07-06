import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export type AuditAction =
  | 'user.created'
  | 'user.role_changed'
  | 'user.activated'
  | 'user.deactivated'
  | 'user.terminated'
  | 'user.reinstated'
  | 'user.invite_resent'
  | 'user.welcome_sent'
  | 'user.password_changed'
  | 'user.deleted'
  | 'invoice.sent_to_sdi'
  | 'invoice.deleted'
  | 'contract.created'
  | 'contract.deleted'
  | 'client.deleted'
  | 'export.downloaded';

export interface AuditEntry {
  action: AuditAction;
  actorId: string | null;
  actorEmail?: string | null;
  entityType?: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  request?: NextRequest | null;
}

/**
 * Scrive un record nell'audit log. Non blocca mai la chiamata principale:
 * se il log fallisce, manda l'errore a Sentry e continua.
 *
 * Usa il service role per bypassare RLS (la tabella ha solo policy SELECT
 * per admin).
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const supabase = await createServiceRoleClient();
    const ip = entry.request?.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || entry.request?.headers.get('x-real-ip')
      || null;
    const ua = entry.request?.headers.get('user-agent') || null;

    await supabase.from('audit_log').insert({
      user_id: entry.actorId,
      user_email: entry.actorEmail ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      details: entry.details ?? {},
      ip_address: ip,
      user_agent: ua,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { stage: 'audit_log_write' }, extra: { action: entry.action } });
  }
}
