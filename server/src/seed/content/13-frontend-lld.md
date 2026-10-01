@section Frontend LLD
@icon 🎨
@color #db2777
@desc Component/API/state design: data table, autocomplete, toast, form, modal, data layer, auth, file upload, chat, design system.

=== Design a reusable Data Table
@p 3
@tags lld, react, table, virtualization
@quick
- API: `<DataTable columns data rowKey loading error pagination sorting filtering selection onRowClick virtualized />`.
- Columns config: `{ id, header, accessor | cell(row), sortable, width, align }`.
- **Controlled vs uncontrolled** state (sorting/page/filters) → support both; **server-side mode** (manual pagination/sorting → callbacks) for big data.
- States: loading skeleton, error + retry, empty; row selection (select all on page / across pages); sticky header.
- Performance: **virtualisation** (render only visible rows), memoised rows, stable keys; a11y: `<table>` semantics, `aria-sort`, keyboard.

::: text
### Clarify first
Data size (100 rows vs 1M)? Client- or server-side sorting/filtering/pagination? Editable cells? Column resize/reorder/hide? Row selection scope? Mobile layout? Export to CSV?

### Component API (props)
| Prop | Purpose |
|---|---|
| `columns` | Column definitions (header, accessor/cell renderer, sortable, width) |
| `data` | Rows for the current view |
| `rowKey` | Unique id getter (never use the index) |
| `loading`, `error`, `emptyState` | Async states |
| `sorting` + `onSortingChange` | Controlled sorting `{ id, desc }` |
| `pagination` + `onPaginationChange` | `{ pageIndex, pageSize, total }` |
| `filters` + `onFiltersChange` | Column/global filters |
| `selection` + `onSelectionChange` | Set of selected row keys |
| `manual` | `true` = the server handles sort/filter/page (the table just emits events) |
| `virtualized`, `rowHeight` | Windowing for large lists |

### Architecture
- **Headless core hook** (`useDataTable`) holds the logic (sort, filter, paginate, select), plus **presentational** components (`Table`, `HeaderCell`, `Row`, `Pagination`). This separation of logic and UI is the design idea behind TanStack Table.
- Server mode: the parent owns the state (in the URL), React Query fetches `GET /users?page&limit&sort&filter`, and the table renders.
:::

::: diagram Component structure
flowchart TD
  P["UsersPage: owns URL state"] -->|"columns, data, sorting, pagination"| DT["DataTable"]
  DT --> H["useDataTable: sort, filter, paginate, select"]
  DT --> TH["TableHeader: sortable headers, aria-sort"]
  DT --> TB["TableBody: rows or virtual rows"]
  DT --> PG["Pagination"]
  DT --> ST["Skeleton / Error / Empty states"]
  P --> RQ["React Query: GET /users?page&sort"]
:::

::: code jsx DataTable.jsx: client & server mode, sorting, selection, pagination, states
import { useMemo, useState } from 'react';

function useControllable(controlled, onChange, initial) {
  const [internal, setInternal] = useState(initial);
  const isControlled = controlled !== undefined;
  return [isControlled ? controlled : internal, (v) => { if (!isControlled) setInternal(v); onChange?.(v); }];
}

export function DataTable({
  columns, data = [], rowKey = (r) => r.id, loading, error, onRetry,
  manual = false, total,
  sorting: sortingProp, onSortingChange,
  pagination: pagProp, onPaginationChange,
  selectable = false, onSelectionChange,
  emptyState = 'No data',
}) {
  const [sorting, setSorting] = useControllable(sortingProp, onSortingChange, null);            // { id, desc }
  const [pagination, setPagination] = useControllable(pagProp, onPaginationChange, { pageIndex: 0, pageSize: 10 });
  const [selected, setSelected] = useState(new Set());

  // client-side processing (skipped in manual/server mode)
  const processed = useMemo(() => {
    if (manual) return data;
    let rows = [...data];
    if (sorting) {
      const col = columns.find((c) => c.id === sorting.id);
      const get = col.accessor || ((r) => r[col.id]);
      rows.sort((a, b) => (get(a) > get(b) ? 1 : get(a) < get(b) ? -1 : 0) * (sorting.desc ? -1 : 1));
    }
    return rows;
  }, [data, sorting, columns, manual]);

  const totalRows = manual ? total : processed.length;
  const pageRows = manual ? processed : processed.slice(pagination.pageIndex * pagination.pageSize, (pagination.pageIndex + 1) * pagination.pageSize);
  const pageCount = Math.max(1, Math.ceil(totalRows / pagination.pageSize));

  const toggleSort = (col) => {
    if (!col.sortable) return;
    const next = sorting?.id !== col.id ? { id: col.id, desc: false } : sorting.desc ? null : { id: col.id, desc: true };
    setSorting(next);
    setPagination({ ...pagination, pageIndex: 0 });
  };
  const toggleRow = (key) => {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelected(next); onSelectionChange?.(next);
  };
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(rowKey(r)));
  const toggleAll = () => {
    const next = new Set(selected);
    pageRows.forEach((r) => (allOnPage ? next.delete(rowKey(r)) : next.add(rowKey(r))));
    setSelected(next); onSelectionChange?.(next);
  };

  if (error) return <div role="alert">Failed to load: {error.message} <button onClick={onRetry}>Retry</button></div>;

  return (
    <div className="dt">
      <table>
        <thead>
          <tr>
            {selectable && <th><input type="checkbox" aria-label="Select all on page" checked={allOnPage} onChange={toggleAll} /></th>}
            {columns.map((col) => (
              <th key={col.id} style={{ width: col.width }}
                aria-sort={sorting?.id === col.id ? (sorting.desc ? 'descending' : 'ascending') : 'none'}>
                {col.sortable ? (
                  <button onClick={() => toggleSort(col)}>{col.header} {sorting?.id === col.id ? (sorting.desc ? '▼' : '▲') : '↕'}</button>
                ) : col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-busy={loading}>
          {loading
            ? Array.from({ length: pagination.pageSize }, (_, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.id}><div className="skeleton-line" /></td>)}</tr>
              ))
            : pageRows.length === 0
            ? <tr><td colSpan={columns.length + (selectable ? 1 : 0)}>{emptyState}</td></tr>
            : pageRows.map((row) => {
                const key = rowKey(row);
                return (
                  <tr key={key} aria-selected={selected.has(key)}>
                    {selectable && <td><input type="checkbox" checked={selected.has(key)} onChange={() => toggleRow(key)} aria-label="Select row" /></td>}
                    {columns.map((col) => <td key={col.id}>{col.cell ? col.cell(row) : (col.accessor ? col.accessor(row) : row[col.id])}</td>)}
                  </tr>
                );
              })}
        </tbody>
      </table>
      <nav className="dt-pagination" aria-label="Pagination">
        <button disabled={pagination.pageIndex === 0} onClick={() => setPagination({ ...pagination, pageIndex: pagination.pageIndex - 1 })}>Prev</button>
        <span>Page {pagination.pageIndex + 1} of {pageCount} · {totalRows} rows</span>
        <button disabled={pagination.pageIndex + 1 >= pageCount} onClick={() => setPagination({ ...pagination, pageIndex: pagination.pageIndex + 1 })}>Next</button>
        <select value={pagination.pageSize} onChange={(e) => setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })}>
          {[10, 20, 50].map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
      </nav>
    </div>
  );
}

