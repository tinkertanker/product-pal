import { useMemo } from 'react';
import { checkBuildPrompt, checklistSummary, wordCount } from '../shared/checkBuildPrompt';
import { GRILL_CREDIT_URL, GRILL_PROMPT, GRILL_SKILL_INSTALL } from '../shared/grillPrompt';
import { getStep } from '../shared/steps';
import { missingCoachSteps, type Canvas, type Platform } from '../shared/canvas';
import { CopyButton } from './CopyButton';
import { Hints } from './StepView';

type Props = {
  canvas: Canvas;
  busy: boolean;
  writing: boolean;
  onBuild: (patch: Partial<Canvas['build']>) => void;
  onWrite: () => void;
  onTune: () => void;
  onDownload: () => void;
  onGoToStep: (index: number) => void;
};

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'lovable', label: 'Lovable' },
  { value: 'other', label: 'Other' },
];

export function BuildStep({ canvas, busy, writing, onBuild, onWrite, onTune, onDownload, onGoToStep }: Props) {
  const { build } = canvas;
  const missing = missingCoachSteps(canvas);
  const hasPrompt = build.prompt.trim().length > 0;
  const items = useMemo(() => checkBuildPrompt(build.prompt, canvas), [build.prompt, canvas]);
  const summary = checklistSummary(items);
  const words = wordCount(build.prompt);
  const step = getStep('build');

  return (
    <section className="step-fields" aria-labelledby="step-title">
      <div className="field">
        <label htmlFor="platform">Where will you build it?</label>
        <select id="platform" value={build.platform} onChange={(e) => onBuild({ platform: e.target.value as Platform })}>
          {PLATFORM_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {build.platform === 'other' && (
        <div className="field">
          <label htmlFor="other-platform">Which tool?</label>
          <input id="other-platform" type="text" value={build.otherPlatform} maxLength={200} onChange={(e) => onBuild({ otherPlatform: e.target.value })} />
        </div>
      )}

      <label className="check" htmlFor="include-grill">
        <input id="include-grill" type="checkbox" checked={build.includeGrill} onChange={(e) => onBuild({ includeGrill: e.target.checked })} />
        <span>Ask the coding agent to grill me before it writes any code</span>
      </label>

      {missing.length > 0 && (
        <div className="callout callout--warn" role="status">
          <p className="callout__title">A few steps to finish first</p>
          <ul className="missing">
            {missing.map((id) => {
              const s = getStep(id);
              return (
                <li key={id}>
                  <button type="button" className="link" onClick={() => onGoToStep(s.number - 1)}>
                    {s.number}. {s.title}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!hasPrompt && (
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={onWrite} disabled={busy || missing.length > 0}>
            Write my build prompt
          </button>
        </div>
      )}

      <div className="field">
        <label htmlFor="build-prompt">Your build prompt</label>
        <p className="field__help">Feel free to edit it. When you're happy with it, paste it into your coding tool.</p>
        <textarea
          id="build-prompt"
          className="prompt-box"
          rows={16}
          value={build.prompt}
          onChange={(e) => onBuild({ prompt: e.target.value })}
          maxLength={12000}
          placeholder={writing ? 'Writing your prompt…' : "Your prompt will appear here once it's written."}
          aria-busy={writing}
        />
        <p className="field__help">{words.toLocaleString('en-GB')} words</p>
      </div>

      {hasPrompt && (
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={onTune} disabled={busy}>
            Tune this prompt
          </button>
          <button type="button" className="btn" onClick={onWrite} disabled={busy || missing.length > 0}>
            Rewrite
          </button>
          <CopyButton text={build.prompt} label="Copy prompt" />
          <button type="button" className="btn" onClick={onDownload}>
            Download canvas (.md)
          </button>
        </div>
      )}

      <section className="checklist" aria-labelledby="checklist-title">
        <h3 id="checklist-title">
          Prompt checklist{' '}
          <span className="checklist__score">
            {summary.passed} of {summary.total}
          </span>
        </h3>
        <ul>
          {items.map((item) => (
            <li key={item.id} className={item.pass ? 'is-pass' : 'is-fail'}>
              <span className="checklist__mark" aria-hidden="true">
                {item.pass ? '✓' : '○'}
              </span>
              {item.label}
              <span className="sr-only">{item.pass ? ' — done' : ' — not yet'}</span>
            </li>
          ))}
        </ul>
      </section>

      <Hints step={step} />

      <section className="card card--grill" aria-labelledby="grill-title">
        <h3 id="grill-title">Take the grill with you</h3>
        <p>Paste this into any AI assistant, then add your canvas or build prompt where it asks for it.</p>
        <pre className="grill-prompt">{GRILL_PROMPT}</pre>
        <div className="actions">
          <CopyButton text={GRILL_PROMPT} label="Copy grilling prompt" />
        </div>
        <p className="field__help">
          Using Claude Code? You can also install it as a skill: <code>{GRILL_SKILL_INSTALL}</code>
        </p>
        <p className="credit">
          Adapted from Matt Pocock's <em>grilling</em> skill (MIT).{' '}
          <a href={GRILL_CREDIT_URL} target="_blank" rel="noreferrer">
            github.com/mattpocock/skills
          </a>
        </p>
      </section>
    </section>
  );
}
