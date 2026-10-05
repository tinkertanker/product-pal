import { STEPS, type StepDef } from '../shared/steps';
import type { Canvas, CompletionMode, StepId } from '../shared/canvas';
import { stepStatus, type StepStatus } from '../shared/judgeFlow';

type Props = {
  canvas: Canvas;
  current: number;
  onSelect: (index: number) => void;
  mode: CompletionMode;
  showTimings: boolean;
  /** Steps whose check is running right now. */
  checking: ReadonlySet<StepId>;
};

const STATUS_TEXT: Record<StepStatus, string> = { done: 'Done', checking: 'Checking…', almost: 'Almost there', filled: 'Filled in', todo: '' };

/** The small line under a step's title in the rail. Empty when there is nothing to say. */
function subline(step: StepDef, status: StepStatus, showTimings: boolean): string {
  return [showTimings ? `${step.minutes} min` : '', STATUS_TEXT[status]].filter(Boolean).join(' · ');
}

export function Stepper({ canvas, current, onSelect, mode, showTimings, checking }: Props) {
  return (
    <nav className="rail" aria-label="Steps">
      <ol>
        {STEPS.map((step, i) => {
          const status = stepStatus(canvas, step.id, mode, checking.has(step.id));
          const text = subline(step, status, showTimings);
          return (
            <li key={step.id}>
              <button
                type="button"
                className={`rail__item${i === current ? ' is-current' : ''}${status === 'done' ? ' is-done' : ''}${status === 'almost' ? ' is-almost' : ''}${status === 'filled' ? ' is-filled' : ''}${status === 'checking' ? ' is-checking' : ''}`}
                aria-current={i === current ? 'step' : undefined}
                onClick={() => onSelect(i)}
              >
                <span className="rail__num" aria-hidden="true">
                  {status === 'done' ? '✓' : step.number}
                </span>
                <span className="rail__text">
                  <span className="rail__title">{step.title}</span>
                  {text && <span className="rail__min">{text}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function MobileProgress({ canvas, current, onSelect, mode, showTimings, checking }: Props) {
  const done = STEPS.filter((s) => stepStatus(canvas, s.id, mode) === 'done').length;
  return (
    <div className="mobilebar">
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={done} aria-label="Steps complete">
        <div className="progress__fill" style={{ width: `${(done / STEPS.length) * 100}%` }} />
      </div>
      <label className="sr-only" htmlFor="step-select">
        Jump to step
      </label>
      <select id="step-select" value={current} onChange={(e) => onSelect(Number(e.target.value))}>
        {STEPS.map((step, i) => {
          const status = stepStatus(canvas, step.id, mode, checking.has(step.id));
          return (
            <option key={step.id} value={i}>
              {status === 'done' ? '✓ ' : ''}
              {step.number}. {step.title}
              {showTimings ? ` (${step.minutes} min)` : ''}
              {status === 'almost' ? ' (almost there)' : status === 'filled' ? ' (filled in)' : status === 'checking' ? ' (checking)' : ''}
            </option>
          );
        })}
      </select>
    </div>
  );
}
