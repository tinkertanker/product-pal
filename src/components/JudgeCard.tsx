import { useState } from 'react';
import type { CoachStepId } from '../shared/canvas';
import { judgeCard, type JudgeView } from '../shared/judgeFlow';
import { Markdown } from './Markdown';
import { Sticker } from './Sticker';

export type NudgeView = { text: string; /** The reply is still arriving. */ pending: boolean };

type Props = {
  view: JudgeView;
  /** A check for this step failed to run. */
  error: string;
  onCheck: () => void;
  stepId: CoachStepId;
  /** The coach's follow-up to a miss, shown under the card. */
  nudge?: NudgeView;
  /** The step is finished, so a pass may say Done. */
  stepDone?: boolean;
};

function Dots() {
  return (
    <span className="dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/** The step checker's answer, shown under the step's buttons. */
export function JudgeCard({ view, error, onCheck, stepId, nudge, stepDone = true }: Props) {
  const titleId = `judge-title-${stepId}`;
  const [showChecks, setShowChecks] = useState(false);

  if (view.kind === 'checking') {
    return (
      <div className="judge" role="status">
        <p className="judge__thinking">
          <Dots />
          Checking your step…
        </p>
      </div>
    );
  }

  const card = view.kind === 'result' ? judgeCard(view.judgement, stepDone) : null;
  if (view.kind === 'none' && !error) return null;

  return (
    <div className="judge-wrap" aria-live="polite" aria-busy={nudge?.pending ? true : undefined}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {view.kind === 'stale' && (
        <div className="judge judge--stale">
          <p className="judge__headline">Notes or chat, here or in an earlier step, have changed since this check.</p>
          <button type="button" className="btn btn--small" onClick={onCheck}>
            Check again
          </button>
        </div>
      )}
      {view.kind === 'result' && card && (
        <section className={`judge ${card.tone === 'fail' ? 'judge--almost' : card.tone === 'miss' ? 'judge--miss' : 'judge--pass'}`} aria-labelledby={titleId}>
          <div className="judge__top">
            <p id={titleId} className="judge__headline">
              {card.headline}
            </p>
            {card.tone === 'pass' && <Sticker name="yay" size={44} className="sticker--judge" />}
          </div>
          {card.lines.length > 0 && (
            <ul className="judge__fixes">
              {card.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {card.tone === 'pass' && view.judgement.checks.length > 0 && (
            <>
              <button type="button" className="link link--small" onClick={() => setShowChecks((v) => !v)} aria-expanded={showChecks}>
                {showChecks ? 'Hide checks' : 'Show checks'}
              </button>
              {showChecks && (
                <ul className="judge__checks">
                  {view.judgement.checks.map((check) => (
                    <li key={check.id} className="is-pass">
                      <span className="checklist__mark" aria-hidden="true">
                        ✓
                      </span>
                      {check.label}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
      {view.kind === 'result' && card && card.tone !== 'pass' && nudge && (nudge.text || nudge.pending) && (
        <div className="nudge">
          <p className="nudge__title">Your coach says</p>
          {nudge.text ? (
            <Markdown>{nudge.text}</Markdown>
          ) : (
            <p className="thinking">
              <Dots />
            </p>
          )}
        </div>
      )}
    </div>
  );
}
