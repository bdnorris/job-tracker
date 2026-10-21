import { useRef, useState } from 'preact/hooks';
import type { ExtractResult, ExtractedJob, FieldSources } from '../lib/extract/types';
import './AddJob.css';

interface Stage {
  id: string;
  label: string;
}

interface Props {
  stages: Stage[];
  defaultStage: string;
  currency: string;
  aiEnabled: boolean;
  error?: string | null;
}

type Values = Record<FormField, string>;
type FormField =
  | 'url' | 'title' | 'company' | 'location' | 'remoteType' | 'salaryMin' | 'salaryMax' | 'salaryCurrency'
  | 'salaryPeriod' | 'skills' | 'descriptionText' | 'status' | 'priority' | 'nextAction' | 'nextActionDate';

type Mode = 'url' | 'text';
type Status = { kind: 'idle' | 'working' | 'done' | 'error'; message: string };
type ApiResult = ExtractResult & { url?: string | null };

const SOURCE_LABELS: Record<string, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  jsonld: 'JSON-LD',
  heuristic: 'page text',
  ai: 'AI',
  'lever-url': 'Lever URL (check this)',
  'ashby-url': 'Ashby URL (check this)',
  'heuristic-url': 'site address (check this)',
};

/** Which extractor field a form field's value came from. */
const FIELD_SOURCE: Partial<Record<FormField, keyof ExtractedJob>> = {
  title: 'title',
  company: 'company',
  location: 'location',
  remoteType: 'remoteType',
  salaryMin: 'salary',
  salaryMax: 'salary',
  salaryCurrency: 'salary',
  salaryPeriod: 'salary',
  skills: 'skills',
  descriptionText: 'descriptionText',
};

const REQUIRED: FormField[] = ['title', 'company'];
const EXTRACTED_FIELDS = Object.keys(FIELD_SOURCE) as FormField[];

function valuesFromJob(job: ExtractedJob): Partial<Values> {
  return {
    title: job.title ?? '',
    company: job.company ?? '',
    location: job.location ?? '',
    remoteType: job.remoteType ?? 'unknown',
    salaryMin: job.salary?.min != null ? String(job.salary.min) : '',
    salaryMax: job.salary?.max != null ? String(job.salary.max) : '',
    salaryCurrency: job.salary?.currency ?? '',
    salaryPeriod: job.salary?.period ?? '',
    skills: (job.skills ?? []).join(', '),
    descriptionText: job.descriptionText ?? '',
  };
}

async function postJson(path: string, body: unknown): Promise<ApiResult> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error?.message || `Request failed (${res.status})`);
  return payload as ApiResult;
}

