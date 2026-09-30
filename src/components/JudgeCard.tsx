import type { CoachStepId } from '../shared/canvas';
import { judgeHeadline, type JudgeView } from '../shared/judgeFlow';
import { Sticker } from './Sticker';

type Props = {
  view: JudgeView;
  /** A check for this step failed to run. */
  error: string;
  onCheck: () => void;
  stepId: CoachStepId;
};

/** The step checker's answer, shown under the step's buttons. */
export function JudgeCard({ view, error, onCheck, stepId }: Props) {
  const titleId = `judge-title-${stepId}`;

  if (view.kind === 'checking') {
    return (
      <div className="judge" role="status">
        <p className="judge__thinking">
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Checking your step…
        </p>
      </div>
    );
  }

  return (
    <div className="judge-wrap" aria-live="polite">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {view.kind === 'stale' && (
        <div className="judge judge--stale">
          <p className="judge__headline">You've changed this step since it was checked.</p>
          <button type="button" className="btn btn--small" onClick={onCheck}>
            Check it again
          </button>
        </div>
      )}
      {view.kind === 'result' && (
        <section className={`judge ${view.judgement.pass ? 'judge--pass' : 'judge--almost'}`} aria-labelledby={titleId}>
          <div className="judge__top">
            <p id={titleId} className="judge__headline">
              {judgeHeadline(view.judgement)}
            </p>
            {view.judgement.pass && <Sticker name="yay" size={44} className="sticker--judge" />}
          </div>
          <ul className="judge__checks">
            {view.judgement.checks.map((check) => (
              <li key={check.id} className={check.pass ? 'is-pass' : 'is-fail'}>
                <span className="checklist__mark" aria-hidden="true">
                  {check.pass ? '✓' : '○'}
                </span>
                {check.label}
                <span className="sr-only">{check.pass ? ' (ticked)' : ' (not yet)'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
