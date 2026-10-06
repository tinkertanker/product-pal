import { useEffect, useId, useRef, useState } from 'react';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or a page that is not on https: fall back to a hidden textarea.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/** A read-only box with its text already selected, for copying by hand when the clipboard is out of reach. */
export function SelectedText({ text, label }: { text: string; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="field copy-fallback">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea id={id} ref={ref} className="prompt-box" rows={8} readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
    </div>
  );
}

type Props = {
  text: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  /** Called when copying fails, e.g. to select a box that is already on screen. */
  onFailed?: () => void;
  /** If copying fails, show this text in a selected box so it can be copied by hand. */
  manualText?: string;
  manualLabel?: string;
};

export function CopyButton({ text, label = 'Copy', className = 'btn', disabled, onFailed, manualText, manualLabel = 'Text to copy' }: Props) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function onClick() {
    const ok = await copyText(text);
    setState(ok ? 'done' : 'failed');
    window.clearTimeout(timer.current);
    if (!ok) onFailed?.();
    // A box left for copying by hand stays until the next press.
    if (ok || manualText === undefined) timer.current = window.setTimeout(() => setState('idle'), ok ? 2000 : 6000);
  }

  return (
    <>
      <button type="button" className={className} onClick={onClick} disabled={disabled}>
        {state === 'done' ? 'Copied' : label}
        <span className="sr-only" aria-live="polite">
          {state === 'done' ? ' to clipboard' : ''}
        </span>
      </button>
      {state === 'failed' && (
        <span className="field__help" role="status">
          Copying didn't work in this browser.
          {manualText !== undefined ? ' Copy it from the box below.' : ''}
        </span>
      )}
      {state === 'failed' && manualText !== undefined && <SelectedText text={manualText} label={manualLabel} />}
    </>
  );
}
