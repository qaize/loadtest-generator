import { CHECK_TYPES, type CheckType } from '../config/options';
import { createCheckRow } from '../config/defaults';
import type { ChecksDraft, CheckRow, ValidationMessage } from '../config/types';
import { issueAt } from '../config/validation';
import { Field } from './Field';
import { describedBy, fieldDomId } from './fieldIds';

interface ChecksSectionProps {
  checks: ChecksDraft;
  issues: ValidationMessage[];
  onChange: (next: ChecksDraft) => void;
}

function expectedLabel(type: CheckType): string {
  switch (type) {
    case 'status':
      return 'Expected status code';
    case 'bodyIncludes':
      return 'Text to find';
    case 'duration':
      return 'Maximum time (ms)';
  }
}

function expectedHint(type: CheckType): string {
  switch (type) {
    case 'status':
      return 'For example 200 or 201.';
    case 'bodyIncludes':
      return 'The check passes when the response body contains this text.';
    case 'duration':
      return 'The check passes when the response time is under this value.';
  }
}

export function ChecksSection({ checks, issues, onChange }: ChecksSectionProps) {
  function updateRow(index: number, patch: Partial<CheckRow>) {
    onChange({
      ...checks,
      rows: checks.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    });
  }

  function removeRow(index: number) {
    onChange({
      ...checks,
      rows: checks.rows.filter((_, rowIndex) => rowIndex !== index),
    });
  }

  function changeType(index: number, type: CheckType) {
    const row = checks.rows[index];
    updateRow(index, {
      type,
      expected: type === 'status' ? '200' : type === 'duration' ? '500' : row.expected,
    });
  }

  return (
    <div className="rows">
      {checks.rows.map((row, index) => {
        const basePath = `checks.rows.${index}`;
        const nameError = issueAt(issues, `${basePath}.name`);
        const typeError = issueAt(issues, `${basePath}.type`);
        const expectedError = issueAt(issues, `${basePath}.expected`);
        return (
          <div className="builder-row" key={index}>
            <div className="builder-row-head">
              <span className="row-number">Check {index + 1}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove check ${index + 1}`}
                onClick={() => removeRow(index)}
              >
                Remove
              </button>
            </div>
            <div className="check-grid">
              <Field
                path={`${basePath}.name`}
                label="Check name"
                error={nameError}
              >
                <input
                  id={fieldDomId(`${basePath}.name`)}
                  type="text"
                  spellCheck={false}
                  value={row.name}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={describedBy(`${basePath}.name`, {
                    error: nameError,
                  })}
                  onChange={(event) => updateRow(index, { name: event.target.value })}
                />
              </Field>
              <Field
                path={`${basePath}.type`}
                label="Assertion"
                error={typeError}
              >
                <select
                  id={fieldDomId(`${basePath}.type`)}
                  value={row.type}
                  aria-invalid={typeError ? true : undefined}
                  aria-describedby={describedBy(`${basePath}.type`, {
                    error: typeError,
                  })}
                  onChange={(event) =>
                    changeType(index, event.target.value as CheckType)
                  }
                >
                  {CHECK_TYPES.map((checkType) => (
                    <option key={checkType.id} value={checkType.id}>
                      {checkType.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                path={`${basePath}.expected`}
                label={expectedLabel(row.type)}
                hint={expectedHint(row.type)}
                error={expectedError}
              >
                <input
                  id={fieldDomId(`${basePath}.expected`)}
                  type={row.type === 'bodyIncludes' ? 'text' : 'number'}
                  min={row.type === 'status' ? 100 : row.type === 'duration' ? 1 : undefined}
                  max={row.type === 'status' ? 599 : row.type === 'duration' ? 600_000 : undefined}
                  step={1}
                  spellCheck={false}
                  value={row.expected}
                  aria-invalid={expectedError ? true : undefined}
                  aria-describedby={describedBy(`${basePath}.expected`, {
                    hint: true,
                    error: expectedError,
                  })}
                  onChange={(event) => updateRow(index, { expected: event.target.value })}
                />
              </Field>
            </div>
          </div>
        );
      })}
      <div>
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            onChange({
              ...checks,
              rows: [
                ...checks.rows,
                createCheckRow(`check ${checks.rows.length + 1}`),
              ],
            })
          }
          disabled={checks.rows.length >= 20}
        >
          Add check
        </button>
      </div>
    </div>
  );
}