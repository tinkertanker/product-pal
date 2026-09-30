import { useEffect, useRef, useState } from 'react';

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

type Props = { text: string; label?: string; className?: string; disabled?: boolean };

export function CopyButton({ text, label = 'Copy', className = 'btn', disabled }: Props) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function onClick() {
    const ok = await copyText(text);
    setState(ok ? 'done' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2000);
  }

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Press Ctrl/Cmd+C' : label}
      <span className="sr-only" aria-live="polite">
        {state === 'done' ? ' to clipboard' : ''}
      </span>
    </button>
  );
}
