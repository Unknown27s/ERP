/**
 * Shared page header.
 *
 * Mirrors the marketing-grade header already used by the CRM screens so every
 * module opens with the same eyebrow / title / description / actions rhythm.
 */
import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  meta,
  title,
  description,
  actions,
}: {
  /** Small uppercase module label, e.g. "CRM & Sales". */
  eyebrow?: string;
  /** Optional context after a bullet, e.g. a date or record count. */
  meta?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {(eyebrow || meta) && (
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            {eyebrow && (
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                {eyebrow}
              </span>
            )}
            {eyebrow && meta && <span className="text-slate-300">•</span>}
            {meta && <span className="text-xs text-slate-500">{meta}</span>}
          </div>
        )}
        <h1 className="text-2xl font-semibold leading-8 tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export default PageHeader;
