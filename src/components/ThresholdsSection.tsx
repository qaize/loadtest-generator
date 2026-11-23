import {
  THRESHOLD_METRICS,
  THRESHOLD_OPERATORS,
  getThresholdMetric,
  type ThresholdAggregation,
  type ThresholdMetricId,
  type ThresholdOperator,
} from '../config/options';
import { createThresholdRow } from '../config/defaults';
import type {
  ThresholdRow,
  ThresholdsDraft,
  ValidationMessage,
} from '../config/types';
import { issueAt } from '../config/validation';
import { Field } from './Field';
import { describedBy, fieldDomId } from './fieldIds';

interface ThresholdsSectionProps {
  thresholds: ThresholdsDraft;
  issues: ValidationMessage[];
  onChange: (next: ThresholdsDraft) => void;
}

export function ThresholdsSection({
  thresholds,
  issues,
  onChange,
}: ThresholdsSectionProps) {
  function updateRow(index: number, patch: Partial<ThresholdRow>) {
    onChange({
      ...thresholds,
      rows: thresholds.rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    });
  }

  function changeMetric(index: number, metricId: ThresholdMetricId) {
    const metric = getThresholdMetric(metricId);
    const current = thresholds.rows[index];
    const aggregation = metric?.aggregations.includes(current.aggregation)
      ? current.aggregation
      : (metric?.aggregations[0] ?? 'avg');
    updateRow(index, { metric: metricId, aggregation });
  }

  function removeRow(index: number) {
    onChange({
      ...thresholds,
      rows: thresholds.rows.filter((_, rowIndex) => rowIndex !== index),
    });
  }

  return (
    <div className="rows">
      {thresholds.rows.map((row, index) => {
        const basePath = `thresholds.rows.${index}`;
        const metric = getThresholdMetric(row.metric);
        const metricError = issueAt(issues, `${basePath}.metric`);
        const aggregationError = issueAt(issues, `${basePath}.aggregation`);
        const operatorError = issueAt(issues, `${basePath}.operator`);
        const valueError = issueAt(issues, `${basePath}.value`);
        const delayError = issueAt(issues, `${basePath}.delayAbortEval`);
        const rowError = issueAt(issues, basePath);
        return (
          <div className="builder-row threshold-row" key={index}>
            <div className="builder-row-head">
              <span className="row-number">Threshold {index + 1}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove threshold ${index + 1}`}
                onClick={() => removeRow(index)}
              >
                Remove
              </button>
            </div>
            <div className="threshold-grid">
              <Field
                path={`${basePath}.metric`}
                label="Metric"
                error={metricError}
                className="metric-select"
              >
                <select
                  id={fieldDomId(`${basePath}.metric`)}
                  value={row.metric}
                  aria-invalid={metricError ? true : undefined}
                  aria-describedby={describedBy(`${basePath}.metric`, {
                    error: metricError,
                  })}
                  onChange={(event) =>
                    changeMetric(index, event.target.value as ThresholdMetricId)
                  }
                >
                  {THRESHOLD_METRICS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                path={`${basePath}.aggregation`}
                label="Aggregation"
                error={aggregationError}
              >
                <select
                  id={fieldDomId(`${basePath}.aggregation`)}
                  value={row.aggregation}
                  aria-invalid={aggregationError ? true : undefined}
                  aria-describedby={describedBy(`${basePath}.aggregation`, {
                    error: aggregationError,
                  })}
                  onChange={(event) =>
                    updateRow(index, {
                      aggregation: event.target.value as ThresholdAggregation,
                    })
                  }
                >
                  {(metric?.aggregations ?? []).map((aggregation) => (
                    <option key={aggregation} value={aggregation}>
                      {aggregation}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                path={`${basePath}.operator`}
                label="Operator"
                error={operatorError}
              >
                <select
                  id={fieldDomId(`${basePath}.operator`)}
                  value={row.operator}
                  aria-invalid={operatorError ? true : undefined}
                  aria-describedby={describedBy(`${basePath}.operator`, {
                    error: operatorError,
                  })}
                  onChange={(event) =>
                    updateRow(index, {
                      operator: event.target.value as ThresholdOperator,
                    })
                  }
                >
                  {THRESHOLD_OPERATORS.map((operator) => (
                    <option key={operator} value={operator}>
                      {operator}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                path={`${basePath}.value`}
                label="Value"
                hint={metric?.valueHint}
                error={valueError}
              >
                <input
                  id={fieldDomId(`${basePath}.value`)}
                  type="number"
                  min={0}
                  step="any"
                  value={row.value}
                  aria-invalid={valueError ? true : undefined}
                  aria-describedby={describedBy(`${basePath}.value`, {
                    hint: true,
                    error: valueError,
                  })}
                  onChange={(event) => updateRow(index, { value: event.target.value })}
                />
              </Field>
            </div>
            <div className="inline-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={row.abortOnFail}
                  onChange={(event) =>
                    updateRow(index, {
                      abortOnFail: event.target.checked,
                      ...(!event.target.checked ? { delayAbortEval: '' } : {}),
                    })
                  }
                />
                Abort the test if this threshold fails
              </label>
              {row.abortOnFail ? (
                <Field
                  path={`${basePath}.delayAbortEval`}
                  label="Delay before abort check"
                  hint="Optional, for example 10s."
                  error={delayError}
                  className="delay-field"
                >
                  <input
                    id={fieldDomId(`${basePath}.delayAbortEval`)}
                    type="text"
                    spellCheck={false}
                    placeholder="10s"
                    value={row.delayAbortEval}
                    aria-invalid={delayError ? true : undefined}
                    aria-describedby={describedBy(`${basePath}.delayAbortEval`, {
                      hint: true,
                      error: delayError,
                    })}
                    onChange={(event) =>
                      updateRow(index, { delayAbortEval: event.target.value })
                    }
                  />
                </Field>
              ) : null}
            </div>
            {rowError ? <p className="field-error">{rowError.message}</p> : null}
          </div>
        );
      })}
      <div>
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            onChange({
              ...thresholds,
              rows: [
                ...thresholds.rows,
                createThresholdRow({
                  metric: 'http_req_failed',
                  aggregation: 'rate',
                  operator: '<',
                  value: '0.01',
                }),
              ],
            })
          }
          disabled={thresholds.rows.length >= 20}
        >
          Add threshold
        </button>
      </div>
    </div>
  );
}