// ---------- usage: server-side mode ----------
// const [sorting, setSorting] = useState({ id: 'createdAt', desc: true });
// const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
// const { data, isPending, error, refetch } = useQuery({
//   queryKey: ['users', sorting, pagination],
//   queryFn: () => api.get('/users', { params: { page: pagination.pageIndex + 1, limit: pagination.pageSize, sort: (sorting.desc ? '-' : '') + sorting.id } }),
//   placeholderData: keepPreviousData,
// });
// <DataTable manual columns={columns} data={data?.items} total={data?.total} loading={isPending} error={error} onRetry={refetch}
//   sorting={sorting} onSortingChange={setSorting} pagination={pagination} onPaginationChange={setPagination} selectable />
:::

::: code jsx Virtualisation: render only visible rows (10k+ rows)
import { useRef, useState } from 'react';

export function VirtualList({ items, rowHeight = 40, height = 400, renderRow, overscan = 5 }) {
  const [scrollTop, setScrollTop] = useState(0);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  return (
    <div style={{ height, overflowY: 'auto' }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(start, end).map((item, i) => (
          <div key={item.id} style={{ position: 'absolute', top: (start + i) * rowHeight, height: rowHeight, left: 0, right: 0 }}>
            {renderRow(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
// Production: @tanstack/react-virtual or react-window
:::

::: ask
- *"How many rows? Server- or client-side operations? Editable cells, column resize/pin/hide, row grouping, export?"*
- *"Does selection persist across pages? Should state live in the URL?"*
- Mention you'd build on **TanStack Table** (headless) + a design-system UI rather than reinvent it, but you understand the internals.
:::

::: links
TanStack Table | https://tanstack.com/table/latest
TanStack Virtual | https://tanstack.com/virtual/latest
WAI-ARIA sortable table | https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/
:::

=== Design an Autocomplete / Search component
@p 3
@tags lld, react, debounce, a11y
@quick
- Input → **debounce** (300 ms) → fetch suggestions (min chars ≥ 2) → **cancel stale requests** (AbortController / React Query key) → cache results (Map / React Query).
- States: idle, loading, error, no results; highlight the matched text.
- **Keyboard**: ↑/↓ to move the active option, Enter to select, Esc to close; **ARIA combobox** (`role="combobox"`, `aria-expanded`, `aria-activedescendant`, `role="listbox"/"option"`).
- Close on outside click / blur; infinite scroll for long lists (IntersectionObserver).
- Race conditions: an older response arriving after a newer one must not overwrite it.

::: text
### Requirements
Debouncing · API calls · caching · loading state · error state · keyboard navigation · infinite scrolling · accessibility.

### Architecture
- `useDebouncedValue(query, 300)` → `useQuery({ queryKey: ['search', debounced], enabled: debounced.length >= 2, signal })`. React Query gives **caching, dedupe and cancellation** for free.
- UI: `<Combobox>` with an input + a popup listbox; `activeIndex` state for keyboard navigation.
- Props API: `<Autocomplete fetchOptions minChars debounceMs renderOption onSelect placeholder />`.
:::

::: diagram
sequenceDiagram
  participant U as User
  participant C as Autocomplete
  participant Q as React Query cache
  participant A as API
  U->>C: types "rea"
  Note over C: debounce 300ms
  C->>Q: key search "rea"
  Q->>A: GET /search?q=rea (AbortSignal)
  U->>C: types "reac" (previous request aborted)
  C->>Q: key search "reac"
  Q->>A: GET /search?q=reac
  A-->>Q: results
  Q-->>C: render options
  U->>C: ArrowDown + Enter
  C-->>U: onSelect(option)
:::

::: code jsx Autocomplete.jsx (debounce + cancel + cache + keyboard + ARIA)
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

function useDebouncedValue(value, delay) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

function Highlight({ text, query }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0 || !query) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
}

export function Autocomplete({ fetchOptions, onSelect, minChars = 2, debounceMs = 300, placeholder = 'Search…' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebouncedValue(query.trim(), debounceMs);
  const listId = useId();
  const rootRef = useRef(null);

  const { data: options = [], isFetching, isError, error } = useQuery({
    queryKey: ['autocomplete', debounced],
    queryFn: ({ signal }) => fetchOptions(debounced, signal),   // signal → abort stale requests
    enabled: debounced.length >= minChars,
    staleTime: 60_000,                                          // cache per query string
  });

  useEffect(() => setActive(-1), [debounced]);
  useEffect(() => {
    const close = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (opt) => { onSelect(opt); setQuery(opt.label); setOpen(false); };

  const onKeyDown = (e) => {
    if (!open && e.key === 'ArrowDown') return setOpen(true);
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(options[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  const showList = open && debounced.length >= minChars;
  return (
    <div className="autocomplete" ref={rootRef}>
      <input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        value={query}
        placeholder={placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id={listId} role="listbox" className="ac-list">
          {isFetching && <li className="ac-status">Loading…</li>}
          {isError && <li className="ac-status" role="alert">Error: {error.message}</li>}
          {!isFetching && !isError && options.length === 0 && <li className="ac-status">No results for “{debounced}”</li>}
          {options.map((opt, i) => (
            <li key={opt.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => e.preventDefault()} onClick={() => choose(opt)} onMouseEnter={() => setActive(i)}>
              <Highlight text={opt.label} query={debounced} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// usage
// <Autocomplete fetchOptions={(q, signal) => api.get('/products/search', { params: { q }, signal }).then((r) => r.data)} onSelect={(p) => navigate(`/p/${p.id}`)} />
:::

::: ask
- *"Local list or server search? How many results? Recent searches? Multi-select (chips)? Mobile?"*
- *"Backend search: prefix or full-text?"* → MongoDB Atlas Search / Elasticsearch with an autocomplete analyser.
:::

::: links
WAI-ARIA combobox pattern | https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
:::

=== Design a Toast / Notification system
@p 3
@tags lld, react, context, a11y
@quick
- API: `toast.success('Saved')`, `toast.error(msg, { duration, action })`, `toast.dismiss(id)`; callable **outside React** (e.g. an axios interceptor).
- **Global store** (tiny pub/sub or Context + reducer) + one `<Toaster />` rendered via a **portal**.
- **Queue** with **max visible** (e.g. 3); **auto-dismiss** timers (pause on hover); **priority** (errors stay longer / jump the queue); dedupe identical messages.
- a11y: `role="status"` / `aria-live="polite"` (errors → `role="alert"`, assertive); close button; respect reduced motion.
- Position config, stacking animation, promise helper (`toast.promise`).

::: diagram
flowchart LR
  A["Any code: component, axios interceptor"] -->|"toast.error(msg)"| S["toastStore: queue, subscribe"]
  S -->|"notify"| T["Toaster (portal, aria-live)"]
  T --> V["visible: max 3"]
  S --> Q["queued: waiting"]
  V -->|"timeout / close"| S
:::

::: code jsx toast.js store + Toaster component
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

// ---------- store (framework-agnostic pub/sub) ----------
const MAX_VISIBLE = 3;
let toasts = [];
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => toasts;
let seq = 0;

function add(type, message, opts = {}) {
  const dup = toasts.find((t) => t.message === message && t.type === type);
  if (dup) return dup.id;                                   // dedupe
  const id = ++seq;
  const toastItem = { id, type, message, duration: opts.duration ?? (type === 'error' ? 6000 : 3000), action: opts.action, priority: type === 'error' ? 1 : 0 };
  toasts = [...toasts, toastItem].sort((a, b) => b.priority - a.priority); // errors first
  emit();
  return id;
}
export const toast = {
  success: (m, o) => add('success', m, o),
  error: (m, o) => add('error', m, o),
  info: (m, o) => add('info', m, o),
  dismiss: (id) => { toasts = toasts.filter((t) => t.id !== id); emit(); },
  promise: async (p, { loading, success, error }) => {
    const id = add('info', loading, { duration: Infinity });
    try { const r = await p; toast.dismiss(id); add('success', success); return r; }
    catch (e) { toast.dismiss(id); add('error', error || e.message); throw e; }
  },
};

// ---------- one toast with auto-dismiss (pauses on hover) ----------
function ToastItem({ t }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || t.duration === Infinity) return;
    const timer = setTimeout(() => toast.dismiss(t.id), t.duration);
    return () => clearTimeout(timer);
  }, [paused, t]);
  return (
    <div className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <span>{t.message}</span>
      {t.action && <button onClick={() => { t.action.onClick(); toast.dismiss(t.id); }}>{t.action.label}</button>}
      <button aria-label="Dismiss notification" onClick={() => toast.dismiss(t.id)}>✕</button>
    </div>
  );
}

// ---------- Toaster: render once at the app root ----------
export function Toaster({ position = 'bottom-right' }) {
  const all = useSyncExternalStore(subscribe, getSnapshot);
  const visible = all.slice(0, MAX_VISIBLE);               // queue: the rest wait
  return createPortal(
    <div className={`toaster ${position}`} aria-live="polite">
      {visible.map((t) => <ToastItem key={t.id} t={t} />)}
      {all.length > MAX_VISIBLE && <div className="toast-more">+{all.length - MAX_VISIBLE} more</div>}
    </div>,
    document.body
  );
}

// usage: <Toaster /> in App; toast.success('Saved'); toast.error('Upload failed', { action: { label: 'Retry', onClick: retry } });
// axios: api.interceptors.response.use(null, (e) => { toast.error(e.message); return Promise.reject(e); });
:::

::: ask
- *"Max toasts? Position? Should errors persist until dismissed? Actions (Undo)? Server-pushed notifications too?"* (Then there's also a notification centre with persistence.)
:::

::: links
WAI-ARIA live regions | https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions
Sonner (popular toast lib) | https://sonner.emilkowal.ski
:::

=== Design a Form system (Form, Input, Select, Checkbox, Radio, ErrorMessage)
@p 2
@tags lld, forms, validation, react
@quick
- `<Form schema onSubmit defaultValues>` provides a context; fields register via `useField(name)`.
- **Controlled vs uncontrolled**: controlled = React state per keystroke (easy, can re-render a lot); uncontrolled = refs/DOM (fast, e.g. React Hook Form).
- Validation: a schema (Zod) on blur/submit, plus **async validation** (username available?) with debounce; server errors mapped to fields.
- Form state: values, errors, touched, dirty, isSubmitting, submitCount; disable submit while submitting; focus the first error.
- a11y: `<label htmlFor>`, `aria-invalid`, `aria-describedby` → error id.

::: code jsx Mini form library with context + schema validation + async validation
import { createContext, useContext, useState } from 'react';

const FormCtx = createContext(null);

export function Form({ defaultValues = {}, validate, onSubmit, children }) {
  const [values, setValues] = useState(defaultValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const setValue = (name, v) => setValues((s) => ({ ...s, [name]: v }));
  const runValidation = async (vals) => { const e = (await validate?.(vals)) || {}; setErrors(e); return e; };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(Object.fromEntries(Object.keys(values).map((k) => [k, true])));
    const errs = await runValidation(values);
    if (Object.keys(errs).length) {
      document.querySelector(`[name="${Object.keys(errs)[0]}"]`)?.focus(); // focus first error
      return;
    }
    setSubmitting(true);
    try { await onSubmit(values, { setErrors }); }  // server can set field errors
    finally { setSubmitting(false); }
  };

  return (
    <FormCtx.Provider value={{ values, errors, touched, setValue, setTouched, runValidation, submitting }}>
      <form noValidate onSubmit={handleSubmit}>{children}</form>
    </FormCtx.Provider>
  );
}

export function useField(name) {
  const f = useContext(FormCtx);
  return {
    value: f.values[name] ?? '',
    error: f.touched[name] ? f.errors[name] : undefined,
    onChange: (e) => f.setValue(name, e.target.type === 'checkbox' ? e.target.checked : e.target.value),
    onBlur: () => { f.setTouched((t) => ({ ...t, [name]: true })); f.runValidation(f.values); },
  };
}

export function Input({ name, label, type = 'text', ...rest }) {
  const { value, error, onChange, onBlur } = useField(name);
  const errId = `${name}-error`;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} value={value} onChange={onChange} onBlur={onBlur}
        aria-invalid={!!error} aria-describedby={error ? errId : undefined} {...rest} />
      <ErrorMessage id={errId} error={error} />
    </div>
  );
}

export function Select({ name, label, options }) {
  const { value, error, onChange, onBlur } = useField(name);
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} value={value} onChange={onChange} onBlur={onBlur} aria-invalid={!!error}>
        <option value="">Select…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ErrorMessage error={error} />
    </div>
  );
}

export function Checkbox({ name, label }) {
  const { value, onChange, error } = useField(name);
  return (<label><input type="checkbox" name={name} checked={!!value} onChange={onChange} /> {label}<ErrorMessage error={error} /></label>);
}

export function RadioGroup({ name, label, options }) {
  const { value, onChange } = useField(name);
  return (
    <fieldset><legend>{label}</legend>
      {options.map((o) => <label key={o.value}><input type="radio" name={name} value={o.value} checked={value === o.value} onChange={onChange} /> {o.label}</label>)}
    </fieldset>
  );
}

export const ErrorMessage = ({ error, id }) => (error ? <p id={id} className="error" role="alert">{error}</p> : null);

export function SubmitButton({ children }) {
  const { submitting } = useContext(FormCtx);
  return <button type="submit" disabled={submitting}>{submitting ? 'Saving…' : children}</button>;
}

// ---------- usage ----------
// const validate = async (v) => {
//   const e = {};
//   if (!v.email?.includes('@')) e.email = 'Enter a valid email';
//   if ((v.password || '').length < 8) e.password = 'Min 8 characters';
//   if (v.username && !(await api.get(`/users/available?u=${v.username}`)).data.available) e.username = 'Username taken'; // async
//   if (!v.terms) e.terms = 'Accept the terms';
//   return e;
// };
// <Form defaultValues={{ email: '', role: 'dev' }} validate={validate} onSubmit={async (values, { setErrors }) => {
//   try { await api.post('/signup', values); } catch (err) { if (err.details) setErrors(Object.fromEntries(err.details.map(d => [d.field, d.message]))); }
// }}>
//   <Input name="email" label="Email" type="email" />  <Input name="username" label="Username" />
//   <Input name="password" label="Password" type="password" />
//   <Select name="role" label="Role" options={[{ value: 'dev', label: 'Developer' }, { value: 'pm', label: 'PM' }]} />
//   <RadioGroup name="plan" label="Plan" options={[{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }]} />
//   <Checkbox name="terms" label="I accept the terms" /> <SubmitButton>Create account</SubmitButton>
// </Form>
:::

::: ask
- *"How big/dynamic are the forms (field arrays, conditional fields, multi-step wizard)? Is there a design system? Are validation rules shared with the backend?"*
- In production: **React Hook Form + Zod resolver** (uncontrolled, performant).
:::

::: links
React Hook Form | https://react-hook-form.com
:::

=== Design a Modal / Dialog system
@p 2
@tags lld, modal, a11y, portal
@quick
- Render via **portal** (escape `overflow`/`z-index` issues); a **modal stack** manager supports nested/multiple modals (only the top one handles Esc/outside click).
- **Focus management**: move focus into the modal on open, **trap Tab** inside, **restore focus** to the trigger on close.
- a11y: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`; make the background `inert`; **lock body scroll**.
- API: declarative `<Modal open onClose title>` + imperative `const ok = await confirm({ title })` (promise-based).
- Native `<dialog>` + `showModal()` gives focus trap/Esc/top-layer for free.

::: code jsx Modal with portal, stack, focus trap, scroll lock + promise-based confirm
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const stack = []; // ids of open modals (top = last)

export function Modal({ open, onClose, title, children, closeOnOverlay = true }) {
  const id = useId();
  const dialogRef = useRef(null);
  const lastFocused = useRef(null);

  useEffect(() => {
    if (!open) return;
    stack.push(id);
    lastFocused.current = document.activeElement;
    document.body.style.overflow = 'hidden';                        // scroll lock
    const focusables = () => dialogRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusables()[0]?.focus();

    const onKey = (e) => {
      if (stack[stack.length - 1] !== id) return;                    // only the top modal reacts
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {                                         // focus trap
        const els = [...focusables()];
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(id), 1);
      if (!stack.length) document.body.style.overflow = '';
      lastFocused.current?.focus();                                  // restore focus
    };
  }, [open, id, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => closeOnOverlay && e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="dialog">
        <h2 id={`${id}-title`}>{title}</h2>
        {children}
        <button aria-label="Close" className="dialog-close" onClick={onClose}>✕</button>
      </div>
    </div>,
    document.body
  );
}

// ---------- imperative confirm(): const ok = await confirm({ title: 'Delete?' }) ----------
const ConfirmCtx = createContext(null);
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = (opts) => new Promise((resolve) => setState({ ...opts, resolve }));
  const close = (result) => { state.resolve(result); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title}>
        <p>{state?.message}</p>
        <button onClick={() => close(false)}>Cancel</button>
        <button onClick={() => close(true)}>{state?.confirmText || 'Confirm'}</button>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// usage:
// const confirm = useConfirm();
// if (await confirm({ title: 'Delete order?', message: 'This cannot be undone', confirmText: 'Delete' })) deleteOrder();
:::

::: ask
- *"Nested modals? Routes for modals (deep links like /photos/1 opening in a modal)? Mobile full-screen sheets? Animations?"*
:::

::: links
WAI-ARIA dialog (modal) pattern | https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
MDN: dialog element | https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
:::

=== Design a React API / data-fetching layer
@p 3
@tags lld, react-query, architecture
@quick
- **Component → custom hook → React Query → API client → HTTP**.
- API logic lives in **API modules** (one per resource), never inside components.
- **Caching**: query keys + `staleTime`/`gcTime`; invalidate after mutations; optimistic updates.
- **Retry**: only for network/5xx, exponential backoff; **auth**: interceptor adds the token + refresh on 401 (single-flight).
- **Errors**: normalised error object; global handler + local handling; **cancellation**: AbortSignal passed by React Query.

::: text
| Question | Answer |
|---|---|
| Where should API logic live? | `api/*.js` modules (URLs, params, response mapping); hooks in `features/*/hooks` |
| How do you handle caching? | React Query cache keyed by `[resource, params]`; `staleTime` per data type; `invalidateQueries` after writes; `setQueryData` for instant updates |
| Retry? | `retry: (count, err) => err.status >= 500 && count < 3`; never retry 4xx; mutations only if idempotent |
| Authentication? | Axios request interceptor adds the Bearer token; a response interceptor refreshes on 401 **once** and replays queued requests |
| Error handling? | Interceptor normalises to `{ status, code, message, details }`; QueryCache `onError` toasts; forms map `details` |
| Request cancellation? | `queryFn: ({ signal }) => api.get(url, { signal })`; React Query aborts when the key changes or the component unmounts |
:::

::: diagram
flowchart TD
  C["Component: OrdersPage"] --> H["useOrders(filters)"]
  H --> RQ["React Query: cache, dedupe, retry, cancel"]
  RQ --> API["ordersApi.list(params, signal)"]
  API --> AX["axios instance"]
  AX --> INT1["request interceptor: auth header, request id"]
  AX --> INT2["response interceptor: normalise errors, refresh on 401"]
  AX --> NET(["HTTP → Express API"])
:::

::: code javascript The full layer in one file (split into files in a real project)
import axios from 'axios';
import { QueryClient, QueryCache, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// 1) HTTP client
let accessToken = null;
export const setToken = (t) => { accessToken = t; };
export const http = axios.create({ baseURL: '/api/v1', timeout: 15000, withCredentials: true });
http.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  cfg.headers['X-Request-Id'] = crypto.randomUUID();
  return cfg;
});
let refreshing = null;
http.interceptors.response.use(null, async (err) => {
  const cfg = err.config;
  if (err.response?.status === 401 && !cfg._retried) {
    cfg._retried = true;
    refreshing ??= http.post('/auth/refresh').then((r) => setToken(r.data.accessToken)).finally(() => (refreshing = null));
    await refreshing;
    return http(cfg);
  }
  return Promise.reject({ status: err.response?.status, code: err.response?.data?.code || (axios.isCancel(err) ? 'CANCELED' : 'NETWORK'), message: err.response?.data?.message || err.message });
});

// 2) API module
export const productsApi = {
  list: (params, signal) => http.get('/products', { params, signal }).then((r) => r.data),
  update: (id, body) => http.patch(`/products/${id}`, body).then((r) => r.data.data),
};

// 3) Query keys
export const productKeys = { all: ['products'], list: (p) => ['products', 'list', p], detail: (id) => ['products', 'detail', id] };

// 4) Query client defaults
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (e) => e.status >= 500 && console.error('toast:', e.message) }),
  defaultOptions: { queries: { staleTime: 30_000, retry: (n, e) => (e.status >= 500 || e.code === 'NETWORK') && n < 3 } },
});

// 5) Hooks used by components
export const useProducts = (params) =>
  useQuery({ queryKey: productKeys.list(params), queryFn: ({ signal }) => productsApi.list(params, signal) });

export const useUpdateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }) => productsApi.update(id, body),
    onSuccess: (p) => { qc.setQueryData(productKeys.detail(p.id), p); qc.invalidateQueries({ queryKey: productKeys.all }); },
  });
};
:::

::: ask
- *"REST or GraphQL? Existing state management (Redux/RTK Query)? Offline support? Real-time updates?"* (WebSocket events → `invalidateQueries` / `setQueryData`.)
:::

::: links
TanStack Query overview | https://tanstack.com/query/latest/docs/framework/react/overview
Practical React Query (TkDodo) | https://tkdodo.eu/blog/practical-react-query
:::

=== Design an Authentication system (frontend)
@p 2
@tags lld, auth, react, routing
@quick
- Flow: Login → token → **auth state** (context/store) → **protected routes** → API requests with the token.
- Access token in memory, refresh token in an httpOnly cookie; restore the session on boot via `/auth/refresh`.
- Interceptors: attach the token; on 401 refresh **once** (single-flight) and replay; on failure → logout.
- Route protection: `<ProtectedRoute roles>` + remember the redirect target; logout clears the React Query cache; sync logout across tabs (BroadcastChannel).
- Token expiry: proactive refresh before `exp`, or reactive on 401.

::: text
See *Full-Stack Integration → "How do you handle authentication between frontend and backend?"* for the complete AuthProvider + ProtectedRoute code. In an LLD interview, structure your answer like this:

| Part | Design |
|---|---|
| **State** | `AuthContext { status: 'checking' | 'authenticated' | 'anonymous', user, login, logout }` |
| **Storage** | Access token in memory; refresh token in an httpOnly Secure SameSite cookie |
| **Boot** | `status = checking` → `POST /auth/refresh` → authenticated / anonymous (show a splash while checking) |
| **Route guard** | `<ProtectedRoute>` redirects to `/login?next=/orders`; role guard → 403 page |
| **HTTP** | Request interceptor adds the Bearer token; the response interceptor handles 401 → refresh (shared promise) → retry |
| **Expiry** | Decode `exp` and schedule a refresh 1 minute early (optional), plus reactive 401 handling |
| **Logout** | Server revokes refresh → clear the token and React Query cache → BroadcastChannel('auth').postMessage('logout') |
| **Security** | No tokens in localStorage, CSRF protection for cookie endpoints, CSP to reduce XSS |
:::

::: code javascript Multi-tab logout sync + proactive refresh scheduling
// Cross-tab logout
const channel = new BroadcastChannel('auth');
export function broadcastLogout() { channel.postMessage({ type: 'logout' }); }
channel.onmessage = (e) => { if (e.data.type === 'logout') window.location.assign('/login'); };

// Proactive refresh: schedule a refresh 60s before the access token expires
let refreshTimer;
export function scheduleRefresh(accessToken, refreshFn) {
  const { exp } = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  const delay = exp * 1000 - Date.now() - 60_000;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshFn, Math.max(delay, 0));
}
:::

::: ask
- *"SSO / OAuth provider? MFA? Remember me? Multi-tenant org switching? Role-based UI?"*
:::

::: links
OWASP: Session management | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
:::

=== Design a File Upload component
@p 3
@tags lld, upload, s3, react
@quick
- Features: **multiple files**, drag & drop, **validation** (type/size/count), **preview** (object URLs), **progress** per file, **cancel** (AbortController), **retry**, S3 presigned upload.
- State per file: `{ id, file, status: 'queued'|'uploading'|'done'|'error'|'canceled', progress, error, key }` in a reducer.
- **Concurrency limit** (e.g. 3 parallel uploads); revoke object URLs on unmount.
- Large files → multipart; resumable uploads; a11y: keyboard-accessible dropzone, progress with `aria-valuenow`.

::: code jsx FileUploader.jsx (multi-file, preview, progress, cancel, retry, S3 presigned)
import { useCallback, useEffect, useReducer, useRef } from 'react';
import axios from 'axios';

const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const CONCURRENCY = 3;

function reducer(state, action) {
  switch (action.type) {
    case 'add': return [...state, ...action.files];
    case 'update': return state.map((f) => (f.id === action.id ? { ...f, ...action.patch } : f));
    case 'remove': return state.filter((f) => f.id !== action.id);
    default: return state;
  }
}

export function FileUploader({ presign, onUploaded }) {
  const [files, dispatch] = useReducer(reducer, []);
  const controllers = useRef(new Map()); // id → AbortController

  const addFiles = (list) => {
    const items = [...list].map((file) => {
      const error = !ACCEPT.includes(file.type) ? 'Unsupported type' : file.size > MAX_SIZE ? 'Max 10MB' : null;
      return { id: crypto.randomUUID(), file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null, status: error ? 'error' : 'queued', progress: 0, error };
    });
    dispatch({ type: 'add', files: items });
  };

  const upload = useCallback(async (item) => {
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    dispatch({ type: 'update', id: item.id, patch: { status: 'uploading', progress: 0, error: null } });
    try {
      const { uploadUrl, key } = await presign({ contentType: item.file.type, size: item.file.size });
      await axios.put(uploadUrl, item.file, {
        headers: { 'Content-Type': item.file.type },
        signal: controller.signal,
        onUploadProgress: (e) => dispatch({ type: 'update', id: item.id, patch: { progress: Math.round((e.loaded / e.total) * 100) } }),
      });
      dispatch({ type: 'update', id: item.id, patch: { status: 'done', progress: 100, key } });
      onUploaded?.(key, item.file);
    } catch (err) {
      dispatch({ type: 'update', id: item.id, patch: axios.isCancel(err) ? { status: 'canceled' } : { status: 'error', error: err.message } });
    } finally {
      controllers.current.delete(item.id);
    }
  }, [presign, onUploaded]);

  // scheduler: keep at most CONCURRENCY uploads running
  useEffect(() => {
    const running = files.filter((f) => f.status === 'uploading').length;
    files.filter((f) => f.status === 'queued').slice(0, Math.max(0, CONCURRENCY - running)).forEach(upload);
  }, [files, upload]);

  // cleanup previews
  useEffect(() => () => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)), []); // eslint-disable-line

  return (
    <div>
      <label
        className="dropzone" tabIndex={0}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.currentTarget.querySelector('input').click()}
      >
        Drag files here or click to browse
        <input type="file" multiple hidden accept={ACCEPT.join(',')} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </label>

      <ul className="upload-list">
        {files.map((f) => (
          <li key={f.id}>
            {f.preview ? <img src={f.preview} alt="" width={48} height={48} /> : <span>📄</span>}
            <span>{f.file.name}</span>
            <progress max="100" value={f.progress} aria-label={`Upload progress ${f.file.name}`} />
            <span>{f.status}{f.error && `: ${f.error}`}</span>
            {f.status === 'uploading' && <button onClick={() => controllers.current.get(f.id)?.abort()}>Cancel</button>}
            {(f.status === 'error' || f.status === 'canceled') && !['Unsupported type', 'Max 10MB'].includes(f.error) && (
              <button onClick={() => dispatch({ type: 'update', id: f.id, patch: { status: 'queued' } })}>Retry</button>
            )}
            <button onClick={() => dispatch({ type: 'remove', id: f.id })} aria-label="Remove">✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// usage: <FileUploader presign={(body) => api.post('/uploads/presign', body).then(r => r.data)} onUploaded={(key) => saveAttachment(key)} />
:::

::: ask
- *"Max size/count/types? Images need cropping/compression client-side? Resumable after refresh? Where do files go (S3 direct vs backend)?"*
:::

::: links
MDN: drag and drop files | https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop
Uppy | https://uppy.io
:::

=== Design a Chat component
@p 2
@tags lld, websocket, chat, real-time
@quick
- Transport: **WebSocket** (Socket.IO / ws) for messages, typing, presence; REST for history (**cursor pagination**, load older on scroll up).
- Message model: `{ id, clientId, conversationId, senderId, text, createdAt, status: sending|sent|delivered|read|failed }`.
- **Optimistic send** with `clientId` → replace on server ack; retry failed ones; dedupe by id.
- **Reconnection** with exponential backoff + resync missed messages (`since=lastMessageId`); heartbeats.
- Typing indicator (throttled events, auto-expire), online status (presence), unread counts, auto-scroll only if near the bottom, virtualised list.

::: diagram
sequenceDiagram
  participant A as Alice (React)
  participant S as Chat server (WS)
  participant DB as MongoDB
  participant B as Bob (React)
  A->>A: optimistic message (status sending, clientId)
  A->>S: emit message:send (clientId, text)
  S->>DB: insert message
  S-->>A: ack (id, clientId, status sent)
  S->>B: message:new
  B-->>S: message:read
  S-->>A: status read
  A->>S: typing (throttled)
  S->>B: typing (Alice)
:::

::: code jsx useChat hook (Socket.IO): optimistic send, ack, typing, reconnection resync
import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useChat(conversationId, me) {
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const lastIdRef = useRef(null);

  useEffect(() => {
    const socket = io('/', { auth: { token: getAccessToken() }, reconnectionDelayMax: 10000 }); // built-in backoff
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join', { conversationId, since: lastIdRef.current }); // resync after reconnect
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('message:new', (msg) => {
      lastIdRef.current = msg.id;
      setMessages((list) => (list.some((m) => m.id === msg.id || m.clientId === msg.clientId)
        ? list.map((m) => (m.clientId === msg.clientId ? msg : m))      // replace optimistic
        : [...list, msg]));
    });
    socket.on('message:status', ({ id, status }) => setMessages((l) => l.map((m) => (m.id === id ? { ...m, status } : m))));
    socket.on('typing', ({ userId, name }) => {
      setTyping((t) => [...new Set([...t, name])]);
      setTimeout(() => setTyping((t) => t.filter((n) => n !== name)), 3000); // auto-expire
    });
    return () => socket.disconnect();
  }, [conversationId]);

  const send = useCallback((text) => {
    const clientId = crypto.randomUUID();
    const optimistic = { clientId, conversationId, senderId: me.id, text, createdAt: new Date().toISOString(), status: 'sending' };
    setMessages((l) => [...l, optimistic]);
    socketRef.current.timeout(5000).emit('message:send', optimistic, (err, ack) => {
      setMessages((l) => l.map((m) => (m.clientId === clientId ? (err ? { ...m, status: 'failed' } : { ...m, ...ack, status: 'sent' }) : m)));
    });
  }, [conversationId, me]);

  const lastTyping = useRef(0);
  const notifyTyping = () => {                                  // throttle to 1 event / 2s
    if (Date.now() - lastTyping.current > 2000) { lastTyping.current = Date.now(); socketRef.current.emit('typing', { conversationId }); }
  };

  const loadOlder = async () => {                               // cursor pagination via REST
    const before = messages[0]?.id;
    const { data } = await api.get(`/conversations/${conversationId}/messages`, { params: { before, limit: 30 } });
    setMessages((l) => [...data.items, ...l]);
  };

  return { messages, typing, connected, send, notifyTyping, loadOlder };
}
:::

::: ask
- *"1:1 or group chat? Scale (concurrent users)? Message persistence/search? Attachments? End-to-end encryption? Read receipts?"*
- Backend scaling: multiple WS servers → the **Redis adapter** (pub/sub) so users on different servers receive events.
:::

::: links
Socket.IO docs | https://socket.io/docs/v4/
Socket.IO Redis adapter | https://socket.io/docs/v4/redis-adapter/
:::

=== Design a Frontend Design System
@p 2
@tags lld, design-system, components, tokens
@quick
- Layers: **design tokens** (colour, spacing, typography, radius, shadow) → **theme** (light/dark via CSS variables) → **primitives** (Button, Input…) → **patterns** (Form, Table, Modal, Toast) → **layouts**.
- Component API principles: consistent props (`variant`, `size`, `disabled`, `asChild`/polymorphic `as`), composition over configuration, forward refs, controlled + uncontrolled.
- **Accessibility** built in (keyboard, ARIA, focus rings, contrast), headless primitives (Radix/React Aria).
- **Versioning** with semver + changesets, codemods for breaking changes; **testing** (unit, visual regression with Chromatic, a11y with axe); **docs** in Storybook.
- **Adoption**: publish as an npm package in a monorepo, champions per team, migration guides, usage analytics, contribution model.

::: text
### Architecture
| Layer | Examples |
|---|---|
| **Tokens** | `--color-primary-600`, `--space-4`, `--radius-md`, `--font-size-sm`, semantic tokens (`--color-bg-danger`) |
| **Theme** | Light/dark/brand themes by swapping CSS variable values (`[data-theme="dark"]`) |
| **Primitives** | Button, Input, Select, Checkbox, Radio, Tooltip, Dropdown, Tabs |
| **Patterns** | Form, Table, Modal, Toast, Layout (Stack, Grid, Sidebar) |
| **Tooling** | Storybook docs, visual tests, lint rules, Figma ↔ tokens sync (Style Dictionary) |

### Component API guidelines
- **Predictable props**: `variant="primary|secondary|ghost|danger"`, `size="sm|md|lg"`, `loading`, `disabled`, `leftIcon`.
- **Composition**: `<Modal><Modal.Header/><Modal.Body/></Modal>` (compound components).
- **Polymorphism**: `<Button as="a" href="…">` or `asChild`.
- `forwardRef` everywhere and pass through `...rest` props (className, data-*, aria-*).
- Never hard-code colours; always use tokens.

### Governance & adoption
Semver releases (changesets), a changelog, **deprecation warnings** before removal, **codemods**, an RFC process for new components, office hours, and adoption metrics (how many imports per app).
:::

::: diagram
flowchart TD
  T["Design tokens: JSON, Figma"] -->|"Style Dictionary"| CSS["CSS variables + TS constants"]
  CSS --> TH["Themes: light, dark, brand"]
  TH --> P["Primitives: Button, Input, Tooltip"]
  P --> PT["Patterns: Form, Table, Modal, Toast"]
  PT --> APP1["App A"]
  PT --> APP2["App B"]
  SB["Storybook docs + visual tests"] -.-> P
  SB -.-> PT
:::

::: code jsx Tokens + Button with variants, sizes, loading, polymorphic, forwardRef
// tokens.css
// :root { --color-primary: #4f46e5; --color-primary-contrast: #fff; --color-danger: #dc2626;
//         --space-2: 8px; --space-3: 12px; --radius-md: 8px; --font-sm: 13px; --font-md: 15px; }
// [data-theme='dark'] { --color-primary: #818cf8; }

import { forwardRef } from 'react';

const sizes = { sm: { padding: '4px 10px', fontSize: 'var(--font-sm)' }, md: { padding: '8px 14px', fontSize: 'var(--font-md)' } };
const variants = {
  primary: { background: 'var(--color-primary)', color: 'var(--color-primary-contrast)', border: 'none' },
  secondary: { background: 'transparent', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' },
  danger: { background: 'var(--color-danger)', color: '#fff', border: 'none' },
};

export const Button = forwardRef(function Button(
  { as: Comp = 'button', variant = 'primary', size = 'md', loading = false, disabled, leftIcon, children, style, ...rest },
  ref
) {
  return (
    <Comp
      ref={ref}
      aria-busy={loading || undefined}
      disabled={Comp === 'button' ? disabled || loading : undefined}
      aria-disabled={disabled || loading || undefined}
      style={{ borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'inline-flex', gap: 'var(--space-2)', alignItems: 'center', ...sizes[size], ...variants[variant], ...style }}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : leftIcon}
      {children}
    </Comp>
  );
});

// <Button variant="danger" loading={isDeleting}>Delete</Button>
// <Button as="a" href="/docs" variant="secondary">Docs</Button>
:::

::: ask
- *"How many apps/teams consume it? Existing Figma library? Theming/white-label needs? Framework (React only)? Tailwind or CSS-in-JS?"*
- Senior signal: talk about **governance, versioning and adoption**, not just components.
:::

::: links
Storybook | https://storybook.js.org
Radix UI primitives | https://www.radix-ui.com/primitives
Style Dictionary (tokens) | https://amzn.github.io/style-dictionary/
:::