export default function AddJob({ stages, defaultStage, currency, aiEnabled, error }: Props) {
  const [mode, setMode] = useState<Mode>('url');
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle', message: '' });
  const [values, setValues] = useState<Values>({
    url: '', title: '', company: '', location: '', remoteType: 'unknown', salaryMin: '', salaryMax: '',
    salaryCurrency: currency, salaryPeriod: 'year', skills: '', descriptionText: '', status: defaultStage,
    priority: '1', nextAction: '', nextActionDate: '',
  });
  const [descriptionHtml, setDescriptionHtml] = useState('');
  const [sources, setSources] = useState<FieldSources>({});
  const [edited, setEdited] = useState<Set<FormField>>(new Set());
  const [extracted, setExtracted] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [duplicate, setDuplicate] = useState<ExtractResult['duplicate']>(null);
  const [lastResult, setLastResult] = useState<ApiResult | null>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const busy = status.kind === 'working';

  /**
   * Applies an extraction result to the form. Fields the user edited are never touched.
   * - replace: a fresh extraction; every other extracted field takes the new value (or its default).
   * - fill: the AI follow-up; only empty fields are filled.
   * - override: "Re-run with AI"; fields the result has a value for are replaced.
   */
  function apply(result: ApiResult, how: 'replace' | 'fill' | 'override', userEdited: Set<FormField>) {
    const incoming = valuesFromJob(result.job);
    const defaults: Partial<Values> = { remoteType: 'unknown', salaryPeriod: 'year', salaryCurrency: currency };
    setValues((v) => {
      const next = { ...v };
      for (const field of EXTRACTED_FIELDS) {
        if (userEdited.has(field)) continue;
        const value = incoming[field] ?? '';
        const hasValue = value !== '' && value !== 'unknown';
        const isEmpty = !v[field] || v[field] === 'unknown';
        if (how === 'replace') next[field] = hasValue ? value : defaults[field] ?? '';
        else if (hasValue && (how === 'override' || isEmpty)) next[field] = value;
      }
      if (result.url) next.url = result.url;
      return next;
    });
    if (!userEdited.has('descriptionText') && (how === 'replace' || result.job.descriptionHtml)) {
      setDescriptionHtml(result.job.descriptionHtml ?? '');
    }
    setSources(result.fieldSources);
    setWarnings(result.warnings);
    if (result.duplicate !== undefined) setDuplicate(result.duplicate);
    setLastResult(result);
    setExtracted(true);
  }

  function postingText(result: ApiResult | null): string {
    if (mode === 'text' && textInput.trim()) return textInput;
    const job = result?.job;
    return [job?.title, job?.company, job?.location, job?.descriptionText].filter(Boolean).join('\n');
  }

  async function followUpAi(result: ApiResult, force: boolean) {
    const text = postingText(result);
    if (!text.trim()) return result;
    setStatus({ kind: 'working', message: force ? 'Re-running with AI…' : 'Filling gaps with AI…' });
    const ai = await postJson('/api/extract/ai', { text, job: result.job, fieldSources: result.fieldSources, force });
    return { ...ai, duplicate: result.duplicate, url: result.url };
  }

  async function extract(forceAi = false) {
    const body = mode === 'url' ? { url: urlInput.trim() } : { text: textInput };
    if (mode === 'url' && !body.url) return setStatus({ kind: 'error', message: 'Enter a posting URL first.' });
    if (mode === 'text' && textInput.trim().length < 20) return setStatus({ kind: 'error', message: 'Paste more of the posting first.' });

    setStatus({ kind: 'working', message: forceAi ? 'Re-running with AI…' : mode === 'url' ? 'Fetching and reading the posting…' : 'Reading the pasted text…' });
    // A new extraction starts over; a forced AI re-run keeps the user's edits.
    const userEdited = forceAi ? edited : new Set<FormField>();
    if (!forceAi) setEdited(userEdited);
    try {
      let result = await postJson(`/api/extract${forceAi ? '?force=ai' : ''}`, body);
      apply(result, forceAi ? 'override' : 'replace', userEdited);
      if (result.aiPending && aiEnabled) {
        result = await followUpAi(result, forceAi);
        apply(result, forceAi ? 'override' : 'fill', userEdited);
      }
      const missing = REQUIRED.filter((f) => !valuesFromJob(result.job)[f]);
      setStatus({
        kind: 'done',
        message: missing.length
          ? `Extracted what we could. Please fill in: ${missing.join(', ')}.`
          : 'Extracted. Review the details below, then save.',
      });
      reviewRef.current?.focus();
    } catch (err: any) {
      setStatus({ kind: 'error', message: err.message || 'Extraction failed.' });
    }
  }

  async function rerunWithAi() {
    if (!lastResult) return extract(true);
    // With text already in hand, a direct AI pass avoids fetching the page again.
    if (mode === 'text' || lastResult.job.descriptionText) {
      try {
        const result = await followUpAi(lastResult, true);
        apply(result, 'override', edited);
        setStatus({ kind: 'done', message: 'Updated with AI. Fields you edited were kept.' });
      } catch (err: any) {
        setStatus({ kind: 'error', message: err.message || 'AI extraction failed.' });
      }
      return;
    }
    return extract(true);
  }

  function onField(field: FormField, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (EXTRACTED_FIELDS.includes(field)) setEdited((e) => new Set(e).add(field));
    // Editing the description text means the formatted HTML no longer matches it.
    if (field === 'descriptionText') setDescriptionHtml('');
  }

  const sourceFor = (field: FormField) => {
    const key = FIELD_SOURCE[field];
    if (!key || !extracted) return null;
    if (edited.has(field)) return 'edited';
    const s = sources[key];
    return s ? `from ${SOURCE_LABELS[s] ?? s}` : null;
  };
  const missing = (field: FormField) => extracted && REQUIRED.includes(field) && !values[field].trim();

  // Hidden fields record provenance for the saved job.
  const finalSources: Record<string, string> = {};
  for (const field of EXTRACTED_FIELDS) {
    const key = FIELD_SOURCE[field]!;
    if (!values[field] || values[field] === 'unknown') continue;
    finalSources[key] = edited.has(field) ? 'manual' : sources[key] ?? 'manual';
  }
  const counts = Object.values(finalSources).filter((s) => s !== 'manual').reduce<Record<string, number>>((acc, s) => {
    const base = s.replace(/-url$/, '');
    acc[base] = (acc[base] ?? 0) + 1;
    return acc;
  }, {});
  const mainSource = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'manual';

  const label = (field: FormField, text: string, required = false) => {
    const src = sourceFor(field);
    return (
      <label for={`f-${field}`}>
        {text}
        {required && <span class="required" aria-hidden="true"> *</span>}
        {src && <span class={`source-tag ${src === 'edited' ? 'is-edited' : ''}`}>{src}</span>}
      </label>
    );
  };

  const input = (field: FormField, props: Record<string, unknown> = {}) => (
    <input
      id={`f-${field}`}
      name={field}
      class="input"
      value={values[field]}
      onInput={(e) => onField(field, (e.currentTarget as HTMLInputElement).value)}
      aria-invalid={missing(field) || undefined}
      aria-describedby={missing(field) ? `f-${field}-missing` : undefined}
      {...props}
    />
  );

  const missingNote = (field: FormField) =>
    missing(field) && (
      <p id={`f-${field}-missing`} class="missing-note">
        Not found in the posting. Please fill this in.
      </p>
    );

  return (
    <div class="add-job">
      {error && (
        <div class="banner banner-error" role="alert">
          {error}
        </div>
      )}

      <section class="card import-card" aria-labelledby="import-heading">
        <h2 id="import-heading">Import from a posting</h2>
        <div class="tabs" role="tablist" aria-label="Import source">
          {(['url', 'text'] as Mode[]).map((m) => (
            <button
              type="button"
              role="tab"
              id={`tab-${m}`}
              aria-selected={mode === m}
              aria-controls={`panel-${m}`}
              tabIndex={mode === m ? 0 : -1}
              class={`tab ${mode === m ? 'is-active' : ''}`}
              onClick={() => setMode(m)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  const next = m === 'url' ? 'text' : 'url';
                  setMode(next);
                  document.getElementById(`tab-${next}`)?.focus();
                }
              }}
            >
              {m === 'url' ? 'Posting URL' : 'Paste text'}
            </button>
          ))}
        </div>

        <form
          class="import-form"
          onSubmit={(e) => {
            e.preventDefault();
            extract(false);
          }}
        >
          {mode === 'url' ? (
            <div role="tabpanel" id="panel-url" aria-labelledby="tab-url" class="import-row">
              <label for="import-url" class="sr-only">Posting URL</label>
              <input
                id="import-url"
                type="url"
                class="input"
                placeholder="https://jobs.example.com/postings/123"
                value={urlInput}
                onInput={(e) => setUrlInput((e.currentTarget as HTMLInputElement).value)}
                disabled={busy}
              />
              <button type="submit" class="btn btn-primary" disabled={busy}>
                Extract
              </button>
            </div>
          ) : (
            <div role="tabpanel" id="panel-text" aria-labelledby="tab-text" class="import-text">
              <label for="import-text" class="sr-only">Posting text</label>
              <textarea
                id="import-text"
                class="textarea"
                rows={8}
                maxLength={100000}
                placeholder="Paste the full posting, e.g. from LinkedIn or Indeed, which block automatic fetching."
                value={textInput}
                onInput={(e) => setTextInput((e.currentTarget as HTMLTextAreaElement).value)}
                disabled={busy}
              />
              <div class="import-actions">
                <span class="hint">{textInput.length.toLocaleString()} / 100,000 characters</span>
                <button type="submit" class="btn btn-primary" disabled={busy}>
                  Extract
                </button>
              </div>
            </div>
          )}
        </form>

        <div class="import-status" role="status" aria-live="polite">
          {status.message && <p class={`status status-${status.kind}`}>{status.message}</p>}
        </div>

        {warnings.length > 0 && (
          <ul class="warnings" aria-label="Extraction warnings">
            {warnings.map((w) => (
              <li>{w}</li>
            ))}
          </ul>
        )}

        {aiEnabled && extracted && (
          <button type="button" class="btn btn-sm" onClick={rerunWithAi} disabled={busy}>
            Re-run with AI
          </button>
        )}
      </section>

      {duplicate && (
        <div class="banner banner-warning" role="alert">
          You already saved this posting: <a href={`/jobs/${duplicate.id}`}>{duplicate.title} at {duplicate.company}</a>.
          Saving again will take you to the existing job.
        </div>
      )}

      <form action="/api/jobs" method="POST" class="card review-form" aria-labelledby="review-heading">
        <h2 id="review-heading" tabIndex={-1} ref={reviewRef}>
          {extracted ? 'Review and save' : 'Job details'}
        </h2>
        {!extracted && <p class="hint">Import above, or fill this in manually.</p>}

        <input type="hidden" name="source" value={mainSource} />
        <input type="hidden" name="fieldSources" value={JSON.stringify(finalSources)} />
        <input type="hidden" name="descriptionHtml" value={descriptionHtml} />

        <div class="form-grid">
          <div class="form-group col-span-2">
            {label('title', 'Job title', true)}
            {input('title', { required: true, placeholder: 'e.g. Senior Frontend Engineer' })}
            {missingNote('title')}
          </div>
          <div class="form-group col-span-2">
            {label('company', 'Company', true)}
            {input('company', { required: true, placeholder: 'e.g. Example Corp' })}
            {missingNote('company')}
          </div>
          <div class="form-group">
            {label('location', 'Location')}
            {input('location', { placeholder: 'e.g. Chicago, IL or Remote' })}
          </div>
          <div class="form-group">
            {label('remoteType', 'Workplace type')}
            <select id="f-remoteType" name="remoteType" class="select" value={values.remoteType} onChange={(e) => onField('remoteType', (e.currentTarget as HTMLSelectElement).value)}>
              <option value="unknown">Unknown</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">Onsite</option>
            </select>
          </div>
          <div class="form-group">
            {label('salaryMin', 'Salary min')}
            {input('salaryMin', { type: 'number', min: 0, step: 1, inputMode: 'numeric' })}
          </div>
          <div class="form-group">
            {label('salaryMax', 'Salary max')}
            {input('salaryMax', { type: 'number', min: 0, step: 1, inputMode: 'numeric' })}
          </div>
          <div class="form-group">
            {label('salaryCurrency', 'Currency')}
            {input('salaryCurrency', { maxLength: 3, placeholder: currency, autoCapitalize: 'characters' })}
          </div>
          <div class="form-group">
            {label('salaryPeriod', 'Salary period')}
            <select id="f-salaryPeriod" name="salaryPeriod" class="select" value={values.salaryPeriod || 'year'} onChange={(e) => onField('salaryPeriod', (e.currentTarget as HTMLSelectElement).value)}>
              <option value="year">Yearly</option>
              <option value="month">Monthly</option>
              <option value="hour">Hourly</option>
            </select>
          </div>
          <div class="form-group col-span-2">
            {label('skills', 'Skills (comma separated)')}
            {input('skills', { placeholder: 'TypeScript, React, Node.js' })}
          </div>
          <div class="form-group col-span-2">
            {label('descriptionText', 'Description')}
            <textarea
              id="f-descriptionText"
              name="descriptionText"
              class="textarea"
              rows={10}
              value={values.descriptionText}
              onInput={(e) => onField('descriptionText', (e.currentTarget as HTMLTextAreaElement).value)}
              aria-describedby={descriptionHtml ? 'desc-hint' : undefined}
            />
            {descriptionHtml && (
              <p id="desc-hint" class="hint">
                The posting's formatting (headings, lists) is kept unless you edit this text.
              </p>
            )}
          </div>
          <div class="form-group">
            <label for="f-status">Stage</label>
            <select id="f-status" name="status" class="select" value={values.status} onChange={(e) => onField('status', (e.currentTarget as HTMLSelectElement).value)}>
              {stages.map((s) => (
                <option value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div class="form-group">
            <label for="f-priority">Priority</label>
            <select id="f-priority" name="priority" class="select" value={values.priority} onChange={(e) => onField('priority', (e.currentTarget as HTMLSelectElement).value)}>
              <option value="0">None</option>
              <option value="1">Normal</option>
              <option value="2">High</option>
              <option value="3">Top</option>
            </select>
          </div>
          <div class="form-group">
            <label for="f-nextAction">Next action</label>
            {input('nextAction', { placeholder: 'e.g. Apply by Friday' })}
          </div>
          <div class="form-group">
            <label for="f-nextActionDate">Next action date</label>
            {input('nextActionDate', { type: 'date' })}
          </div>
          <div class="form-group col-span-2">
            <label for="f-url">Posting URL</label>
            {input('url', { type: 'url', placeholder: 'https://example.com/jobs/123' })}
          </div>
        </div>

        <div class="form-actions">
          <a href="/jobs" class="btn">Cancel</a>
          <button type="submit" class="btn btn-primary">
            Save job
          </button>
        </div>
      </form>
    </div>
  );
}
