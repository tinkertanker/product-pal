import { useState, type FormEvent } from 'react';
import { joinWorkshop } from '../api';
import { Sticker } from './Sticker';

type Props = { notice?: string; onJoined: (code: string) => void };

export function JoinScreen({ notice, onJoined }: Props) {
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
        <p className="join__sub">Let's take one idea and think it through properly. It takes about 40 minutes.</p>

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

        <p className="join__safe">Please use made-up or anonymised details, and keep anything confidential out of here.</p>
      </div>
    </main>
  );
}
