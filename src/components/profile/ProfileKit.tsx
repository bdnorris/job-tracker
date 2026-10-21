import { useEffect, useRef, useState } from 'preact/hooks';
import CopyButton from './CopyButton';
import { SECTION_FIELDS, SECTION_LABELS, itemName, type FieldDef } from './fields';
import { validateProfileData, type ProfileSection } from '../../lib/validation/profile';
import { formatBullets, formatEducationEntry, formatWorkEntry, formatYearMonth, stripBullet } from '../../lib/profile/format';
import './ProfileKit.css';

export interface KitItem {
  id: string;
  data: Record<string, any>;
}

interface Props {
  sections: ProfileSection[];
  items: Record<string, KitItem[]>;
}

type Announce = (message: string) => void;

const isUrl = (v: string) => /^https?:\/\/\S+$/i.test(v);

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(payload?.error?.message || `Request failed (${res.status})`);
    err.fields = payload?.error?.fields;
    throw err;
  }
  return payload;
}

export default function ProfileKit({ sections, items: initialItems }: Props) {
  const [items, setItems] = useState<Record<string, KitItem[]>>(initialItems);
  const [message, setMessage] = useState({ text: '', n: 0 });
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  // Re-announcing identical text needs a change in the live region, hence the counter.
  const announce: Announce = (text) => setMessage((m) => ({ text, n: m.n + 1 }));

  useEffect(() => {
    if (!pendingFocus) return;
    const el = document.querySelector<HTMLElement>(`[data-focus="${pendingFocus}"]`);
    // Moving an item to the top or bottom disables the button that was used; focus its
    // opposite instead so keyboard focus isn't lost.
    const opposite = pendingFocus.endsWith('-up')
      ? pendingFocus.replace(/-up$/, '-down')
      : pendingFocus.endsWith('-down')
        ? pendingFocus.replace(/-down$/, '-up')
        : null;
    const fallback = opposite ? document.querySelector<HTMLElement>(`[data-focus="${opposite}"]`) : null;
    if (el && !(el as HTMLButtonElement).disabled) el.focus();
    else if (fallback && !(fallback as HTMLButtonElement).disabled) fallback.focus();
    setPendingFocus(null);
  }, [pendingFocus]);

  const setSection = (section: string, list: KitItem[]) => setItems((all) => ({ ...all, [section]: list }));

  async function create(section: ProfileSection, data: Record<string, unknown>) {
    const { item } = await api('/api/profile', 'POST', { section, data });
    setSection(section, [...(items[section] ?? []), { id: item.id, data: item.data }]);
    announce(`Added ${itemName(section, item.data)}`);
    setPendingFocus(`item-${item.id}`);
  }

  async function update(section: ProfileSection, id: string, data: Record<string, unknown>) {
    const { item } = await api(`/api/profile/${id}`, 'PATCH', { data });
    setSection(section, (items[section] ?? []).map((i) => (i.id === id ? { id, data: item.data } : i)));
    announce(`Saved ${itemName(section, item.data)}`);
  }

  async function remove(section: ProfileSection, item: KitItem) {
    const name = itemName(section, item.data);
    if (!confirm(`Delete “${name}”?`)) return;
    try {
      await api(`/api/profile/${item.id}`, 'DELETE');
      setSection(section, (items[section] ?? []).filter((i) => i.id !== item.id));
      announce(`Deleted ${name}`);
      setPendingFocus(`add-${section}`);
    } catch (err: any) {
      announce(`Could not delete ${name}: ${err.message}`);
    }
  }

  async function move(section: ProfileSection, index: number, delta: -1 | 1) {
    const list = items[section] ?? [];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;

    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    const moved = list[index];
    setSection(section, next);
    setPendingFocus(`${moved.id}-${delta < 0 ? 'up' : 'down'}`);

    try {
      await api('/api/profile/reorder', 'POST', { section, ids: next.map((i) => i.id) });
      announce(`Moved ${itemName(section, moved.data)} to position ${target + 1} of ${list.length}`);
    } catch (err: any) {
      setSection(section, list);
      announce(`Could not reorder: ${err.message}`);
    }
  }

  return (
    <div class="kit">
      <nav class="kit-jump" aria-label="Sections">
        {sections.map((s) => (
          <a href={`#section-${s}`}>{SECTION_LABELS[s].title}</a>
        ))}
      </nav>

      {sections.map((section) => (
        <Section
          key={section}
          section={section}
          items={items[section] ?? []}
          announce={announce}
          onCreate={(data) => create(section, data)}
          onUpdate={(id, data) => update(section, id, data)}
          onDelete={(item) => remove(section, item)}
          onMove={(index, delta) => move(section, index, delta)}
        />
      ))}

      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {message.n > 0 && <span key={message.n}>{message.text}</span>}
      </div>
    </div>
  );
}

