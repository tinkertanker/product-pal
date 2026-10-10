import { useState, type FormEvent } from 'react';
import { joinWorkshop } from '../api';
import { approxDuration } from '../shared/steps';
import { Sticker } from './Sticker';

type Props = {
  notice?: string;
  showTimings: boolean;
  hasDraft?: boolean;
  onJoined: (code: string) => void;
  onClearDevice?: () => void;
};

export function JoinScreen({ notice, showTimings, hasDraft, onJoined, onClearDevice }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length < 5) {
      setError('Please type the code from the screen. It has 5 to 8 characters.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await joinWorkshop(trimmed);
    setBusy(false);
    if (result.ok) onJoined(trimmed.toUpperCase());
    else setError(result.error);
  }

  return (
    <main className="join">
      <div className="join__card">
        <div className="join__hero">
          <div className="join__title">
            <p className="eyebrow">Product Pal</p>
            <h1>Think before you build.</h1>
          </div>
          <Sticker name="greetings" size={132} eager className="sticker--join" />
        </div>
        <p className="join__sub">
          Take one idea, think it through, and leave with a brief you can build from.
          {showTimings ? ` It takes ${approxDuration()}.` : ''}
        </p>

        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        <form onSubmit={submit} noValidate>
          <label htmlFor="code">Workshop code</label>
          <div className="join__row">
            <input
              id="code"
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              minLength={5}
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              aria-describedby={error ? 'code-error' : undefined}
              aria-invalid={error ? true : undefined}
              autoFocus
            />
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Joining…' : 'Join'}
            </button>
          </div>
          {error && (
            <p id="code-error" className="error" role="alert">
              {error}
            </p>
          )}
        </form>

        <p className="join__safe">Your facilitator can see what you write. Please use made-up details and keep anything confidential out.</p>
        <p className="join__safe">
          Shared laptop? This browser keeps the last person's draft and workshop code until you clear it.
        </p>
        {hasDraft && (
          <p className="notice" role="status">
            There is already a draft on this device.{' '}
            {onClearDevice && (
              <button type="button" className="link" onClick={onClearDevice}>
                Clear this device
              </button>
            )}
          </p>
        )}
      </div>
    </main>
  );
}
