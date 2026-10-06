import { useState } from 'react';
import { agentFileContent, agentFileName } from '../shared/agentFile';
import { PLATFORM_OPTIONS, wordCount } from '../shared/briefFlow';
import type { Canvas, Platform, StepId } from '../shared/canvas';
import type { JudgeView } from '../shared/judgeFlow';
import { GRILL_CREDIT, GRILL_CREDIT_URL, GRILL_PROMPT } from '../shared/grillPrompt';
import { kickoffMessage } from '../shared/kickoff';
import { getStep } from '../shared/steps';
import { CopyButton, SelectedText, copyText } from './CopyButton';
import { downloadText } from './download';
import { JudgeCard, type NudgeView } from './JudgeCard';

type Props = {
  canvas: Canvas;
  /** A coach request is running (any step). */
  busy: boolean;
  /** The brief is being written right now. */
  writing: boolean;
  judgeOn: boolean;
  /** The step check is running (the first part of "Write my brief"). */
  checking: boolean;
  onBrief: (patch: Partial<Canvas['brief']>) => void;
  /** Run the step check, then write the brief. */
  onWrite: () => void;
  /** Write the brief although some steps are not signed off. */
  onWriteAnyway: () => void;
  /** Steps still to finish, when the participant has asked for the brief too early. Null otherwise. */
  gate: StepId[] | null;
  onGoToStep: (index: number) => void;
  /** Check this screen's boxes without writing the brief (the stale card's "Check again"). */
  onCheck: () => void;
  onReview: () => void;
  onQuestions: () => void;
  view: JudgeView;
  checkError: string;
  emptyMessage: string;
  nudge?: NudgeView;
};

/** The footer link: copies the grilling prompt, then names where it came from. */
function GrillLink() {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  return (
    <div className="grill-link">
      <p>
        <button
          type="button"
          className="link link--small"
          title={GRILL_CREDIT}
          onClick={async () => setCopied((await copyText(GRILL_PROMPT)) ? 'done' : 'failed')}
        >
          Take the grilling prompt with you
        </button>
        {copied !== 'idle' && (
          <span className="grill-link__credit" role="status">
            {copied === 'done' ? ' Copied. ' : " Copying didn't work in this browser. Copy it from the box below. "}
            {GRILL_CREDIT}.{' '}
            <a href={GRILL_CREDIT_URL} target="_blank" rel="noreferrer">
              github.com/mattpocock/skills
            </a>
          </span>
        )}
      </p>
      {copied === 'failed' && <SelectedText text={GRILL_PROMPT} label="The grilling prompt" />}
    </div>
  );
}

export function BriefStep({ canvas, busy, writing, judgeOn, checking, onBrief, onWrite, onWriteAnyway, gate, onGoToStep, onCheck, onReview, onQuestions, view, checkError, emptyMessage, nudge }: Props) {
  const { brief } = canvas;
  const hasText = brief.document.trim().length > 0;
  const fileName = agentFileName(brief.platform);
  const selectBrief = () => {
    const box = document.getElementById('brief-document') as HTMLTextAreaElement | null;
    box?.focus();
    box?.select();
  };

  return (
    <>
      <div className="field">
        <label htmlFor="platform">Which tool will you build with?</label>
        <select id="platform" value={brief.platform} onChange={(e) => onBrief({ platform: e.target.value as Platform })}>
          {PLATFORM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {brief.platform === 'other' && (
        <div className="field">
          <label htmlFor="other-platform">Which tool?</label>
          <input id="other-platform" type="text" value={brief.otherPlatform} maxLength={200} onChange={(e) => onBrief({ otherPlatform: e.target.value })} />
        </div>
      )}

      <div className="actions">
        {!hasText && !writing && (
          <button type="button" className="btn btn--primary" onClick={() => !checking && onWrite()} disabled={busy} aria-busy={checking || undefined}>
            {checking ? 'Checking…' : 'Write my brief'}
          </button>
        )}
        <button type="button" className="link link--quiet" onClick={onQuestions} disabled={busy} title={busy ? 'Your coach is busy. Try again in a moment.' : undefined}>
          Ask me questions
        </button>
        {busy && <span className="field__help">Your coach is busy. Try again in a moment.</span>}
      </div>

      {emptyMessage && (
        <p className="notice" role="status">
          {emptyMessage}
        </p>
      )}

      {judgeOn && <JudgeCard view={view} error={checkError} onCheck={onCheck} stepId="brief" nudge={nudge} />}

      {gate && gate.length > 0 && !writing && (
        <div className="callout callout--warn" role="status">
          <p className="callout__title">A few things would make this stronger:</p>
          <ul className="missing">
            {gate.map((id) => {
              const s = getStep(id);
              return (
                <li key={id}>
                  {id === 'brief' ? (
                    <>
                      {s.number}. {s.title}
                    </>
                  ) : (
                    <button type="button" className="link" onClick={() => onGoToStep(s.number - 1)}>
                      {s.number}. {s.title}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="callout__more">
            <button type="button" className="btn btn--small" onClick={onWriteAnyway} disabled={busy}>
              Write it anyway
            </button>
          </p>
        </div>
      )}

      {brief.fit.trim() && (
        <section className="fit" aria-labelledby="fit-title">
          <h3 id="fit-title">Does your idea still fit?</h3>
          <p>{brief.fit}</p>
        </section>
      )}

      {(hasText || writing) && (
        <div className="field">
          <label htmlFor="brief-document">Your brief</label>
          <textarea
            id="brief-document"
            className="prompt-box"
            rows={16}
            value={brief.document}
            onChange={(e) => onBrief({ document: e.target.value })}
            maxLength={12000}
            placeholder="Writing your brief…"
            readOnly={writing}
            aria-busy={writing}
          />
          <p className="field__help">{wordCount(brief.document).toLocaleString('en-GB')} words</p>
          {!writing && <p className="field__help">Pal drafted First version, Not building and Open questions from your notes. Read those three before you copy.</p>}
        </div>
      )}

      {hasText && !writing && (
        <div className="actions">
          <CopyButton text={brief.document} label="Copy brief" className="btn btn--primary" onFailed={selectBrief} />
          <button type="button" className="btn" onClick={() => downloadText(fileName, agentFileContent(canvas))}>
            Download as {fileName}
          </button>
          <CopyButton text={kickoffMessage(canvas)} label="Copy kick-off message" manualText={kickoffMessage(canvas)} manualLabel="Your kick-off message" />
          <button type="button" className="btn" onClick={onReview} disabled={busy}>
            Review my brief
          </button>
          <button type="button" className="link link--quiet" onClick={onWrite} disabled={busy}>
            Rewrite
          </button>
        </div>
      )}

      <GrillLink />
    </>
  );
}
