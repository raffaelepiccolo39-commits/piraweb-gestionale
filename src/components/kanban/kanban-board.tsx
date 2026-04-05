'use client';

import { useState, useCallback } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import { createClient } from '@/lib/supabase/client';
import { cn, getPriorityColor, getInitials, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Task, TaskStatus } from '@/types/database';
import { Calendar, MessageSquare, Clock, Sparkles } from 'lucide-react';

interface KanbanBoardProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onTasksUpdate: () => void;
}

const columns: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'backlog', label: 'Backlog', color: 'bg-gray-400' },
  { id: 'todo', label: 'Da fare', color: 'bg-blue-500' },
  { id: 'in_progress', label: 'In corso', color: 'bg-yellow-500' },
  { id: 'review', label: 'Review', color: 'bg-purple-500' },
  { id: 'done', label: 'Fatto', color: 'bg-green-500' },
];

const priorityLabels: Record<string, string> = {
  low: 'Bassa',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

export function KanbanBoard({ tasks, onTaskClick, onTasksUpdate }: KanbanBoardProps) {
  const supabase = createClient();

  const getColumnTasks = useCallback(
    (status: TaskStatus) =>
      tasks
        .filter((t) => t.status === status)
        .sort((a, b) => a.position - b.position),
    [tasks]
  );

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    )
      return;

    const newStatus = destination.droppableId as TaskStatus;
    const task = tasks.find((t) => t.id === draggableId);
    if (!task) return;

    // Update task status and position
    await supabase
      .from('tasks')
      .update({
        status: newStatus,
        position: destination.index,
      })
      .eq('id', draggableId);

    // Reorder tasks in the destination column
    const destTasks = getColumnTasks(newStatus)
      .filter((t) => t.id !== draggableId);
    destTasks.splice(destination.index, 0, { ...task, status: newStatus });

    const updates = destTasks.map((t, index) => ({
      id: t.id,
      position: index,
      status: newStatus,
    }));

    for (const update of updates) {
      await supabase
        .from('tasks')
        .update({ position: update.position, status: update.status })
        .eq('id', update.id);
    }

    onTasksUpdate();
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
        {columns.map((column) => {
          const columnTasks = getColumnTasks(column.id);
          return (
            <div
              key={column.id}
              className="flex-shrink-0 w-72 bg-pw-surface-2/50 rounded-2xl"
            >
              {/* Column header */}
              <div className="p-3 flex items-center gap-2">
                <div className={cn('w-2.5 h-2.5 rounded-full', column.color)} />
                <h3 className="text-sm font-semibold text-pw-text-muted">
                  {column.label}
                </h3>
                <span className="ml-auto text-xs text-gray-400 bg-pw-surface-3 px-2 py-0.5 rounded-full">
                  {columnTasks.length}
                </span>
              </div>

              {/* Droppable area */}
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'p-2 space-y-2 min-h-[100px] transition-colors rounded-xl mx-1',
                      snapshot.isDraggingOver && 'bg-indigo-50/50 dark:bg-indigo-950/20'
                    )}
                  >
                    {columnTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => onTaskClick(task)}
                            className={cn(
                              'bg-pw-surface rounded-xl p-3 border border-pw-border cursor-pointer hover:shadow-md transition-shadow',
                              snapshot.isDragging && 'shadow-lg ring-2 ring-indigo-500'
                            )}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <h4 className="text-sm font-medium text-pw-text line-clamp-2">
                                {task.title}
                              </h4>
                              {task.ai_generated && (
                                <Sparkles size={14} className="text-amber-500 shrink-0" />
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1.5 mb-2">
                              <Badge className={getPriorityColor(task.priority)}>
                                {priorityLabels[task.priority]}
                              </Badge>
                            </div>

                            <div className="flex items-center justify-between text-xs text-pw-text-muted">
                              <div className="flex items-center gap-2">
                                {task.deadline && (
                                  <span className="flex items-center gap-1">
                                    <Calendar size={11} />
                                    {formatDate(task.deadline)}
                                  </span>
                                )}
                                {task.estimated_hours && (
                                  <span className="flex items-center gap-1">
                                    <Clock size={11} />
                                    {task.estimated_hours}h
                                  </span>
                                )}
                              </div>
                              {task.assignee && (
                                <div
                                  className="w-6 h-6 rounded-full bg-pw-accent flex items-center justify-center"
                                  title={task.assignee.full_name}
                                >
                                  <span className="text-white text-[10px] font-semibold">
                                    {getInitials(task.assignee.full_name)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
