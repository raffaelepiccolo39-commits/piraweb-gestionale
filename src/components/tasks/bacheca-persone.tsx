'use client';

import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { formatDate, getInitials, getStatusBarColor, getStatusColor, getContrastTextColor } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/constants';
import type { Task, Profile } from '@/types/database';
import { Plus, Calendar, AlertTriangle, Sparkles, Archive } from 'lucide-react';

/**
 * La bacheca: una colonna per persona, più la colonna degli urgenti.
 *
 * Non è un kanban per stato — quello lo fa la scheda del progetto. Qui le
 * colonne sono le persone, e trascinare una card significa riassegnare il
 * lavoro. È la vista per smistare, non per seguire l'avanzamento.
 *
 * Estratta da /bacheca quando le due pagine sono state unite: la logica di
 * scrittura resta nella pagina, qui c'è solo come si vede.
 */

interface Props {
  tasks: Task[];
  membri: Profile[];
  isAdmin: boolean;
  onApri: (task: Task) => void;
  onArchivia: (taskId: string) => void;
  onAggiungi: (membroId: string | null) => void;
  onSposta: (result: DropResult) => void;
}

/** Assegnatari: la junction task_assignees, con fallback su assigned_to per le task vecchie. */
export function assegnatariDi(t: Task): string[] {
  const righe = (t as unknown as { task_assignees?: { user_id: string }[] }).task_assignees || [];
  const ids = righe.map((r) => r.user_id).filter(Boolean);
  if (ids.length > 0) return ids;
  return t.assigned_to ? [t.assigned_to] : [];
}

const nomeCliente = (task: Task): string => {
  const p = task.project as { name: string; client?: { name: string; company: string | null } } | undefined;
  return p?.client?.company || p?.client?.name || p?.name || '';
};
const logoCliente = (task: Task): string | null =>
  (task.project as { client?: { logo_url?: string | null } } | undefined)?.client?.logo_url || null;
const coloreProgetto = (task: Task): string =>
  (task.project as { color: string } | undefined)?.color || '#FFD108';
const inRitardo = (task: Task): boolean =>
  !!task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';

function CardTask({
  task, index, completata, onApri, onArchivia,
}: {
  task: Task; index: number; completata?: boolean;
  onApri: (t: Task) => void; onArchivia: (id: string) => void;
}) {
  const contenuto = (
    <div
      onClick={() => onApri(task)}
      style={{ borderLeftWidth: 4, borderLeftColor: getStatusBarColor(task.status) }}
      className={`p-3 rounded-xl border transition-all duration-200 ease-out mb-2 cursor-pointer ${
        completata
          ? 'border-green-500/20 bg-green-500/5 opacity-60'
          : 'border-pw-border bg-pw-surface-2 hover:border-pw-border-hover'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {logoCliente(task) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoCliente(task) as string}
            alt={nomeCliente(task)}
            className="mt-0.5 shrink-0 w-10 h-10 rounded-md object-contain p-1 border border-pw-border bg-white"
          />
        ) : (
          <div
            className="mt-0.5 shrink-0 w-10 h-10 rounded-md flex items-center justify-center text-[11px] font-bold"
            style={{ backgroundColor: coloreProgetto(task), color: getContrastTextColor(coloreProgetto(task)) }}
            title={nomeCliente(task)}
          >
            {getInitials(nomeCliente(task) || '—')}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-xs truncate uppercase font-medium ${completata ? 'text-pw-text-dim' : 'text-pw-text-muted'}`}>
              {nomeCliente(task)}
            </p>
            {task.ai_generated && <Sparkles size={10} className="text-pw-accent shrink-0" />}
          </div>
          <p className={`text-sm font-medium mt-0.5 leading-snug ${completata ? 'text-pw-text-dim line-through' : 'text-pw-text'}`}>
            {task.title}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onArchivia(task.id); }}
          className="shrink-0 -mt-0.5 -mr-0.5 p-1 rounded-md text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-3 transition-colors"
          title="Archivia task"
          aria-label="Archivia task"
        >
          <Archive size={13} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${getStatusColor(task.status)}`}>
          {STATUS_LABELS[task.status] || task.status}
        </span>
        {task.deadline && (
          <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md ${
            inRitardo(task) ? 'bg-red-500/15 text-red-400' : 'bg-pw-surface-3 text-pw-text-muted'
          }`}>
            <Calendar size={10} />
            {formatDate(task.deadline)}
          </span>
        )}
        {task.priority === 'urgent' && (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400">
            <AlertTriangle size={10} />
            Urgente
          </span>
        )}
      </div>
    </div>
  );

  // Le completate restano visibili in fondo alla colonna ma non si trascinano:
  // spostare una cosa già fatta non vuol dire niente.
  if (completata) return contenuto;

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={snapshot.isDragging ? 'shadow-lg shadow-pw-accent/10' : ''}
        >
          {contenuto}
        </div>
      )}
    </Draggable>
  );
}

