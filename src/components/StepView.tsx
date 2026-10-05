import { useState, type ReactNode } from 'react';
import { IDG_CREDIT, IDG_URL, PLAYLIST_URL, STEPS, embedUrl, type StepDef } from '../shared/steps';
import { getField, type Canvas, type CoachStepId } from '../shared/canvas';
import { revealNext, statementMissingMessage, visibleFields } from '../shared/briefFlow';
import type { JudgeView } from '../shared/judgeFlow';
import { FieldInput } from './FieldInput';
import { JudgeCard, type NudgeView } from './JudgeCard';
import { STEP_STICKER, Sticker } from './Sticker';

// ---------------------------------------------------------------------------
// Header and the two things tucked behind a tap
// ---------------------------------------------------------------------------

export function StepHeader({ step, showTimings }: { step: StepDef; showTimings: boolean }) {
  return (
    <header className="step-head">
      <p className="step-head__num">
        Step {step.number} of {STEPS.length}
      </p>
      <div className="step-head__row">
        <h2 id="step-title" tabIndex={-1}>
          {step.title}
        </h2>
        {showTimings && <span className="chip">{step.minutes} min</span>}
        <Sticker name={STEP_STICKER[step.id]} size={64} eager className="sticker--step" />
      </div>
      <p className="why">{step.intro}</p>
    </header>
  );
}

function Video({ step }: { step: StepDef }) {
  // The iframe is only created once the disclosure has been opened.
  const [opened, setOpened] = useState(false);
  return (
    <details className="disclosure" onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary>Watch the video (optional)</summary>
      <div className="video">
        {opened && (
          <iframe
            src={embedUrl(step.videoId)}
            title={`Video for step ${step.number}: ${step.title}`}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        )}
      </div>
      <p className="credit">
        <a href={IDG_URL} target="_blank" rel="noreferrer">
          {IDG_CREDIT}
        </a>{' '}
        · <a href={PLAYLIST_URL} target="_blank" rel="noreferrer">Full playlist</a>
      </p>
    </details>
  );
}

