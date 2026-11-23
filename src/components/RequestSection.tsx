import type { HttpMethod } from '../config/options';
import { BODY_TYPES, HTTP_METHODS, METHODS_WITHOUT_BODY } from '../config/options';
import type {
  HeaderRow,
  RequestDraft,
  ValidationMessage,
} from '../config/types';
import type { CurlImport as CurlImportValue } from '../curl/parseCurl';
import { issueAt } from '../config/validation';
import { CurlImport } from './CurlImport';
import { Field } from './Field';
import { describedBy, errorDomId, fieldDomId } from './fieldIds';

interface RequestSectionProps {
  request: RequestDraft;
  issues: ValidationMessage[];
  onChange: (patch: Partial<RequestDraft>) => void;
  onImportCurl: (value: CurlImportValue) => void;
}

export function RequestSection({
  request,
  issues,
  onChange,
  onImportCurl,
}: RequestSectionProps) {
  const bodyBlocked = METHODS_WITHOUT_BODY.includes(request.method);

  function updateHeader(index: number, patch: Partial<HeaderRow>) {
    onChange({
      headers: request.headers.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    });
  }

  function removeHeader(index: number) {
    onChange({ headers: request.headers.filter((_, rowIndex) => rowIndex !== index) });
  }

  function addHeader() {
    onChange({ headers: [...request.headers, { name: '', value: '' }] });
  }

  function changeMethod(method: HttpMethod) {
    const patch: Partial<RequestDraft> = { method };
    if (METHODS_WITHOUT_BODY.includes(method)) {
      patch.bodyType = 'none';
      patch.body = '';
    }
    onChange(patch);
  }

  const methodError = issueAt(issues, 'request.method');
  const urlError = issueAt(issues, 'request.url');
  const bodyTypeError = issueAt(issues, 'request.bodyType');
  const bodyError = issueAt(issues, 'request.body');
  const headersError = issueAt(issues, 'request.headers');

  return (
    <section className="card" aria-labelledby="request-heading">
      <div className="card-heading">
        <div>
          <p className="eyebrow">01 · Request</p>
          <h2 id="request-heading">Target and payload</h2>
        </div>
        <span className="card-meta">{request.method}</span>
      </div>

      <CurlImport onImport={onImportCurl} />

      <div className="request-line">
        <Field
          path="request.method"
          label="HTTP method"
          error={methodError}
          className="method-field"
        >
          <select
            id={fieldDomId('request.method')}
            value={request.method}
            aria-invalid={methodError ? true : undefined}
            aria-describedby={describedBy('request.method', { error: methodError })}
            onChange={(event) => changeMethod(event.target.value as HttpMethod)}
          >
            {HTTP_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </Field>

        <Field
          path="request.url"
          label="Target URL"
          hint="Use an http:// or https:// URL."
          error={urlError}
          className="url-field"
        >
          <input
            id={fieldDomId('request.url')}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://api.example.com/orders"
            value={request.url}
            aria-invalid={urlError ? true : undefined}
            aria-describedby={describedBy('request.url', {
              hint: true,
              error: urlError,
            })}
            onChange={(event) => onChange({ url: event.target.value })}
          />
        </Field>
      </div>

      <fieldset className="field-group">
        <legend>
          Headers <span className="count-badge">{request.headers.length}</span>
        </legend>
        <p className="group-hint">
          Optional. Empty rows are ignored. Duplicate names are rejected.
        </p>
        {request.headers.length === 0 ? (
          <p className="empty-note">No request headers configured.</p>
        ) : (
          <div className="header-list">
            {request.headers.map((header, index) => {
              const namePath = `request.headers.${index}.name`;
              const valuePath = `request.headers.${index}.value`;
              const nameError = issueAt(issues, namePath);
              const valueError = issueAt(issues, valuePath);
              return (
                <div className="header-row" key={index}>
                  <div className="header-input">
                    <label className="sr-only" htmlFor={fieldDomId(namePath)}>
                      Header {index + 1} name
                    </label>
                    <input
                      id={fieldDomId(namePath)}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Authorization"
                      value={header.name}
                      aria-invalid={nameError ? true : undefined}
                      aria-describedby={describedBy(namePath, { error: nameError })}
                      onChange={(event) =>
                        updateHeader(index, { name: event.target.value })
                      }
                    />
                    {nameError ? (
                      <p className="field-error" id={errorDomId(namePath)}>
                        {nameError.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="header-input">
                    <label className="sr-only" htmlFor={fieldDomId(valuePath)}>
                      Header {index + 1} value
                    </label>
                    <input
                      id={fieldDomId(valuePath)}
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Bearer …"
                      value={header.value}
                      aria-invalid={valueError ? true : undefined}
                      aria-describedby={describedBy(valuePath, { error: valueError })}
                      onChange={(event) =>
                        updateHeader(index, { value: event.target.value })
                      }
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
                    aria-label={`Remove header ${index + 1}`}
                    onClick={() => removeHeader(index)}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {headersError ? <p className="field-error">{headersError.message}</p> : null}
        <button
          type="button"
          className="secondary-button"
          onClick={addHeader}
          disabled={request.headers.length >= 30}
        >
          Add header
        </button>
      </fieldset>

      <fieldset className="field-group">
        <legend>
          Body <span className="count-badge">{request.bodyType}</span>
        </legend>
        <div className="body-grid">
          <Field
            path="request.bodyType"
            label="Body format"
            hint={
              bodyBlocked
                ? `${request.method} requests cannot include a body.`
                : 'JSON and raw text bodies are supported.'
            }
            error={bodyTypeError}
          >
            <select
              id={fieldDomId('request.bodyType')}
              value={request.bodyType}
              disabled={bodyBlocked}
              aria-invalid={bodyTypeError ? true : undefined}
              aria-describedby={describedBy('request.bodyType', {
                hint: true,
                error: bodyTypeError,
              })}
              onChange={(event) =>
                onChange({
                  bodyType: event.target.value as RequestDraft['bodyType'],
                  body: '',
                })
              }
            >
              {BODY_TYPES.map((bodyType) => (
                <option key={bodyType.id} value={bodyType.id}>
                  {bodyType.label}
                </option>
              ))}
            </select>
          </Field>

          {request.bodyType !== 'none' ? (
            <div className="body-editor">
              <label htmlFor={fieldDomId('request.body')}>
                {request.bodyType === 'json' ? 'JSON payload' : 'Request body'}
              </label>
              <textarea
                id={fieldDomId('request.body')}
                rows={9}
                spellCheck={false}
                placeholder={
                  request.bodyType === 'json'
                    ? '{ "name": "Ada", "plan": "pro" }'
                    : 'Plain text request body'
                }
                value={request.body}
                aria-invalid={bodyError ? true : undefined}
                aria-describedby={describedBy('request.body', { error: bodyError })}
                onChange={(event) => onChange({ body: event.target.value })}
              />
              {request.bodyType === 'json' ? (
                <p className="field-hint">
                  A Content-Type: application/json header is added automatically
                  unless you define your own Content-Type.
                </p>
              ) : null}
              {bodyError ? (
                <p className="field-error" id={errorDomId('request.body')}>
                  {bodyError.message}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="empty-note body-empty">
              The request does not send a body.
            </p>
          )}
        </div>
      </fieldset>
    </section>
  );
}