import { useState } from 'react';
import { IDG_CREDIT, IDG_URL, PLAYLIST_URL, embedUrl, type StepDef } from '../shared/steps';
import { getField, type Canvas } from '../shared/canvas';
import { FieldInput } from './FieldInput';
import { STEP_STICKER, Sticker } from './Sticker';

const FOUR_CS = ['clarity', 'consequence', 'cause', 'confirmation'];

type Props = {
  step: StepDef;
  canvas: Canvas;
  onField: (fieldId: string, value: string) => void;
  canChallenge: boolean;
  busy: boolean;
  onChallenge: () => void;
  onGrill: () => void;
};

export function StepHeader({ step }: { step: StepDef }) {
  return (
    <header className="step-head">
      <p className="step-head__num">Step {step.number} of 7</p>
      <div className="step-head__row">
        <h2 id="step-title">{step.title}</h2>
        <span className="chip">{step.minutesLabel} min</span>
        <Sticker name={STEP_STICKER[step.id]} size={64} eager className="sticker--step" />
      </div>
      <p className="why">
        <strong>Why this matters.</strong> {step.whyItMatters}
      </p>
      <Video step={step} />
    </header>
  );
}

function Video({ step }: { step: StepDef }) {
  // The iframe is only created once the disclosure has been opened.
  const [opened, setOpened] = useState(false);
  return (
    <details className="disclosure" onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary>Watch the video</summary>
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

export function Hints({ step }: { step: StepDef }) {
  return (
    <details className="disclosure disclosure--hints">
      <summary>How to make this box stronger</summary>
      <dl className="hints">
        <div>
          <dt>Shape it like this</dt>
          <dd>{step.shapeItLike}</dd>
        </div>
        <div>
          <dt>Watch out for</dt>
          <dd>{step.avoid}</dd>
        </div>
      </dl>
    </details>
  );
}

export function StepView({ step, canvas, onField, canChallenge, busy, onChallenge, onGrill }: Props) {
  const value = (id: string) => getField(canvas, step.id, id);
  const fields = step.fields;

  const renderField = (id: string, className?: string) => {
    const field = fields.find((f) => f.id === id);
    if (!field) return null;
    return <FieldInput key={id} stepId={step.id} field={field} value={value(id)} onChange={(v) => onField(id, v)} className={className} />;
  };

  let body;
  if (step.id === 'problem') {
    body = (
      <>
        <div className="fourcs">{FOUR_CS.map((id, i) => renderField(id, `card card--c${i + 1}`))}</div>
        {renderField('statement')}
      </>
    );
  } else if (step.id === 'why') {
    body = (
      <>
        <ol className="chain">
          {fields
            .filter((f) => f.id.startsWith('whys.'))
            .map((f) => (
              <li key={f.id}>{renderField(f.id)}</li>
            ))}
        </ol>
        {step.hint && <p className="inline-hint">{step.hint}</p>}
        {renderField('statement')}
      </>
    );
  } else {
    body = fields.map((f) => renderField(f.id));
  }

  return (
    <section aria-labelledby="step-title" className="step-fields">
      {body}

      {step.callout && (
        <aside className="callout">
          <p className="callout__title">{step.callout.title}</p>
          <p>{step.callout.body}</p>
        </aside>
      )}

      <Hints step={step} />

      <div className="actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onChallenge}
          disabled={!canChallenge || busy}
          title={canChallenge ? undefined : 'Write a few words first'}
          aria-describedby={canChallenge ? undefined : 'challenge-hint'}
        >
          Challenge this
        </button>
        <button type="button" className="btn" onClick={onGrill} disabled={busy}>
          Grill me
        </button>
        {!canChallenge && (
          <span id="challenge-hint" className="actions__hint">
            Write a few words first
          </span>
        )}
      </div>
    </section>
  );
}
