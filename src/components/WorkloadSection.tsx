import { EXECUTORS, usesStages, type Executor } from '../config/options';
import type { WorkloadDraft, ValidationMessage } from '../config/types';
import { issueAt } from '../config/validation';
import { Field } from './Field';
import { describedBy, fieldDomId } from './fieldIds';

interface WorkloadSectionProps {
  workload: WorkloadDraft;
  issues: ValidationMessage[];
  onChange: (patch: Partial<WorkloadDraft>) => void;
}

export function WorkloadSection({
  workload,
  issues,
  onChange,
}: WorkloadSectionProps) {
  const executorMeta = EXECUTORS.find((item) => item.id === workload.executor);

  function updateStage(index: number, patch: { target?: string; duration?: string }) {
    onChange({
      stages: workload.stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patch } : stage,
      ),
    });
  }

  function removeStage(index: number) {
    onChange({ stages: workload.stages.filter((_, stageIndex) => stageIndex !== index) });
  }

  function addStage() {
    onChange({ stages: [...workload.stages, { target: '10', duration: '10s' }] });
  }

  const executorError = issueAt(issues, 'workload.executor');
  const stagesError = issueAt(issues, 'workload.stages');
  const stages = usesStages(workload.executor);
  const isArrivalRate =
    workload.executor === 'constant-arrival-rate' ||
    workload.executor === 'ramping-arrival-rate';
  const stageTargetLabel = isArrivalRate ? 'Target iterations' : 'Target VUs';

  return (
    <section className="card" aria-labelledby="workload-heading">
      <div className="card-heading">
        <div>
          <p className="eyebrow">02 · Workload</p>
          <h2 id="workload-heading">Scenario shape</h2>
        </div>
        <span className="card-meta">{executorMeta?.label ?? 'Custom'}</span>
      </div>

      <Field
        path="workload.executor"
        label="Executor"
        hint={executorMeta?.description}
        error={executorError}
      >
        <select
          id={fieldDomId('workload.executor')}
          value={workload.executor}
          aria-invalid={executorError ? true : undefined}
          aria-describedby={describedBy('workload.executor', {
            hint: true,
            error: executorError,
          })}
          onChange={(event) => onChange({ executor: event.target.value as Executor })}
        >
          {EXECUTORS.map((executor) => (
            <option key={executor.id} value={executor.id}>
              {executor.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="field-grid">
        {workload.executor === 'constant-vus' ? (
          <>
            <Field
              path="workload.vus"
              label="Virtual users (VUs)"
              hint="1–100,000"
              error={issueAt(issues, 'workload.vus')}
            >
              <input
                id={fieldDomId('workload.vus')}
                type="number"
                min={1}
                max={100_000}
                step={1}
                value={workload.vus}
                aria-invalid={issueAt(issues, 'workload.vus') ? true : undefined}
                aria-describedby={describedBy('workload.vus', {
                  hint: true,
                  error: issueAt(issues, 'workload.vus'),
                })}
                onChange={(event) => onChange({ vus: event.target.value })}
              />
            </Field>
            <Field
              path="workload.duration"
              label="Duration"
              hint="For example 30s, 2m, or 1m30s."
              error={issueAt(issues, 'workload.duration')}
            >
              <input
                id={fieldDomId('workload.duration')}
                type="text"
                spellCheck={false}
                placeholder="30s"
                value={workload.duration}
                aria-invalid={issueAt(issues, 'workload.duration') ? true : undefined}
                aria-describedby={describedBy('workload.duration', {
                  hint: true,
                  error: issueAt(issues, 'workload.duration'),
                })}
                onChange={(event) => onChange({ duration: event.target.value })}
              />
            </Field>
          </>
        ) : null}

        {workload.executor === 'ramping-vus' ? (
          <Field
            path="workload.startVUs"
            label="Starting VUs"
            hint="VUs active at the start of the scenario."
            error={issueAt(issues, 'workload.startVUs')}
          >
            <input
              id={fieldDomId('workload.startVUs')}
              type="number"
              min={0}
              max={100_000}
              step={1}
              value={workload.startVUs}
              aria-invalid={issueAt(issues, 'workload.startVUs') ? true : undefined}
              aria-describedby={describedBy('workload.startVUs', {
                hint: true,
                error: issueAt(issues, 'workload.startVUs'),
              })}
              onChange={(event) => onChange({ startVUs: event.target.value })}
            />
          </Field>
        ) : null}

        {workload.executor === 'shared-iterations' ||
        workload.executor === 'per-vu-iterations' ? (
          <>
            <Field
              path="workload.vus"
              label="Virtual users (VUs)"
              hint="1–100,000"
              error={issueAt(issues, 'workload.vus')}
            >
              <input
                id={fieldDomId('workload.vus')}
                type="number"
                min={1}
                max={100_000}
                step={1}
                value={workload.vus}
                aria-invalid={issueAt(issues, 'workload.vus') ? true : undefined}
                aria-describedby={describedBy('workload.vus', {
                  hint: true,
                  error: issueAt(issues, 'workload.vus'),
                })}
                onChange={(event) => onChange({ vus: event.target.value })}
              />
            </Field>
            <Field
              path="workload.iterations"
              label={
                workload.executor === 'shared-iterations'
                  ? 'Shared iterations'
                  : 'Iterations per VU'
              }
              hint="A whole number of iterations."
              error={issueAt(issues, 'workload.iterations')}
            >
              <input
                id={fieldDomId('workload.iterations')}
                type="number"
                min={1}
                step={1}
                value={workload.iterations}
                aria-invalid={issueAt(issues, 'workload.iterations') ? true : undefined}
                aria-describedby={describedBy('workload.iterations', {
                  hint: true,
                  error: issueAt(issues, 'workload.iterations'),
                })}
                onChange={(event) => onChange({ iterations: event.target.value })}
              />
            </Field>
            <Field
              path="workload.maxDuration"
              label="Maximum duration"
              hint="Optional. Leave blank to use k6's default."
              error={issueAt(issues, 'workload.maxDuration')}
            >
              <input
                id={fieldDomId('workload.maxDuration')}
                type="text"
                spellCheck={false}
                placeholder="10m"
                value={workload.maxDuration}
                aria-invalid={issueAt(issues, 'workload.maxDuration') ? true : undefined}
                aria-describedby={describedBy('workload.maxDuration', {
                  hint: true,
                  error: issueAt(issues, 'workload.maxDuration'),
                })}
                onChange={(event) => onChange({ maxDuration: event.target.value })}
              />
            </Field>
          </>
        ) : null}

        {workload.executor === 'constant-arrival-rate' ? (
          <>
            <Field
              path="workload.rate"
              label="Iterations per time unit"
              hint="A whole number, for example 30."
              error={issueAt(issues, 'workload.rate')}
            >
              <input
                id={fieldDomId('workload.rate')}
                type="number"
                min={1}
                step={1}
                value={workload.rate}
                aria-invalid={issueAt(issues, 'workload.rate') ? true : undefined}
                aria-describedby={describedBy('workload.rate', {
                  hint: true,
                  error: issueAt(issues, 'workload.rate'),
                })}
                onChange={(event) => onChange({ rate: event.target.value })}
              />
            </Field>
            <Field
              path="workload.timeUnit"
              label="Time unit"
              hint="For example 1s or 1m."
              error={issueAt(issues, 'workload.timeUnit')}
            >
              <input
                id={fieldDomId('workload.timeUnit')}
                type="text"
                spellCheck={false}
                placeholder="1s"
                value={workload.timeUnit}
                aria-invalid={issueAt(issues, 'workload.timeUnit') ? true : undefined}
                aria-describedby={describedBy('workload.timeUnit', {
                  hint: true,
                  error: issueAt(issues, 'workload.timeUnit'),
                })}
                onChange={(event) => onChange({ timeUnit: event.target.value })}
              />
            </Field>
            <Field
              path="workload.duration"
              label="Duration"
              hint="Total time at the configured rate."
              error={issueAt(issues, 'workload.duration')}
            >
              <input
                id={fieldDomId('workload.duration')}
                type="text"
                spellCheck={false}
                placeholder="30s"
                value={workload.duration}
                aria-invalid={issueAt(issues, 'workload.duration') ? true : undefined}
                aria-describedby={describedBy('workload.duration', {
                  hint: true,
                  error: issueAt(issues, 'workload.duration'),
                })}
                onChange={(event) => onChange({ duration: event.target.value })}
              />
            </Field>
          </>
        ) : null}

        {workload.executor === 'ramping-arrival-rate' ? (
          <Field
            path="workload.startRate"
            label="Starting rate"
            hint="Iterations per time unit at the start."
            error={issueAt(issues, 'workload.startRate')}
          >
            <input
              id={fieldDomId('workload.startRate')}
              type="number"
              min={0}
              step={1}
              value={workload.startRate}
              aria-invalid={issueAt(issues, 'workload.startRate') ? true : undefined}
              aria-describedby={describedBy('workload.startRate', {
                hint: true,
                error: issueAt(issues, 'workload.startRate'),
              })}
              onChange={(event) => onChange({ startRate: event.target.value })}
            />
          </Field>
        ) : null}

        {isArrivalRate ? (
          <>
            {workload.executor === 'ramping-arrival-rate' ? (
              <Field
                path="workload.timeUnit"
                label="Time unit"
                hint="For example 1s or 1m."
                error={issueAt(issues, 'workload.timeUnit')}
              >
                <input
                  id={fieldDomId('workload.timeUnit')}
                  type="text"
                  spellCheck={false}
                  placeholder="1s"
                  value={workload.timeUnit}
                  aria-invalid={issueAt(issues, 'workload.timeUnit') ? true : undefined}
                  aria-describedby={describedBy('workload.timeUnit', {
                    hint: true,
                    error: issueAt(issues, 'workload.timeUnit'),
                  })}
                  onChange={(event) => onChange({ timeUnit: event.target.value })}
                />
              </Field>
            ) : null}
            <Field
              path="workload.preAllocatedVUs"
              label="Pre-allocated VUs"
              hint="VUs reserved before the test starts."
              error={issueAt(issues, 'workload.preAllocatedVUs')}
            >
              <input
                id={fieldDomId('workload.preAllocatedVUs')}
                type="number"
                min={1}
                max={100_000}
                step={1}
                value={workload.preAllocatedVUs}
                aria-invalid={issueAt(issues, 'workload.preAllocatedVUs') ? true : undefined}
                aria-describedby={describedBy('workload.preAllocatedVUs', {
                  hint: true,
                  error: issueAt(issues, 'workload.preAllocatedVUs'),
                })}
                onChange={(event) => onChange({ preAllocatedVUs: event.target.value })}
              />
            </Field>
            <Field
              path="workload.maxVUs"
              label="Maximum VUs"
              hint="Optional. Leave blank to keep it equal to pre-allocated VUs."
              error={issueAt(issues, 'workload.maxVUs')}
            >
              <input
                id={fieldDomId('workload.maxVUs')}
                type="number"
                min={1}
                max={100_000}
                step={1}
                value={workload.maxVUs}
                aria-invalid={issueAt(issues, 'workload.maxVUs') ? true : undefined}
                aria-describedby={describedBy('workload.maxVUs', {
                  hint: true,
                  error: issueAt(issues, 'workload.maxVUs'),
                })}
                onChange={(event) => onChange({ maxVUs: event.target.value })}
              />
            </Field>
          </>
        ) : null}
      </div>

      {stages ? (
        <fieldset className="field-group">
          <legend>
            Stages <span className="count-badge">{workload.stages.length}</span>
          </legend>
          <p className="group-hint">
            Each stage moves linearly to {stageTargetLabel.toLowerCase()} over its
            duration.
          </p>
          <div className="stage-list">
            {workload.stages.map((stage, index) => {
              const targetPath = `workload.stages.${index}.target`;
              const durationPath = `workload.stages.${index}.duration`;
              const targetError = issueAt(issues, targetPath);
              const durationError = issueAt(issues, durationPath);
              return (
                <div className="stage-row" key={index}>
                  <Field
                    path={targetPath}
                    label={`Stage ${index + 1} ${stageTargetLabel.toLowerCase()}`}
                    error={targetError}
                  >
                    <input
                      id={fieldDomId(targetPath)}
                      type="number"
                      min={0}
                      max={isArrivalRate ? 1_000_000 : 100_000}
                      step={1}
                      value={stage.target}
                      aria-invalid={targetError ? true : undefined}
                      aria-describedby={describedBy(targetPath, { error: targetError })}
                      onChange={(event) =>
                        updateStage(index, { target: event.target.value })
                      }
                    />
                  </Field>
                  <Field
                    path={durationPath}
                    label={`Stage ${index + 1} duration`}
                    error={durationError}
                  >
                    <input
                      id={fieldDomId(durationPath)}
                      type="text"
                      spellCheck={false}
                      placeholder="10s"
                      value={stage.duration}
                      aria-invalid={durationError ? true : undefined}
                      aria-describedby={describedBy(durationPath, {
                        error: durationError,
                      })}
                      onChange={(event) =>
                        updateStage(index, { duration: event.target.value })
                      }
                    />
                  </Field>
                  <button
                    type="button"
                    className="icon-button stage-remove"
                    aria-label={`Remove stage ${index + 1}`}
                    disabled={workload.stages.length === 1}
                    onClick={() => removeStage(index)}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
          {stagesError ? <p className="field-error">{stagesError.message}</p> : null}
          <button
            type="button"
            className="secondary-button"
            onClick={addStage}
            disabled={workload.stages.length >= 20}
          >
            Add stage
          </button>
        </fieldset>
      ) : null}

      <details className="advanced">
        <summary>Advanced scenario timing</summary>
        <div className="field-grid">
          <Field
            path="workload.startTime"
            label="Start time"
            hint="Optional offset from the test start, for example 10s."
            error={issueAt(issues, 'workload.startTime')}
          >
            <input
              id={fieldDomId('workload.startTime')}
              type="text"
              spellCheck={false}
              placeholder="0s"
              value={workload.startTime}
              aria-invalid={issueAt(issues, 'workload.startTime') ? true : undefined}
              aria-describedby={describedBy('workload.startTime', {
                hint: true,
                error: issueAt(issues, 'workload.startTime'),
              })}
              onChange={(event) => onChange({ startTime: event.target.value })}
            />
          </Field>
          <Field
            path="workload.gracefulStop"
            label="Graceful stop"
            hint="Optional time to let running iterations finish."
            error={issueAt(issues, 'workload.gracefulStop')}
          >
            <input
              id={fieldDomId('workload.gracefulStop')}
              type="text"
              spellCheck={false}
              placeholder="30s"
              value={workload.gracefulStop}
              aria-invalid={issueAt(issues, 'workload.gracefulStop') ? true : undefined}
              aria-describedby={describedBy('workload.gracefulStop', {
                hint: true,
                error: issueAt(issues, 'workload.gracefulStop'),
              })}
              onChange={(event) => onChange({ gracefulStop: event.target.value })}
            />
          </Field>
          {workload.executor === 'ramping-vus' ? (
            <Field
              path="workload.gracefulRampDown"
              label="Graceful ramp-down"
              hint="Optional time to wait for iterations during a ramp-down."
              error={issueAt(issues, 'workload.gracefulRampDown')}
            >
              <input
                id={fieldDomId('workload.gracefulRampDown')}
                type="text"
                spellCheck={false}
                placeholder="30s"
                value={workload.gracefulRampDown}
                aria-invalid={
                  issueAt(issues, 'workload.gracefulRampDown') ? true : undefined
                }
                aria-describedby={describedBy('workload.gracefulRampDown', {
                  hint: true,
                  error: issueAt(issues, 'workload.gracefulRampDown'),
                })}
                onChange={(event) =>
                  onChange({ gracefulRampDown: event.target.value })
                }
              />
            </Field>
          ) : null}
        </div>
      </details>
    </section>
  );
}