import { STEPS } from '../shared/steps';
import { isStepComplete, type Canvas } from '../shared/canvas';

type Props = { canvas: Canvas; current: number; onSelect: (index: number) => void };

export function Stepper({ canvas, current, onSelect }: Props) {
  return (
    <nav className="rail" aria-label="Steps">
      <ol>
        {STEPS.map((step, i) => {
          const done = isStepComplete(canvas, step.id);
          return (
            <li key={step.id}>
              <button
                type="button"
                className={`rail__item${i === current ? ' is-current' : ''}${done ? ' is-done' : ''}`}
                aria-current={i === current ? 'step' : undefined}
                onClick={() => onSelect(i)}
              >
                <span className="rail__num" aria-hidden="true">
                  {done ? '✓' : step.number}
                </span>
                <span className="rail__text">
                  <span className="rail__title">{step.title}</span>
                  <span className="rail__min">
                    {step.minutesLabel} min{done ? ' · done' : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function MobileProgress({ canvas, current, onSelect }: Props) {
  const done = STEPS.filter((s) => isStepComplete(canvas, s.id)).length;
  return (
    <div className="mobilebar">
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={done} aria-label="Steps complete">
        <div className="progress__fill" style={{ width: `${(done / STEPS.length) * 100}%` }} />
      </div>
      <label className="sr-only" htmlFor="step-select">
        Jump to step
      </label>
      <select id="step-select" value={current} onChange={(e) => onSelect(Number(e.target.value))}>
        {STEPS.map((step, i) => (
          <option key={step.id} value={i}>
            {isStepComplete(canvas, step.id) ? '✓ ' : ''}
            {step.number}. {step.title} ({step.minutesLabel} min)
          </option>
        ))}
      </select>
    </div>
  );
}
