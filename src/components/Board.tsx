import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Fragment, type JSX } from 'preact';
import { orderForIndex } from '../lib/board/order';
import './Board.css';

export interface BoardStage {
  id: string;
  label: string;
  closed: boolean;
}

export interface BoardJob {
  id: string;
  title: string;
  company: string;
  status: string;
  boardOrder: number;
  salary: string;
  remoteLabel: string;
  topSkills: { name: string; matched: boolean }[];
  matchScore: number;
  nextAction: string | null;
  nextActionDate: string | null;
  nextActionLabel: string | null;
  overdue: boolean;
  dueToday: boolean;
}

interface Props {
  stages: BoardStage[];
  jobs: BoardJob[];
}

interface DropTarget {
  status: string;
  index: number;
}

type DragEvt = JSX.TargetedEvent<HTMLElement, DragEvent>;

const byOrder = (a: BoardJob, b: BoardJob) => a.boardOrder - b.boardOrder;

export default function Board({ stages, jobs: initialJobs }: Props) {
  const [jobs, setJobs] = useState<BoardJob[]>(initialJobs);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [pending, setPending] = useState<Set<string>>(new Set());
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // A keyboard status change moves the card to another column, which re-creates its select;
  // focus is put back on the new one.
  const [focusSelectFor, setFocusSelectFor] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!focusSelectFor) return;
    document.getElementById(`status-${focusSelectFor}`)?.focus();
    setFocusSelectFor(null);
  }, [focusSelectFor, jobs]);

  const stageLabel = (id: string) => stages.find((s) => s.id === id)?.label ?? id;
  const openStages = stages.filter((s) => !s.closed);
  const closedStages = stages.filter((s) => s.closed);

  const columns = useMemo(() => {
    const map: Record<string, BoardJob[]> = {};
    for (const s of stages) map[s.id] = [];
    for (const j of jobs) (map[j.status] ??= []).push(j);
    for (const id of Object.keys(map)) map[id].sort(byOrder);
    return map;
  }, [jobs, stages]);

  const closedCount = closedStages.reduce((n, s) => n + (columns[s.id]?.length ?? 0), 0);

  /** `index` is the position among the target column's other cards (excluding the moved one). */
  async function moveJob(jobId: string, status: string, index: number) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    const siblings = (columns[status] ?? []).filter((j) => j.id !== jobId);
    const currentIndex = (columns[status] ?? []).findIndex((j) => j.id === jobId);
    // Dropping a card back onto its own slot is a no-op.
    if (job.status === status && index === currentIndex) return;

    const boardOrder = orderForIndex(siblings.map((j) => j.boardOrder), index);
    const previous = jobs;
    setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, status, boardOrder } : j)));
    setPending((p) => new Set(p).add(jobId));

    try {
      const res = await fetch(`/api/jobs/${jobId}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, boardOrder }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAnnouncement(
        job.status === status
          ? `${job.title} moved to position ${index + 1} in ${stageLabel(status)}.`
          : `${job.title} moved to ${stageLabel(status)}.`
      );
    } catch {
      setJobs(previous);
      setAnnouncement(`Could not move ${job.title}. Change was undone.`);
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(jobId);
        return next;
      });
    }
  }

  function indexFromPointer(status: string, clientY: number): number {
    const col = columnRefs.current[status];
    if (!col) return 0;
    const cards = Array.from(col.querySelectorAll<HTMLElement>('[data-card-id]')).filter(
      (el) => el.dataset.cardId !== dragId
    );
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return cards.length;
  }

  function onDragStart(e: DragEvt, jobId: string) {
    setDragId(jobId);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', jobId);
    }
  }

  function onDragEnd() {
    setDragId(null);
    setDropTarget(null);
  }

  function onDragOver(e: DragEvt, status: string) {
    if (!dragId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const index = indexFromPointer(status, e.clientY);
    if (dropTarget?.status !== status || dropTarget.index !== index) setDropTarget({ status, index });
  }

  function onDragLeave(e: DragEvt, status: string) {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    if (dropTarget?.status === status) setDropTarget(null);
  }

  function onDrop(e: DragEvt, status: string) {
    e.preventDefault();
    const jobId = dragId ?? e.dataTransfer?.getData('text/plain');
    const index = indexFromPointer(status, e.clientY);
    setDragId(null);
    setDropTarget(null);
    if (!jobId) return;
    moveJob(jobId, status, index);
  }

  function onStatusSelect(job: BoardJob, status: string) {
    if (status === job.status || pending.has(job.id)) return;
    setFocusSelectFor(job.id);
    // Keyboard/select moves append to the end of the target column.
    moveJob(job.id, status, (columns[status] ?? []).length);
  }

  function renderCard(job: BoardJob) {
    const selectId = `status-${job.id}`;
    return (
      <article
        key={job.id}
        class={`board-card${dragId === job.id ? ' is-dragging' : ''}${pending.has(job.id) ? ' is-pending' : ''}`}
        data-card-id={job.id}
        draggable
        onDragStart={(e) => onDragStart(e, job.id)}
        onDragEnd={onDragEnd}
        aria-labelledby={`title-${job.id}`}
      >
        <div class="board-card-top">
          <span class="drag-handle" aria-hidden="true" title="Drag to move">⋮⋮</span>
          <div class="board-card-heading">
            <a id={`title-${job.id}`} href={`/jobs/${job.id}`} class="board-card-title" draggable={false}>
              {job.title}
            </a>
            <span class="board-card-company">{job.company}</span>
          </div>
        </div>

        <div class="board-card-badges">
          <span class="badge">{job.remoteLabel}</span>
          {job.topSkills.length > 0 && (
            <span class={`badge match-badge${job.matchScore >= 50 ? ' match-high' : ''}`}>
              {job.matchScore}% match
            </span>
          )}
          {job.salary && <span class="board-card-salary">{job.salary}</span>}
        </div>

        {job.topSkills.length > 0 && (
          <ul class="board-card-skills" aria-label="Skills">
            {job.topSkills.map((s) => (
              <li class={`skill-tag${s.matched ? ' skill-matched' : ''}`}>{s.name}</li>
            ))}
          </ul>
        )}

        {(job.nextAction || job.nextActionDate) && (
          <div class={`board-card-action${job.overdue ? ' overdue' : ''}${job.dueToday ? ' due-today' : ''}`}>
            {job.nextAction && <span>{job.nextAction}</span>}
            {job.nextActionLabel && (
              <time dateTime={job.nextActionDate ?? undefined}>
                {job.overdue ? 'Overdue · ' : job.dueToday ? 'Today · ' : ''}
                {job.nextActionLabel}
              </time>
            )}
          </div>
        )}

        <div class="board-card-status no-print">
          <label for={selectId} class="sr-only">
            Status for {job.title}
          </label>
          <select
            id={selectId}
            class="select select-sm"
            value={job.status}
            // aria-disabled, not disabled: disabling the focused select would drop focus to <body>.
            aria-disabled={pending.has(job.id) || undefined}
            onChange={(e) => onStatusSelect(job, (e.currentTarget as HTMLSelectElement).value)}
          >
            {stages.map((s) => (
              <option value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      </article>
    );
  }

  function renderColumn(stage: BoardStage) {
    const list = columns[stage.id] ?? [];
    const isTarget = dropTarget?.status === stage.id;
    const headingId = `col-${stage.id}`;
    // Drop indices count only cards other than the one being dragged.
    let siblingIndex = 0;

    return (
      <section
        key={stage.id}
        class={`board-column${isTarget ? ' is-drop-target' : ''}${stage.closed ? ' is-closed' : ''}`}
        aria-labelledby={headingId}
        onDragOver={(e) => onDragOver(e, stage.id)}
        onDragLeave={(e) => onDragLeave(e, stage.id)}
        onDrop={(e) => onDrop(e, stage.id)}
      >
        <header class="board-column-header">
          <h2 id={headingId} class="board-column-title">
            {stage.label}
          </h2>
          <span class="badge board-column-count" aria-label={`${list.length} jobs`}>
            {list.length}
          </span>
        </header>
        <div class="board-column-cards" ref={(el) => { columnRefs.current[stage.id] = el; }}>
          {list.map((job) => {
            const showIndicator = isTarget && job.id !== dragId && dropTarget!.index === siblingIndex;
            if (job.id !== dragId) siblingIndex++;
            return (
              <Fragment key={job.id}>
                {showIndicator && <div class="drop-indicator" aria-hidden="true" />}
                {renderCard(job)}
              </Fragment>
            );
          })}
          {isTarget && dropTarget!.index >= siblingIndex && <div class="drop-indicator" aria-hidden="true" />}
          {list.length === 0 && !isTarget && <p class="board-column-empty">No jobs</p>}
        </div>
      </section>
    );
  }

  return (
    <div class="board">
      <div class="board-columns">{openStages.map(renderColumn)}</div>

      {closedStages.length > 0 && (
        <details class="board-closed">
          <summary>
            Closed <span class="badge">{closedCount}</span>
          </summary>
          <div class="board-columns board-columns-closed">{closedStages.map(renderColumn)}</div>
        </details>
      )}

      <div class="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
