import type { TagRow, TagsDraft, ValidationMessage } from '../config/types';
import { issueAt } from '../config/validation';
import { errorDomId, fieldDomId } from './fieldIds';

interface TagsSectionProps {
  tags: TagsDraft;
  issues: ValidationMessage[];
  onChange: (next: TagsDraft) => void;
}

export function TagsSection({ tags, issues, onChange }: TagsSectionProps) {
  function updateRow(index: number, patch: Partial<TagRow>) {
    onChange({
      ...tags,
      rows: tags.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    });
  }

  function removeRow(index: number) {
    onChange({
      ...tags,
      rows: tags.rows.filter((_, rowIndex) => rowIndex !== index),
    });
  }

  const rowsError = issueAt(issues, 'tags.rows');

  return (
    <div className="rows">
      <p className="group-hint">
        Tags are applied test-wide through the k6 <code>options.tags</code>{' '}
        setting. Empty rows are ignored.
      </p>
      <div className="tag-list">
        {tags.rows.map((row, index) => {
          const namePath = `tags.rows.${index}.name`;
          const valuePath = `tags.rows.${index}.value`;
          const nameError = issueAt(issues, namePath);
          const valueError = issueAt(issues, valuePath);
          return (
            <div className="tag-row" key={index}>
              <div className="header-input">
                <label className="sr-only" htmlFor={fieldDomId(namePath)}>
                  Tag {index + 1} name
                </label>
                <input
                  id={fieldDomId(namePath)}
                  type="text"
                  spellCheck={false}
                  placeholder="environment"
                  value={row.name}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? errorDomId(namePath) : undefined}
                  onChange={(event) => updateRow(index, { name: event.target.value })}
                />
                {nameError ? (
                  <p className="field-error" id={errorDomId(namePath)}>
                    {nameError.message}
                  </p>
                ) : null}
              </div>
              <div className="header-input">
                <label className="sr-only" htmlFor={fieldDomId(valuePath)}>
                  Tag {index + 1} value
                </label>
                <input
                  id={fieldDomId(valuePath)}
                  type="text"
                  spellCheck={false}
                  placeholder="staging"
                  value={row.value}
                  aria-invalid={valueError ? true : undefined}
                  aria-describedby={valueError ? errorDomId(valuePath) : undefined}
                  onChange={(event) => updateRow(index, { value: event.target.value })}
                />
                {valueError ? (
                  <p className="field-error" id={errorDomId(valuePath)}>
                    {valueError.message}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove tag ${index + 1}`}
                onClick={() => removeRow(index)}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
      {rowsError ? <p className="field-error">{rowsError.message}</p> : null}
      <div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onChange({ ...tags, rows: [...tags.rows, { name: '', value: '' }] })}
          disabled={tags.rows.length >= 20}
        >
          Add tag
        </button>
      </div>
    </div>
  );
}