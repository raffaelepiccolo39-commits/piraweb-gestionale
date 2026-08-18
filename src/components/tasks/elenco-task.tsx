'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { formatDate, formatDateLocal, todayLocal, getPriorityTone, getStatusTone, stripHtml } from '@/lib/utils';
import { STATUS_LABELS, PRIORITY_LABELS } from '@/lib/constants';
import type { Task } from '@/types/database';
import { ListTodo, Calendar, Clock, ArrowRight, Sparkles, Archive, ArchiveRestore, ExternalLink } from 'lucide-react';

/**
 * L'elenco: ricerca e filtri su tutte le task.
 *
 * È la vista per ritrovare, non per smistare — l'altra metà della bacheca.
 * Estratta da /tasks quando le due pagine sono state unite.
 */

interface Props {
  tasks: Task[];
  /** Nasconde il nome dell'assegnatario quando si stanno guardando solo le proprie. */
  soloMie: boolean;
  /** ?group=sector dalla query: raggruppa per settore del cliente. */
  perSettore: boolean;
  initialFilterValues?: Record<string, string>;
  onApri: (task: Task) => void;
  onCambiaStato: (taskId: string, stato: string) => void;
  onArchivia: (taskId: string) => void;
  onRipristina: (taskId: string) => void;
  onVaiAlProgetto: (progettoId: string) => void;
}

// Il bordo colorato a sinistra dà lo stato a colpo d'occhio, senza leggere.
const BORDO_STATO: Record<string, string> = {
  todo: 'border-l-slate-400',
  in_progress: 'border-l-blue-400',
  review: 'border-l-amber-400',
  done: 'border-l-green-500',
};

function etichettaLink(url: string): string {
  if (url.includes('drive.google')) return 'Google Drive';
  if (url.includes('figma.com')) return 'Figma';
  if (url.includes('canva.com')) return 'Canva';
  return 'Link lavoro';
}

export function ElencoTask({
  tasks, soloMie, perSettore, initialFilterValues,
  onApri, onCambiaStato, onArchivia, onRipristina, onVaiAlProgetto,
}: Props) {
  return (
    <DataTable
      data={tasks}
      rowKey={(t) => t.id}
      columns={[]}
      variant="card"
      cardGridClassName="space-y-3"
      groupBy={perSettore ? (t) => {
        const client = (t.project as { client?: { sector?: string | null } } | undefined)?.client;
        return client?.sector?.trim() || '__none__';
      } : undefined}
      groupLabel={(key) => (key === '__none__' ? 'Senza settore' : key)}
      searchKeys={[
        (t) => t.title,
        (t) => stripHtml(t.description),
        (t) => (t.project as { name?: string } | undefined)?.name || '',
        (t) => (t.project as { client?: { company?: string; name?: string } } | undefined)?.client?.company || '',
      ]}
      searchPlaceholder="Cerca per titolo, descrizione, progetto o cliente…"
      initialFilterValues={initialFilterValues}
      filters={[
        {
          key: 'status',
          label: 'Tutti gli stati',
          options: [
            { value: 'todo', label: 'Da fare' },
            { value: 'in_progress', label: 'In corso' },
            { value: 'review', label: 'Review' },
            { value: 'done', label: 'Fatto' },
          ],
          accessor: (t) => t.status,
        },
        {
          key: 'priority',
          label: 'Tutte le priorità',
          options: [
            { value: 'low', label: 'Bassa' },
            { value: 'medium', label: 'Media' },
            { value: 'high', label: 'Alta' },
            { value: 'urgent', label: 'Urgente' },
          ],
          accessor: (t) => t.priority,
        },
        {
          key: 'deadline',
          label: 'Tutte le scadenze',
          options: [
            { value: 'overdue', label: 'Scadute' },
            { value: 'today', label: 'Scadenza oggi' },
            { value: 'week', label: 'Prossimi 7 giorni' },
            { value: 'month', label: 'Prossimi 30 giorni' },
          ],
          accessor: (t) => {
            if (!t.deadline) return '';
            const oggi = todayLocal();
            const d = (t.deadline as string).split('T')[0];
            if (d < oggi) return 'overdue';
            if (d === oggi) return 'today';
            const settimana = new Date();
            settimana.setDate(settimana.getDate() + 7);
            if (d <= formatDateLocal(settimana)) return 'week';
            const mese = new Date();
            mese.setDate(mese.getDate() + 30);
            if (d <= formatDateLocal(mese)) return 'month';
            return '';
          },
        },
      ]}
      emptyState={{
        icon: ListTodo,
        title: 'Nessun task',
        description: 'Non ci sono task con questi filtri. Usa "Crea Task con AI" per iniziare.',
      }}
      cardRender={(task) => {
        const progetto = task.project as { id: string; name: string; color: string } | undefined;
        const assegnatario = task.assignee as { id: string; full_name: string } | undefined;
        return (
          <Card hover onClick={() => onApri(task)} className={`cursor-pointer border-l-4 ${BORDO_STATO[task.status] ?? 'border-l-transparent'}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {progetto && (
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: progetto.color }} />
                    )}
                    <span className="text-xs text-pw-text-muted truncate">{progetto?.name || 'Cliente'}</span>
                    {assegnatario && !soloMie && (
                      <span className="text-xs text-pw-text-dim">· {assegnatario.full_name}</span>
                    )}
                    {task.ai_generated && <Sparkles size={10} className="text-pw-accent shrink-0" />}
                  </div>
                  <h3 className="font-medium text-pw-text mb-2">
                    <button
                      type="button"
                      onClick={() => onApri(task)}
                      className="text-left hover:text-pw-accent transition-colors duration-200 ease-out"
                    >
                      {task.title}
                    </button>
                  </h3>
                  {task.description && (
                    <p className="text-xs text-pw-text-muted mb-2 line-clamp-1">{stripHtml(task.description)}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={getStatusTone(task.status)} dot>{STATUS_LABELS[task.status]}</Badge>
                    <Badge tone={getPriorityTone(task.priority)}>{PRIORITY_LABELS[task.priority]}</Badge>
                    {task.deadline && (
                      <span className="flex items-center gap-1 text-xs text-pw-text-muted">
                        <Calendar size={12} />
                        {formatDate(task.deadline)}
                      </span>
                    )}
                    {task.estimated_hours && (
                      <span className="flex items-center gap-1 text-xs text-pw-text-muted">
                        <Clock size={12} />
                        {task.estimated_hours}h
                      </span>
                    )}
                    {task.delivery_url && (
                      <a
                        href={task.delivery_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-pw-accent hover:underline"
                      >
                        <ExternalLink size={12} />
                        {etichettaLink(task.delivery_url)}
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={task.status}
                    onChange={(e) => onCambiaStato(task.id, e.target.value)}
                    aria-label="Stato della task"
                    className="text-xs px-2 py-1 rounded-lg border border-pw-border bg-pw-surface-2 text-pw-text-muted"
                  >
                    {Object.entries(STATUS_LABELS)
                      .filter(([value]) => value !== 'archived')
                      .map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                  </select>
                  {task.archived_at ? (
                    <button
                      onClick={() => onRipristina(task.id)}
                      className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-pw-accent"
                      title="Ripristina task"
                    >
                      <ArchiveRestore size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => onArchivia(task.id)}
                      className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-pw-accent"
                      title="Archivia task"
                    >
                      <Archive size={16} />
                    </button>
                  )}
                  {progetto && (
                    <button
                      onClick={() => onVaiAlProgetto(progetto.id)}
                      className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2"
                      title="Vai al progetto"
                    >
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      }}
    />
  );
}