interface SectionProps {
  section: ProfileSection;
  items: KitItem[];
  announce: Announce;
  onCreate: (data: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (item: KitItem) => void;
  onMove: (index: number, delta: -1 | 1) => void;
}

function Section({ section, items, announce, onCreate, onUpdate, onDelete, onMove }: SectionProps) {
  const [adding, setAdding] = useState(false);
  const labels = SECTION_LABELS[section];
  const headingId = `section-${section}-heading`;

  return (
    <section id={`section-${section}`} class="kit-section" aria-labelledby={headingId}>
      <header class="kit-section-header">
        <h2 id={headingId}>{labels.title}</h2>
        {!adding && (
          <button type="button" class="btn btn-sm" data-focus={`add-${section}`} onClick={() => setAdding(true)}>
            + Add {labels.singular}
          </button>
        )}
      </header>

      {items.length === 0 && !adding && <p class="kit-empty">No {labels.title.toLowerCase()} yet.</p>}

      <ol class="kit-items">
        {items.map((item, i) => (
          <ItemCard
            key={item.id}
            section={section}
            item={item}
            index={i}
            count={items.length}
            announce={announce}
            onUpdate={(data) => onUpdate(item.id, data)}
            onDelete={() => onDelete(item)}
            onMove={(delta) => onMove(i, delta)}
          />
        ))}
      </ol>

      {adding && (
        <ItemForm
          section={section}
          title={`New ${labels.singular}`}
          onCancel={() => setAdding(false)}
          onSave={async (data) => {
            await onCreate(data);
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}

interface ItemCardProps {
  section: ProfileSection;
  item: KitItem;
  index: number;
  count: number;
  announce: Announce;
  onUpdate: (data: Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
}

function ItemCard({ section, item, index, count, announce, onUpdate, onDelete, onMove }: ItemCardProps) {
  const [editing, setEditing] = useState(false);
  const name = itemName(section, item.data);
  const fields = SECTION_FIELDS[section];
  const bullets: string[] = (item.data.bullets ?? []).map(stripBullet).filter(Boolean);

  if (editing) {
    return (
      <li class="kit-item is-editing">
        <ItemForm
          section={section}
          title={`Edit ${name}`}
          initial={item.data}
          onCancel={() => setEditing(false)}
          onSave={async (data) => {
            await onUpdate(data);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li class="kit-item" tabIndex={-1} data-focus={`item-${item.id}`} aria-label={name}>
      <dl class="kit-fields">
        {fields
          .filter((f) => f.kind !== 'lines')
          .map((f) => {
            const value = String(item.data[f.name] ?? '');
            if (!value) return null;
            const shown = f.name === 'start' || f.name === 'end' ? formatYearMonth(value) : value;
            return (
              <div class={`kit-field kit-field-${f.kind}`}>
                <dt>{f.label}</dt>
                <dd>{isUrl(value) ? <a href={value} target="_blank" rel="noopener noreferrer">{value}</a> : shown}</dd>
                <CopyButton text={value} label={`${name} ${f.label.toLowerCase()}`} onResult={announce} />
              </div>
            );
          })}
      </dl>

      {bullets.length > 0 && (
        <div class="kit-bullets">
          <p class="kit-bullets-label">Bullets</p>
          <ul>
            {bullets.map((b, i) => (
              <li>
                <span>{b}</span>
                <CopyButton text={b} label={`bullet ${i + 1} of ${name}`} onResult={announce} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="kit-item-actions">
        {(section === 'work' || section === 'education') && (
          <div class="kit-copy-actions">
            <CopyButton
              text={section === 'work' ? formatWorkEntry(item.data) : formatEducationEntry(item.data)}
              label={`entry for ${name}`}
              onResult={announce}
            >
              Copy entry
            </CopyButton>
            {section === 'work' && bullets.length > 0 && (
              <CopyButton text={formatBullets(bullets)} label={`bullets for ${name}`} onResult={announce}>
                Copy bullets
              </CopyButton>
            )}
          </div>
        )}
        <div class="kit-manage-actions">
          <button
            type="button"
            class="btn btn-sm"
            aria-label={`Move ${name} up`}
            data-focus={`${item.id}-up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            class="btn btn-sm"
            aria-label={`Move ${name} down`}
            data-focus={`${item.id}-down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button type="button" class="btn btn-sm" aria-label={`Edit ${name}`} onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" class="btn btn-sm btn-danger" aria-label={`Delete ${name}`} onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

interface ItemFormProps {
  section: ProfileSection;
  title: string;
  initial?: Record<string, any>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

function toFormValues(fields: FieldDef[], data: Record<string, any> = {}) {
  const values: Record<string, string> = {};
  for (const f of fields) {
    values[f.name] = f.kind === 'lines' ? (data[f.name] ?? []).join('\n') : String(data[f.name] ?? '');
  }
  return values;
}

function toData(fields: FieldDef[], values: Record<string, string>) {
  const data: Record<string, unknown> = {};
  for (const f of fields) data[f.name] = f.kind === 'lines' ? values[f.name].split('\n') : values[f.name];
  return data;
}

function ItemForm({ section, title, initial, onSave, onCancel }: ItemFormProps) {
  const fields = SECTION_FIELDS[section];
  const [values, setValues] = useState(() => toFormValues(fields, initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // A field shows errors once it has been edited and left, or after a submit attempt.
  // Blurring an untouched empty field stays quiet so the layout doesn't shift under the pointer.
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const firstInput = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const idBase = `${section}-${initial ? 'edit' : 'new'}-${useRef(Math.random().toString(36).slice(2, 8)).current}`;

  useEffect(() => firstInput.current?.focus(), []);

  const validate = (v: Record<string, string>) => {
    const result = validateProfileData(section, toData(fields, v));
    return result.ok ? {} : result.fields;
  };

  function onInput(name: string, value: string) {
    const next = { ...values, [name]: value };
    setValues(next);
    setDirty((d) => (d[name] ? d : { ...d, [name]: true }));
    if (submitted || touched[name]) setErrors(validate(next));
  }

  function onBlur(name: string) {
    if (!dirty[name]) return;
    setTouched((t) => ({ ...t, [name]: true }));
    setErrors(validate(values));
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    setSubmitted(true);
    const clientErrors = validate(values);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      const first = fields.find((f) => clientErrors[f.name]);
      if (first) document.getElementById(`${idBase}-${first.name}`)?.focus();
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      await onSave(toData(fields, values));
    } catch (err: any) {
      if (err.fields) setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, String(v)])));
      setFormError(err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const showError = (name: string) => (submitted || touched[name]) && errors[name];

  return (
    <form class="kit-form" onSubmit={onSubmit} noValidate aria-label={title}>
      <p class="kit-form-title">{title}</p>
      {fields.map((f, i) => {
        const id = `${idBase}-${f.name}`;
        const err = showError(f.name);
        const common = {
          id,
          name: f.name,
          value: values[f.name],
          placeholder: f.placeholder,
          'aria-invalid': err ? true : undefined,
          'aria-describedby': err ? `${id}-error` : undefined,
          'aria-required': f.required || undefined,
          onInput: (e: Event) => onInput(f.name, (e.currentTarget as HTMLInputElement).value),
          onBlur: () => onBlur(f.name),
          ref: i === 0 ? (el: any) => { firstInput.current = el; } : undefined,
        };
        return (
          <div class="kit-form-field">
            <label for={id}>
              {f.label}
              {f.required && <span aria-hidden="true"> *</span>}
            </label>
            {f.kind === 'text' ? (
              <input type="text" class="input" {...common} />
            ) : (
              <textarea class="textarea" rows={f.kind === 'lines' ? 5 : 3} {...common} />
            )}
            {err && (
              <p id={`${id}-error`} class="kit-form-error">
                {err}
              </p>
            )}
          </div>
        );
      })}
      {formError && (
        <p class="kit-form-error" role="alert">
          {formError}
        </p>
      )}
      <div class="kit-form-actions">
        <button type="button" class="btn btn-sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" class="btn btn-sm btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
