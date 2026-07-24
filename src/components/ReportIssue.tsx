import { useState } from 'react';
import { Disclosure } from './ui';

// ============================================================================
// Local-only "report an issue" — no backend, no network, no session-schema
// change. Notes are appended to a dedicated localStorage key, kept entirely
// separate from the session repository so persistence behaviour is untouched.
// ============================================================================

const STORAGE_KEY = 'saler.issues';

const CATEGORIES = [
  'Technical',
  'Transcript',
  'Evaluation',
  'Voice',
  'Customer',
  'Other',
] as const;

type Category = (typeof CATEGORIES)[number];

interface IssueNote {
  id: string;
  at: number;
  category: Category;
  detail: string;
}

function saveIssue(note: IssueNote): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list : [];
    arr.unshift(note);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, 50)));
    return true;
  } catch {
    return false;
  }
}

export function ReportIssue() {
  const [category, setCategory] = useState<Category>('Technical');
  const [detail, setDetail] = useState('');
  const [saved, setSaved] = useState(false);

  const submit = () => {
    const trimmed = detail.trim();
    if (trimmed.length === 0) return;
    saveIssue({
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `issue-${Date.now()}`,
      at: Date.now(),
      category,
      detail: trimmed.slice(0, 1000),
    });
    setDetail('');
    setSaved(true);
  };

  return (
    <Disclosure summary="Report a problem">
      <p className="text-sm text-ink-secondary">
        Noticed something off? Jot it down. Notes stay on this device — nothing
        is sent anywhere.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="issue-category" className="eyebrow">
            Category
          </label>
          <select
            id="issue-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="mt-1.5 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="issue-detail" className="eyebrow">
            What happened
          </label>
          <textarea
            id="issue-detail"
            rows={3}
            value={detail}
            onChange={(e) => {
              setDetail(e.target.value);
              setSaved(false);
            }}
            placeholder="Describe what you saw…"
            className="mt-1.5 w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={submit}
            disabled={detail.trim().length === 0}
          >
            Save note
          </button>
          {saved && (
            <span role="status" className="text-sm text-positive">
              Saved locally.
            </span>
          )}
        </div>
      </div>
    </Disclosure>
  );
}
