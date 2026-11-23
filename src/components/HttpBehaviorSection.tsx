import type { HttpBehaviorDraft, ValidationMessage } from '../config/types';
import { issueAt } from '../config/validation';
import { Field } from './Field';
import { describedBy, fieldDomId } from './fieldIds';

interface HttpBehaviorSectionProps {
  http: HttpBehaviorDraft;
  issues: ValidationMessage[];
  onChange: (patch: Partial<HttpBehaviorDraft>) => void;
}

export function HttpBehaviorSection({
  http,
  issues,
  onChange,
}: HttpBehaviorSectionProps) {
  const groupError = issueAt(issues, 'http.enabled');

  return (
    <div className="rows">
      <div className="field-grid">
        <Field
          path="http.userAgent"
          label="User agent"
          hint="Optional custom User-Agent header."
          error={issueAt(issues, 'http.userAgent')}
        >
          <input
            id={fieldDomId('http.userAgent')}
            type="text"
            spellCheck={false}
            placeholder="MyLoadTest/1.0"
            value={http.userAgent}
            aria-invalid={issueAt(issues, 'http.userAgent') ? true : undefined}
            aria-describedby={describedBy('http.userAgent', {
              hint: true,
              error: issueAt(issues, 'http.userAgent'),
            })}
            onChange={(event) => onChange({ userAgent: event.target.value })}
          />
        </Field>
        <Field
          path="http.maxRedirects"
          label="Maximum redirects"
          hint="Optional whole number. k6 defaults to 10."
          error={issueAt(issues, 'http.maxRedirects')}
        >
          <input
            id={fieldDomId('http.maxRedirects')}
            type="number"
            min={0}
            max={1_000}
            step={1}
            placeholder="10"
            value={http.maxRedirects}
            aria-invalid={issueAt(issues, 'http.maxRedirects') ? true : undefined}
            aria-describedby={describedBy('http.maxRedirects', {
              hint: true,
              error: issueAt(issues, 'http.maxRedirects'),
            })}
            onChange={(event) => onChange({ maxRedirects: event.target.value })}
          />
        </Field>
        <Field
          path="http.timeout"
          label="Request timeout"
          hint="Optional per-request timeout, for example 30s."
          error={issueAt(issues, 'http.timeout')}
        >
          <input
            id={fieldDomId('http.timeout')}
            type="text"
            spellCheck={false}
            placeholder="30s"
            value={http.timeout}
            aria-invalid={issueAt(issues, 'http.timeout') ? true : undefined}
            aria-describedby={describedBy('http.timeout', {
              hint: true,
              error: issueAt(issues, 'http.timeout'),
            })}
            onChange={(event) => onChange({ timeout: event.target.value })}
          />
        </Field>
      </div>

      <div className="checkbox-stack">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={http.discardResponseBodies}
            onChange={(event) =>
              onChange({ discardResponseBodies: event.target.checked })
            }
          />
          Discard response bodies
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={http.noConnectionReuse}
            onChange={(event) => onChange({ noConnectionReuse: event.target.checked })}
          />
          Disable HTTP keep-alive connection reuse
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={http.insecureSkipTLSVerify}
            onChange={(event) =>
              onChange({ insecureSkipTLSVerify: event.target.checked })
            }
          />
          Skip TLS certificate verification
        </label>
      </div>

      {http.insecureSkipTLSVerify ? (
        <p className="inline-warning">
          TLS verification will be disabled in the generated script. Only use this
          for test targets you trust.
        </p>
      ) : null}
      {groupError ? <p className="field-error">{groupError.message}</p> : null}
    </div>
  );
}