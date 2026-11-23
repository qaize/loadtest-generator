import type { PacingDraft, ValidationMessage } from '../config/types';
import { issueAt } from '../config/validation';
import { Field } from './Field';
import { describedBy, fieldDomId } from './fieldIds';

interface PacingSectionProps {
  pacing: PacingDraft;
  issues: ValidationMessage[];
  onChange: (patch: Partial<PacingDraft>) => void;
}

export function PacingSection({ pacing, issues, onChange }: PacingSectionProps) {
  const error = issueAt(issues, 'pacing.sleepSeconds');

  return (
    <div className="rows">
      <p className="group-hint">
        Adds a <code>sleep()</code> call after the request and checks to create
        think time between iterations.
      </p>
      <Field
        path="pacing.sleepSeconds"
        label="Sleep between iterations (seconds)"
        hint="A number from 0.001 to 3,600. Decimals are allowed."
        error={error}
        className="narrow-field"
      >
        <input
          id={fieldDomId('pacing.sleepSeconds')}
          type="number"
          min={0.001}
          max={3_600}
          step="0.001"
          value={pacing.sleepSeconds}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy('pacing.sleepSeconds', {
            hint: true,
            error,
          })}
          onChange={(event) => onChange({ sleepSeconds: event.target.value })}
        />
      </Field>
      <p className="field-note">
        Arrival-rate executors already pace iterations, so k6 recommends against
        adding sleep to their scenarios.
      </p>
    </div>
  );
}