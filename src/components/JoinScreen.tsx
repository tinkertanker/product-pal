import { useState, type FormEvent } from 'react';
import { joinWorkshop } from '../api';

type Props = { notice?: string; onJoined: (code: string) => void };

export function JoinScreen({ notice, onJoined }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length < 5) {
      setError('Enter the code from the screen. It has 5 to 8 characters.');
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
        <p className="eyebrow">Product Thinker</p>
        <h1>Think before you build.</h1>
        <p className="join__sub">One idea, done properly. About 40 minutes.</p>

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

        <p className="join__safe">Use made-up or anonymised details. Don't paste anything confidential.</p>
      </div>
    </main>
  );
}