export function BachecaPersone({ tasks, membri, isAdmin, onApri, onArchivia, onAggiungi, onSposta }: Props) {
  const perColonna = (membroId: string, fatte: boolean) =>
    tasks
      .filter((t) => assegnatariDi(t).includes(membroId) && t.priority !== 'urgent' && (t.status === 'done') === fatte)
      .sort((a, b) => a.position - b.position);

  const urgenti = (fatte: boolean) =>
    tasks.filter((t) => t.priority === 'urgent' && (t.status === 'done') === fatte)
      .sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-4">
      {/* La striscia colorata a sinistra di ogni card dice lo stato. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-pw-text-muted">
        {[
          { status: 'todo', label: 'Da fare' },
          { status: 'in_progress', label: 'In corso' },
          { status: 'review', label: 'Review' },
          { status: 'done', label: 'Fatto' },
        ].map((s) => (
          <span key={s.status} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: getStatusBarColor(s.status) }} />
            {s.label}
          </span>
        ))}
      </div>

      <DragDropContext onDragEnd={onSposta}>
        <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
          {membri.filter((m) => m.role !== 'admin' || isAdmin).map((membro) => {
            const attive = perColonna(membro.id, false);
            const fatte = perColonna(membro.id, true);
            return (
              <div key={membro.id} className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: membro.color || '#ff4d1c' }}>
                      <span className="text-[9px] font-bold" style={{ color: getContrastTextColor(membro.color || '#ff4d1c') }}>
                        {getInitials(membro.full_name)}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-pw-text uppercase tracking-wide">
                        {membro.full_name.split(' ')[0]}
                      </p>
                      <p className="text-[10px] text-pw-text-dim">{attive.length} task</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onAggiungi(membro.id)}
                    className="p-1 rounded-lg text-pw-text-dim hover:text-pw-accent hover:bg-pw-surface-2 transition-colors duration-200 ease-out"
                    aria-label={`Aggiungi una task per ${membro.full_name}`}
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <Droppable droppableId={membro.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[200px] p-2 rounded-xl border transition-colors duration-200 ease-out ${
                        snapshot.isDraggingOver ? 'border-pw-accent/30 bg-pw-accent/5' : 'border-pw-border bg-pw-surface/50'
                      }`}
                    >
                      {attive.map((task, i) => (
                        <CardTask key={task.id} task={task} index={i} onApri={onApri} onArchivia={onArchivia} />
                      ))}
                      {provided.placeholder}
                      {attive.length === 0 && fatte.length === 0 && (
                        <button
                          onClick={() => onAggiungi(membro.id)}
                          className="w-full py-3 text-xs text-pw-text-dim hover:text-pw-accent transition-colors duration-200 ease-out flex items-center justify-center gap-1"
                        >
                          <Plus size={14} />
                          Aggiungi una scheda
                        </button>
                      )}
                      {fatte.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-pw-border">
                          {fatte.map((task, i) => (
                            <CardTask key={task.id} task={task} index={i} completata onApri={onApri} onArchivia={onArchivia} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}

          {/* Colonna Urgente: trascinarci una card la marca urgente e la toglie
              dalla colonna della persona. Serve a dire "questo prima di tutto". */}
          <div className="w-72 shrink-0">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center">
                  <AlertTriangle size={14} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-400 uppercase tracking-wide">Urgente</p>
                  <p className="text-[10px] text-pw-text-dim">{urgenti(false).length} task</p>
                </div>
              </div>
              <button
                onClick={() => onAggiungi(null)}
                className="p-1 rounded-lg text-pw-text-dim hover:text-red-400 hover:bg-pw-surface-2 transition-colors duration-200 ease-out"
                aria-label="Aggiungi una task urgente"
              >
                <Plus size={16} />
              </button>
            </div>

            <Droppable droppableId="urgent">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`min-h-[200px] p-2 rounded-xl border transition-colors duration-200 ease-out ${
                    snapshot.isDraggingOver ? 'border-red-500/30 bg-red-500/5' : 'border-pw-border bg-pw-surface/50'
                  }`}
                >
                  {urgenti(false).map((task, i) => (
                    <CardTask key={task.id} task={task} index={i} onApri={onApri} onArchivia={onArchivia} />
                  ))}
                  {provided.placeholder}
                  {urgenti(false).length === 0 && urgenti(true).length === 0 && (
                    <button
                      onClick={() => onAggiungi(null)}
                      className="w-full py-3 text-xs text-pw-text-dim hover:text-red-400 transition-colors duration-200 ease-out flex items-center justify-center gap-1"
                    >
                      <Plus size={14} />
                      Aggiungi una scheda
                    </button>
                  )}
                  {urgenti(true).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-pw-border">
                      {urgenti(true).map((task, i) => (
                        <CardTask key={task.id} task={task} index={i} completata onApri={onApri} onArchivia={onArchivia} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
