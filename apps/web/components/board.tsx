'use client';

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { rankBetween, type IssueStatusValue } from '@pm/types';
import { useIssues, useMoveIssue, type Issue } from '../lib/hooks';
import { useBoardRealtime } from '../lib/use-board-realtime';

const COLUMNS: { status: IssueStatusValue; label: string }[] = [
  { status: 'BACKLOG', label: 'Backlog' },
  { status: 'TODO', label: 'Todo' },
  { status: 'IN_PROGRESS', label: 'In Progress' },
  { status: 'IN_REVIEW', label: 'In Review' },
  { status: 'DONE', label: 'Done' },
];

const COL_PREFIX = 'col:';

export function Board({ orgSlug, projectKey }: { orgSlug: string; projectKey: string }) {
  const { data: issues = [] } = useIssues(orgSlug, projectKey);
  const move = useMoveIssue(orgSlug, projectKey);
  const presence = useBoardRealtime(orgSlug, projectKey);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStatus = useMemo(() => {
    const map = new Map<IssueStatusValue, Issue[]>();
    for (const c of COLUMNS) map.set(c.status, []);
    for (const i of issues) map.get(i.status)?.push(i);
    for (const list of map.values()) list.sort((a, b) => (a.rank < b.rank ? -1 : 1));
    return map;
  }, [issues]);

  const statusOf = (id: string) => issues.find((i) => i.id === id)?.status;

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const activeIssueId = String(e.active.id);
    const over = e.over;
    if (!over) return;

    const overId = String(over.id);
    const targetStatus: IssueStatusValue | undefined = overId.startsWith(COL_PREFIX)
      ? (overId.slice(COL_PREFIX.length) as IssueStatusValue)
      : statusOf(overId);
    if (!targetStatus) return;

    // Build the destination column without the dragged card.
    const column = (byStatus.get(targetStatus) ?? []).filter((i) => i.id !== activeIssueId);
    const overIndex = overId.startsWith(COL_PREFIX)
      ? column.length
      : column.findIndex((i) => i.id === overId);
    const insertAt = overIndex < 0 ? column.length : overIndex;

    const above = column[insertAt - 1]?.rank ?? null;
    const below = column[insertAt]?.rank ?? null;
    if (above === below) return; // dropped in place

    let optimisticRank: string;
    try {
      optimisticRank = rankBetween(above, below);
    } catch {
      return;
    }

    move.mutate({
      id: activeIssueId,
      optimisticRank,
      input: {
        status: targetStatus,
        aboveId: column[insertAt - 1]?.id ?? null,
        belowId: column[insertAt]?.id ?? null,
      },
    });
  }

  const activeIssue = issues.find((i) => i.id === activeId) ?? null;

  return (
    <div>
      <Presence users={presence} />
      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto p-4">
          {COLUMNS.map((col) => (
            <Column key={col.status} status={col.status} label={col.label} issues={byStatus.get(col.status) ?? []} />
          ))}
        </div>
        <DragOverlay>{activeIssue ? <Card issue={activeIssue} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  label,
  issues,
}: {
  status: IssueStatusValue;
  label: string;
  issues: Issue[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL_PREFIX}${status}` });
  return (
    <div className="w-72 shrink-0">
      <div className="mb-2 flex items-center justify-between px-1 text-xs uppercase tracking-wide text-zinc-500">
        <span>{label}</span>
        <span>{issues.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[120px] space-y-2 rounded-lg border p-2 ${
          isOver ? 'border-indigo-500 bg-panel/80' : 'border-edge bg-panel/40'
        }`}
      >
        <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {issues.map((issue) => (
            <Card key={issue.id} issue={issue} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

function Card({ issue, overlay = false }: { issue: Issue; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !overlay ? 0.4 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-md border border-edge bg-zinc-900 p-3 text-sm shadow-sm active:cursor-grabbing"
    >
      <p className="text-zinc-100">{issue.title}</p>
      <p className="mt-1 text-xs text-zinc-500">#{issue.number} · {issue.priority}</p>
    </div>
  );
}

function Presence({ users }: { users: { userId: string; name: string }[] }) {
  if (users.length === 0) return null;
  return (
    <div className="flex items-center gap-1 px-4 pt-3 text-xs text-zinc-400">
      <span>Online:</span>
      {users.map((u) => (
        <span key={u.userId} className="rounded-full bg-indigo-600/30 px-2 py-0.5 text-indigo-200">
          {u.name}
        </span>
      ))}
    </div>
  );
}
