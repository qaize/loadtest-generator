import { useState, type ReactNode } from 'react';

interface OptionalGroupProps {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  errorCount?: number;
  children: ReactNode;
}

export function OptionalGroup({
  id,
  title,
  description,
  enabled,
  onEnabledChange,
  errorCount = 0,
  children,
}: OptionalGroupProps) {
  const [open, setOpen] = useState(false);
  const contentId = `${id}-content`;

  function handleEnabledChange(checked: boolean) {
    onEnabledChange(checked);
    if (checked) {
      setOpen(true);
    }
  }

  return (
    <section
      className={`optional-group${enabled ? ' is-enabled' : ''}`}
      aria-labelledby={`${id}-title`}
    >
      <div className="optional-head">
        <div className="optional-title-row">
          <span className="switch">
            <input
              id={`${id}-enabled`}
              type="checkbox"
              checked={enabled}
              onChange={(event) => handleEnabledChange(event.target.checked)}
            />
            <span className="switch-track" aria-hidden="true" />
          </span>
          <label id={`${id}-title`} className="optional-title" htmlFor={`${id}-enabled`}>
            {title}
          </label>
          <span className={`status-chip${enabled ? ' status-chip--on' : ''}`}>
            {enabled ? 'Included' : 'Not included'}
          </span>
          {errorCount > 0 ? (
            <span className="status-chip status-chip--error">
              {errorCount} {errorCount === 1 ? 'issue' : 'issues'}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="collapse-button"
          aria-expanded={enabled && open}
          aria-controls={enabled ? contentId : undefined}
          disabled={!enabled}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? 'Hide' : 'Configure'}
          <span className="chevron" aria-hidden="true">
            {open ? '−' : '+'}
          </span>
        </button>
      </div>
      <p className="optional-description">{description}</p>
      {enabled ? (
        <div className="optional-content" id={contentId} hidden={!open}>
          {children}
        </div>
      ) : null}
    </section>
  );
}