/** "Need a nudge?" and "Watch the video (optional)": closed until asked for. */
export function StepHelp({ step }: { step: StepDef }) {
  return (
    <div className="help">
      <details className="disclosure">
        <summary>Need a nudge?</summary>
        <p className="help__text">{step.nudge}</p>
      </details>
      <Video step={step} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The boxes
// ---------------------------------------------------------------------------

type Props = {
  step: StepDef;
  canvas: Canvas;
  onField: (fieldId: string, value: string) => void;
  /** A coach request is running (any step). */
  busy: boolean;
  /** Pal is drafting the problem statement. */
  drafting: boolean;
  onDraft: () => void;
  /** Pal is suggesting assumptions. */
  suggesting: boolean;
  suggestions: string[];
  onSuggest: () => void;
  onPickSuggestion: (text: string) => void;
  /** What sits under the boxes: the check button and card, or the brief tools. */
  children: ReactNode;
};

export function StepView({ step, canvas, onField, busy, drafting, onDraft, suggesting, suggestions, onSuggest, onPickSuggestion, children }: Props) {
  const [revealed, setRevealed] = useState(0);
  const [triedDraft, setTriedDraft] = useState(false);
  const fields = visibleFields(canvas, step, revealed);
  const next = revealNext(canvas, step, revealed);

  function showMore() {
    if (!next) return;
    setRevealed(next.revealed);
    // Once the new box is on screen, put the cursor in it.
    window.setTimeout(() => document.getElementById(`f-${step.id}-${next.fieldId.replace('.', '-')}`)?.focus(), 0);
  }

  const draftMessage = triedDraft ? statementMissingMessage(canvas) : '';

  const extras = (id: string): { action?: ReactNode; below?: ReactNode; readOnly?: boolean } => {
    if (step.id === 'why' && id === 'statement') {
      return {
        readOnly: drafting,
        action: (
          <button type="button" className="btn btn--small" onClick={() => (statementMissingMessage(canvas) ? setTriedDraft(true) : onDraft())} disabled={busy && !drafting} aria-busy={drafting || undefined}>
            {drafting ? 'Drafting…' : 'Draft it for me'}
          </button>
        ),
        below: draftMessage ? (
          <p className="field__help" role="status">
            {draftMessage}
          </p>
        ) : undefined,
      };
    }
    if (step.id === 'bet' && id === 'assumption') {
      return {
        below: (
          <div className="suggest">
            <div>
              <button type="button" className="btn btn--small" onClick={onSuggest} disabled={busy && !suggesting} aria-busy={suggesting || undefined}>
                {suggesting ? 'Thinking…' : 'Suggest three'}
              </button>
            </div>
            {suggestions.length > 0 && (
              <>
                <ul className="suggest__list">
                  {suggestions.map((text, i) => (
                    <li key={i}>
                      <button type="button" className="suggest__card" onClick={() => onPickSuggestion(text)} disabled={suggesting}>
                        {text}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="field__help">Pick the one that worries you most, or write your own.</p>
              </>
            )}
          </div>
        ),
      };
    }
    return {};
  };

  return (
    <section aria-labelledby="step-title" className="step-fields">
      {step.id === 'why' ? (
        <>
          <ol className="chain">
            {fields
              .filter((f) => f.id.startsWith('whys.'))
              .map((f) => (
                <li key={f.id}>
                  <FieldInput stepId={step.id} canvas={canvas} field={f} value={getField(canvas, step.id, f.id)} onChange={(v) => onField(f.id, v)} />
                </li>
              ))}
          </ol>
          {next && (
            <p className="more">
              <button type="button" className="link" onClick={showMore}>
                {step.moreLabel}
              </button>
            </p>
          )}
          {fields
            .filter((f) => !f.id.startsWith('whys.'))
            .map((f) => (
              <FieldInput key={f.id} stepId={step.id} canvas={canvas} field={f} value={getField(canvas, step.id, f.id)} onChange={(v) => onField(f.id, v)} {...extras(f.id)} />
            ))}
        </>
      ) : (
        <>
          {fields.map((f) => (
            <FieldInput key={f.id} stepId={step.id} canvas={canvas} field={f} value={getField(canvas, step.id, f.id)} onChange={(v) => onField(f.id, v)} {...extras(f.id)} />
          ))}
          {next && (
            <p className="more">
              <button type="button" className="link" onClick={showMore}>
                {step.moreLabel}
              </button>
            </p>
          )}
        </>
      )}

      <StepHelp step={step} />

      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The check button, the "Ask me questions" link and the result card
// ---------------------------------------------------------------------------

type CheckProps = {
  stepId: CoachStepId;
  /** The step has passed, so Next is now the main action. */
  passed: boolean;
  /** The AI step checker is on for this session. */
  judgeOn: boolean;
  view: JudgeView;
  error: string;
  /** Inline message naming the boxes that still need an answer. */
  emptyMessage: string;
  nudge?: NudgeView;
  busy: boolean;
  onCheck: () => void;
  onQuestions: () => void;
};

export function CheckBar({ stepId, passed, judgeOn, view, error, emptyMessage, nudge, busy, onCheck, onQuestions }: CheckProps) {
  const checking = view.kind === 'checking';
  return (
    <>
      <div className="actions">
        {judgeOn && (
          <button type="button" className={passed ? 'btn btn--quiet' : 'btn btn--primary'} onClick={() => !checking && onCheck()} aria-busy={checking || undefined}>
            {checking ? 'Checking…' : passed ? 'Check again' : 'Check my step'}
          </button>
        )}
        <button type="button" className="link link--quiet" onClick={onQuestions} disabled={busy}>
          Ask me questions
        </button>
      </div>
      {emptyMessage && (
        <p className="notice" role="status">
          {emptyMessage}
        </p>
      )}
      {judgeOn && <JudgeCard view={view} error={error} onCheck={onCheck} stepId={stepId} nudge={nudge} />}
    </>
  );
}
