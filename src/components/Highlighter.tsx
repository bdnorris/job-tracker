import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import CopyButton from './profile/CopyButton';
import { applyHighlights, offsetsFor, pointToOffset, type SelectionOffsets } from '../lib/highlights/marks';
import { walkText } from '../lib/highlights/walk';
import './Highlighter.css';

export interface HighlightItem {
  id: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  prefix: string;
  suffix: string;
  category: string;
  note: string | null;
}

export interface Category {
  id: string;
  label: string;
  color: string;
}

interface Props {
  jobId: string;
  /** Description HTML with marks, rendered on the server (what shows without JS). */
  initialHtml: string;
  /** Normalized description HTML without marks; the island re-applies marks to it. */
  baseHtml: string;
  /** description_text; offsets index into it. */
  text: string;
  highlights: HighlightItem[];
  orphanIds: string[];
  categories: Category[];
}

type Popover =
  | { mode: 'create'; sel: SelectionOffsets; x: number; y: number }
  | { mode: 'edit'; id: string; x: number; y: number }
  | { mode: 'reselect'; id: string; sel: SelectionOffsets; x: number; y: number };

const truncate = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const POPOVER_WIDTH = 288;

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error?.message || `Request failed (${res.status})`);
  return payload;
}

export default function Highlighter({ jobId, initialHtml, baseHtml, text, highlights: initial, orphanIds: initialOrphans, categories }: Props) {
  const [highlights, setHighlights] = useState<HighlightItem[]>(initial);
  const [orphans, setOrphans] = useState<Set<string>>(new Set(initialOrphans));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [popover, setPopover] = useState<Popover | null>(null);
  const [reselectId, setReselectId] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: '', n: 0 });
  const [note, setNote] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);

  const announce = (t: string) => setMessage((m) => ({ text: t, n: m.n + 1 }));
  const categoryLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? id;
  const byId = (id: string) => highlights.find((h) => h.id === id);

  // Re-render marks from the unmarked HTML whenever highlights change. This also runs on
  // mount, which confirms this browser's DOM walks to the same text the server stored.
  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.innerHTML = baseHtml;
    const { orphaned, text: walked } = applyHighlights(el, highlights);
    setOrphans(new Set(orphaned.map((h) => h.id)));
    setMismatch(walked !== text);
  }, [highlights, baseHtml, text]);

  // Close the popover on outside clicks.
  useEffect(() => {
    if (!popover) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPopover(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [popover]);

  // Focus the popover as soon as it renders (layout effect, not a deferred effect) so a
  // number key or Esc pressed right after it opens reaches it.
  useLayoutEffect(() => {
    if (popover) popRef.current?.focus();
  }, [popover]);

  function position(rect: DOMRect | null) {
    const root = rootRef.current!.getBoundingClientRect();
    if (!rect) return { x: 8, y: 8 };
    const x = Math.max(8, Math.min(rect.left - root.left, root.width - POPOVER_WIDTH - 8));
    return { x, y: rect.bottom - root.top + 8 };
  }

  function closePopover() {
    restoreFocus.current = true;
    setPopover(null);
  }

  // Return focus once the popover is gone and the sidebar has re-rendered. The opener may have
  // been replaced meanwhile (a category change moves a sidebar item to another group), so an
  // Edit button is looked up again by the highlight it belongs to.
  useLayoutEffect(() => {
    if (popover || !restoreFocus.current) return;
    restoreFocus.current = false;
    const from = returnFocus.current;
    const editFor = from?.dataset.editFor;
    const target = editFor ? rootRef.current?.querySelector<HTMLElement>(`[data-edit-for="${editFor}"]`) : from?.isConnected ? from : null;
    (target ?? descRef.current)?.focus();
  }, [popover, highlights]);

  /** Reads the current selection, clamped to the description, as text offsets. */
  function readSelection(): { sel: SelectionOffsets; rect: DOMRect } | null {
    const el = descRef.current;
    const s = window.getSelection();
    if (!el || !s || s.rangeCount === 0 || s.isCollapsed) return null;
    const range = s.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer) && !range.intersectsNode(el)) return null;
    const walk = walkText(el);
    const start = pointToOffset(el, walk, range.startContainer, range.startOffset);
    const end = pointToOffset(el, walk, range.endContainer, range.endOffset);
    const sel = offsetsFor(walk.text, start, end);
    return sel ? { sel, rect: range.getBoundingClientRect() } : null;
  }

  function openFromSelection(): boolean {
    const read = readSelection();
    if (!read) return false;
    if (mismatch) {
      announce('Highlighting is unavailable for this description. Re-save the description from Edit to fix it.');
      return true;
    }
    returnFocus.current = descRef.current;
    const { x, y } = position(read.rect);
    setNote('');
    setPopover(reselectId ? { mode: 'reselect', id: reselectId, sel: read.sel, x, y } : { mode: 'create', sel: read.sel, x, y });
    return true;
  }

  function openEdit(id: string, anchorEl: Element | null, from: HTMLElement | null) {
    const h = byId(id);
    if (!h) return;
    returnFocus.current = from ?? descRef.current;
    const { x, y } = position(anchorEl?.getBoundingClientRect() ?? null);
    setNote(h.note ?? '');
    setPopover({ mode: 'edit', id, x, y });
  }

  function onDescriptionPointerUp(e: JSX.TargetedEvent<HTMLDivElement, MouseEvent>) {
    // Let the browser finish updating the selection first.
    const target = e.target as Element;
    setTimeout(() => {
      if (openFromSelection()) return;
      const mark = target.closest?.('mark.hl');
      if (mark) openEdit(mark.getAttribute('data-id')!, mark, null);
    }, 0);
  }

  function onDescriptionKeyUp(e: JSX.TargetedEvent<HTMLDivElement, KeyboardEvent>) {
    // Keyboard selection (caret browsing / shift+arrows) opens the popover too.
    if (e.shiftKey && e.key.startsWith('Arrow')) openFromSelection();
  }

  async function create(category: string) {
    if (!popover || popover.mode !== 'create' || busy) return;
    setBusy(true);
    try {
      const { highlight } = await api(`/api/jobs/${jobId}/highlights`, 'POST', { ...popover.sel, category, note: note.trim() || null });
      setHighlights((list) => [...list, highlight]);
      window.getSelection()?.removeAllRanges();
      announce(`Highlighted as ${categoryLabel(category)}.`);
      closePopover();
    } catch (err: any) {
      announce(`Could not save the highlight: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, patch: Partial<HighlightItem>, done: string) {
    setBusy(true);
    try {
      const { highlight } = await api(`/api/highlights/${id}`, 'PATCH', patch);
      setHighlights((list) => list.map((h) => (h.id === id ? highlight : h)));
      announce(done);
      return true;
    } catch (err: any) {
      announce(`Could not update the highlight: ${err.message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const h = byId(id);
    if (!h || !confirm(`Delete the highlight “${truncate(h.quote, 60)}”?`)) return;
    setBusy(true);
    try {
      await api(`/api/highlights/${id}`, 'DELETE');
      setHighlights((list) => list.filter((x) => x.id !== id));
      announce('Highlight deleted.');
      if (popover) closePopover();
    } catch (err: any) {
      announce(`Could not delete the highlight: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function attachReselect() {
    if (!popover || popover.mode !== 'reselect') return;
    const { id, sel } = popover;
    if (await update(id, sel, 'Highlight re-attached.')) {
      setReselectId(null);
      window.getSelection()?.removeAllRanges();
      closePopover();
    }
  }

  function jumpTo(id: string) {
    const marks = descRef.current?.querySelectorAll<HTMLElement>(`mark[data-id="${id}"]`);
    if (!marks?.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    marks[0].scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    marks.forEach((m) => m.classList.add('hl-flash'));
    window.setTimeout(() => marks.forEach((m) => m.classList.remove('hl-flash')), 1600);
  }

  function onPopoverKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (popover?.mode === 'reselect') setReselectId(null);
      closePopover();
      return;
    }
    const inField = (e.target as HTMLElement).matches('textarea, input');
    if (!inField && /^[1-9]$/.test(e.key) && popover && popover.mode !== 'reselect') {
      const cat = categories[Number(e.key) - 1];
      if (!cat) return;
      e.preventDefault();
      if (popover.mode === 'create') create(cat.id);
      else update(popover.id, { category: cat.id }, `Changed to ${cat.label}.`);
    }
  }

  const visible = highlights.filter((h) => !orphans.has(h.id));
  const needsReview = highlights.filter((h) => orphans.has(h.id));
  const hideClasses = [...hidden].map((c) => `hl-hide-${c}`).join(' ');
  const editing = popover?.mode === 'edit' ? byId(popover.id) : undefined;

  function categoryButtons(onPick: (id: string) => void, current?: string) {
    return (
      <div class="hl-cats" role="group" aria-label="Category">
        {categories.map((c, i) => (
          <button
            key={c.id}
            type="button"
            class={`hl-cat ${current === c.id ? 'is-current' : ''}`}
            aria-pressed={current !== undefined ? current === c.id : undefined}
            // aria-disabled, not disabled: disabling the focused button would drop focus to <body>.
            aria-disabled={busy || undefined}
            onClick={() => !busy && onPick(c.id)}
          >
            {i < 9 && <kbd aria-hidden="true">{i + 1}</kbd>}
            <span class={`hl-swatch hl-${c.id}`} aria-hidden="true" />
            {c.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div class="hl-root" ref={rootRef}>
      <div class="hl-layout">
        <section class="card hl-description" aria-labelledby="desc-heading">
          <div class="hl-description-head">
            <h2 id="desc-heading">Job Description</h2>
            <button
              type="button"
              class="btn btn-sm no-print"
              // Keep the current text selection when the button is clicked.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!openFromSelection()) announce('Select some text in the description first.');
              }}
            >
              Highlight selection
            </button>
          </div>
          {reselectId && (
            <p class="hl-banner no-print" role="status">
              Select the new text for “{truncate(byId(reselectId)?.quote ?? '', 60)}”.{' '}
              <button type="button" class="btn btn-sm" onClick={() => setReselectId(null)}>
                Cancel
              </button>
            </p>
          )}
          {mismatch && (
            <p class="hl-banner hl-banner-warn no-print">
              This description renders differently in this browser, so new highlights are disabled. Re-saving it from Edit
              usually fixes this.
            </p>
          )}
          <p class="hl-help no-print" id="hl-help">
            Select text to highlight it, or click a highlight to change it.
          </p>
          <div
            ref={descRef}
            class={`description-body hl-body ${hideClasses}`}
            tabIndex={-1}
            aria-describedby="hl-help"
            onMouseUp={onDescriptionPointerUp}
            onKeyUp={onDescriptionKeyUp}
            dangerouslySetInnerHTML={{ __html: initialHtml }}
          />
        </section>

        <aside class="card hl-sidebar" aria-labelledby="hl-sidebar-heading">
          <h2 id="hl-sidebar-heading">Highlights</h2>
          {highlights.length === 0 && <p class="hl-empty">No highlights yet.</p>}
          {categories.map((c) => {
            const items = visible.filter((h) => h.category === c.id);
            if (items.length === 0) return null;
            const shown = !hidden.has(c.id);
            return (
              <section key={c.id} class="hl-group" aria-labelledby={`hl-group-${c.id}`}>
                <header class="hl-group-head">
                  <h3 id={`hl-group-${c.id}`}>
                    <span class={`hl-swatch hl-${c.id}`} aria-hidden="true" />
                    {c.label} <span class="hl-count">({items.length})</span>
                  </h3>
                  <div class="hl-group-actions no-print">
                    <label class="hl-toggle">
                      <input
                        type="checkbox"
                        checked={shown}
                        onChange={() =>
                          setHidden((h) => {
                            const next = new Set(h);
                            if (shown) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          })
                        }
                      />
                      <span>Show</span>
                      <span class="sr-only"> {c.label} highlights</span>
                    </label>
                    <CopyButton text={items.map((h) => h.quote.replace(/\s+/g, ' ')).join('\n')} label={`all ${c.label} quotes`} onResult={announce}>
                      Copy all
                    </CopyButton>
                  </div>
                </header>
                <ul class="hl-items">
                  {items.map((h) => (
                    <li key={h.id} class="hl-item">
                      <a
                        href={`#hl-${h.id}`}
                        class="hl-quote"
                        onClick={(e) => {
                          e.preventDefault();
                          jumpTo(h.id);
                        }}
                      >
                        {truncate(h.quote)}
                      </a>
                      {h.note && <p class="hl-note">{h.note}</p>}
                      <button
                        type="button"
                        class="btn btn-sm hl-edit no-print"
                        data-edit-for={h.id}
                        aria-label={`Edit highlight “${truncate(h.quote, 40)}”`}
                        onClick={(e) => {
                          jumpTo(h.id);
                          openEdit(h.id, descRef.current?.querySelector(`mark[data-id="${h.id}"]`) ?? null, e.currentTarget);
                        }}
                      >
                        Edit
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {needsReview.length > 0 && (
            <section class="hl-group hl-review" aria-labelledby="hl-review-heading">
              <h3 id="hl-review-heading">Needs review ({needsReview.length})</h3>
              <p class="hl-help">The description changed and these quotes couldn't be found. Re-select the text or delete them.</p>
              <ul class="hl-items">
                {needsReview.map((h) => (
                  <li key={h.id} class="hl-item">
                    <span class="hl-quote">
                      <span class={`hl-swatch hl-${h.category}`} aria-hidden="true" /> {truncate(h.quote)}
                    </span>
                    {h.note && <p class="hl-note">{h.note}</p>}
                    <div class="hl-review-actions no-print">
                      <button
                        type="button"
                        class="btn btn-sm"
                        onClick={() => {
                          setReselectId(h.id);
                          descRef.current?.focus();
                          announce('Select the new text in the description, then choose Attach.');
                        }}
                      >
                        Re-select
                      </button>
                      <button type="button" class="btn btn-sm btn-danger" onClick={() => remove(h.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {popover && (
        <div
          ref={popRef}
          class="hl-popover"
          role="dialog"
          aria-modal="false"
          aria-labelledby="hl-pop-title"
          tabIndex={-1}
          style={{ left: `${popover.x}px`, top: `${popover.y}px`, width: `${POPOVER_WIDTH}px` }}
          onKeyDown={onPopoverKeyDown}
        >
          {popover.mode === 'create' && (
            <>
              <p id="hl-pop-title" class="hl-pop-title">
                Highlight “{truncate(popover.sel.quote, 50)}” as
              </p>
              {categoryButtons(create)}
              <label class="hl-pop-label" for="hl-note">
                Note (optional)
              </label>
              <textarea id="hl-note" class="textarea" rows={2} value={note} onInput={(e) => setNote((e.currentTarget as HTMLTextAreaElement).value)} />
              <div class="hl-pop-actions">
                <span class="hl-pop-hint">1–{Math.min(9, categories.length)} picks · Esc closes</span>
                <button type="button" class="btn btn-sm" onClick={closePopover}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {popover.mode === 'edit' && editing && (
            <>
              <p id="hl-pop-title" class="hl-pop-title">
                Edit “{truncate(editing.quote, 50)}”
              </p>
              {categoryButtons((cat) => update(editing.id, { category: cat }, `Changed to ${categoryLabel(cat)}.`), editing.category)}
              <label class="hl-pop-label" for="hl-note">
                Note
              </label>
              <textarea id="hl-note" class="textarea" rows={2} value={note} onInput={(e) => setNote((e.currentTarget as HTMLTextAreaElement).value)} />
              <div class="hl-pop-actions">
                <button type="button" class="btn btn-sm btn-danger" onClick={() => !busy && remove(editing.id)} aria-disabled={busy || undefined}>
                  Delete
                </button>
                <span class="hl-spacer" />
                <button type="button" class="btn btn-sm" onClick={closePopover}>
                  Close
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  aria-disabled={busy || note.trim() === (editing.note ?? '') || undefined}
                  onClick={() => {
                    if (busy || note.trim() === (editing.note ?? '')) return;
                    update(editing.id, { note: note.trim() || null }, 'Note saved.');
                  }}
                >
                  Save note
                </button>
              </div>
            </>
          )}

          {popover.mode === 'reselect' && (
            <>
              <p id="hl-pop-title" class="hl-pop-title">
                Attach the highlight to “{truncate(popover.sel.quote, 50)}”?
              </p>
              <div class="hl-pop-actions">
                <span class="hl-spacer" />
                <button type="button" class="btn btn-sm" onClick={closePopover}>
                  Cancel
                </button>
                <button type="button" class="btn btn-sm btn-primary" onClick={() => !busy && attachReselect()} aria-disabled={busy || undefined}>
                  Attach
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {message.n > 0 && <span key={message.n}>{message.text}</span>}
      </div>
    </div>
  );
}
