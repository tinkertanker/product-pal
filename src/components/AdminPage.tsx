import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AdminError,
  UnauthorisedError,
  adminClearParticipants,
  adminParticipant,
  adminParticipants,
  adminSaveSettings,
  adminSettings,
  fetchPublicSettings,
} from '../api';
import { allParticipantsMarkdown } from '../shared/adminExport';
import { COACH_STEP_IDS, STEP_IDS, canvasToMarkdown, currentJudgement, type CoachStepId, type StepId } from '../shared/canvas';
import { clarificationsFrom, type ParticipantDetail, type ParticipantSummary, type Settings } from '../shared/contracts';
import { STEPS, getStep } from '../shared/steps';
import { timeAgo } from '../shared/timeAgo';
import { clearAdminPassword, loadAdminPassword, saveAdminPassword } from '../storage';
import { ConfirmDialog, type ConfirmState } from './ConfirmDialog';
import { downloadText } from './download';
import { Markdown } from './Markdown';
import { Sticker } from './Sticker';

const REFRESH_MS = 15_000;

function useAdminPageHead() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Product Pal facilitator';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => {
      document.title = previous;
      meta.remove();
    };
  }, []);
}

const messageOf = (e: unknown) => (e instanceof AdminError || e instanceof Error ? e.message : 'Something went wrong. Please try again.');

export function AdminPage() {
  useAdminPageHead();
  const [password, setPassword] = useState(loadAdminPassword);
  const [notice, setNotice] = useState('');

  if (!password) {
    return (
      <AdminLogin
        notice={notice}
        onSignedIn={(pw) => {
          saveAdminPassword(pw);
          setNotice('');
          setPassword(pw);
        }}
      />
    );
  }
  return (
    <Dashboard
      password={password}
      onSignOut={() => {
        clearAdminPassword();
        setPassword('');
      }}
      onUnauthorised={() => {
        clearAdminPassword();
        setNotice("That password isn't working any more. Please type it again.");
        setPassword('');
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------

function AdminLogin({ notice, onSignedIn }: { notice: string; onSignedIn: (password: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value) {
      setError('Please type the facilitator password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await adminSettings(value);
      onSignedIn(value);
    } catch (e) {
      setError(e instanceof UnauthorisedError ? "That password didn't work. Please check it and try again." : messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="join">
      <div className="join__card">
        <div className="join__hero">
          <div className="join__title">
            <p className="eyebrow">Product Pal</p>
            <h1>Facilitator view</h1>
          </div>
          <Sticker name="sus" size={132} eager className="sticker--join" />
        </div>
        <p className="join__sub">See how everyone is getting on, and change a few settings for the room.</p>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <form onSubmit={submit} noValidate>
          <label htmlFor="admin-password">Password</label>
          <div className="join__row">
            <input
              id="admin-password"
              type="password"
              className="code-input code-input--plain"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoComplete="current-password"
              aria-describedby={error ? 'admin-error' : undefined}
              aria-invalid={error ? true : undefined}
              autoFocus
            />
            <button type="submit" className="btn btn--primary btn--nowrap" disabled={busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
          </div>
          {error && (
            <p id="admin-error" className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ password, onSignOut, onUnauthorised }: { password: string; onSignOut: () => void; onUnauthorised: () => void }) {
  const [participants, setParticipants] = useState<ParticipantSummary[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [judgeAvailable, setJudgeAvailable] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [exporting, setExporting] = useState('');
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof UnauthorisedError) onUnauthorised();
      else setError(messageOf(e));
    },
    [onUnauthorised],
  );

  const refresh = useCallback(async () => {
    try {
      setParticipants(await adminParticipants(password));
      setNow(Date.now());
      setError('');
    } catch (e) {
      handle(e);
    }
  }, [password, handle]);

  // First load, then every 15 seconds while the tab is showing.
  useEffect(() => {
    void refresh();
    adminSettings(password).then(setSettings, handle);
    void fetchPublicSettings().then((s) => s && setJudgeAvailable(s.judgeAvailable));
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [password, refresh, handle]);

  const stats = useMemo(() => {
    const list = participants ?? [];
    return {
      total: list.length,
      finished: list.filter((p) => COACH_STEP_IDS.every((id) => p.done.includes(id))).length,
      prompts: list.filter((p) => p.buildPromptLength > 0).length,
    };
  }, [participants]);

  async function toggle(key: keyof Settings, value: boolean) {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, [key]: value });
    setSaving('saving');
    try {
      setSettings(await adminSaveSettings(password, { [key]: value }));
      setSaving('saved');
    } catch (e) {
      setSettings(before);
      setSaving('idle');
      handle(e);
    }
  }

  async function downloadAll() {
    if (!participants || participants.length === 0) return;
    setExporting(`Collecting 0 of ${participants.length}…`);
    const entries: { nickname: string; canvas: ParticipantDetail['canvas'] }[] = [];
    let missed = 0;
    try {
      const queue = [...participants];
      let finished = 0;
      const worker = async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          try {
            const detail = await adminParticipant(password, p.clientId);
            entries.push({ nickname: detail.participant.nickname, canvas: detail.canvas });
          } catch (e) {
            if (e instanceof UnauthorisedError) throw e;
            missed += 1;
          }
          finished += 1;
          setExporting(`Collecting ${finished} of ${participants.length}…`);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      entries.sort((a, b) => a.nickname.localeCompare(b.nickname, 'en-GB'));
      downloadText('product-pal-participants.md', allParticipantsMarkdown(entries));
      if (missed > 0) setError(`${missed} ${missed === 1 ? 'canvas' : 'canvases'} couldn't be fetched, so ${missed === 1 ? 'it is' : 'they are'} missing from the file.`);
    } catch (e) {
      handle(e);
    } finally {
      setExporting('');
    }
  }

  function clearAll() {
    setConfirm({
      title: 'Clear all participants?',
      message:
        "This removes everyone's progress from this page, ready for the next group. People keep what they wrote in their own browsers, and they will show up again the next time they make a change.",
      confirmLabel: 'Yes, clear everyone',
      onConfirm: () => {
        setSelected(null);
        adminClearParticipants(password).then(() => refresh(), handle);
      },
    });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <p className="brand">
            <Sticker name="face" size={28} eager className="sticker--brand" />
            Product Pal <span className="brand__tag">facilitator</span>
          </p>
          <div className="topbar__actions">
            <button type="button" className="btn btn--small" onClick={() => void refresh()}>
              Refresh
            </button>
            <button type="button" className="btn btn--small btn--quiet" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="admin">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <section className="stats" aria-label="Summary">
          <Stat value={participants ? stats.total : '…'} label="Participants" />
          <Stat value={participants ? stats.finished : '…'} label="Finished all 6 thinking steps" />
          <Stat value={participants ? stats.prompts : '…'} label="Have a build prompt" />
        </section>

        <section className="panel" aria-labelledby="settings-title">
          <h2 id="settings-title">Settings for everyone</h2>
          {settings ? (
            <div className="settings">
              <label className="check" htmlFor="set-timings">
                <input id="set-timings" type="checkbox" checked={settings.showTimings} onChange={(e) => void toggle('showTimings', e.target.checked)} />
                <span>
                  Show suggested timings
                  <span className="check__note">Adds the minutes on each step and on the join screen.</span>
                </span>
              </label>
              <label className="check" htmlFor="set-judge">
                <input
                  id="set-judge"
                  type="checkbox"
                  checked={settings.aiJudge}
                  disabled={!judgeAvailable}
                  onChange={(e) => void toggle('aiJudge', e.target.checked)}
                />
                <span>
                  Use the AI step checker
                  <span className="check__note">
                    {judgeAvailable
                      ? 'A step counts as done when the checker is happy with it. Switch it off to go back to the simple rule of filling in every box.'
                      : 'The checker needs a TypeSafe key on the server, so it is off for now and everyone uses the simple rule of filling in every box.'}
                  </span>
                </span>
              </label>
              <p className="field__help" role="status">
                {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved. People will see it within a minute.' : ''}
              </p>
            </div>
          ) : (
            <p className="field__help">Loading…</p>
          )}
        </section>

        <section className="panel" aria-labelledby="people-title">
          <div className="panel__head">
            <h2 id="people-title">Participants</h2>
            <div className="actions">
              <button type="button" className="btn btn--small" onClick={() => void downloadAll()} disabled={!participants || participants.length === 0 || exporting !== ''}>
                {exporting || 'Download all (.md)'}
              </button>
              <button type="button" className="btn btn--small btn--danger" onClick={clearAll} disabled={!participants || participants.length === 0}>
                Clear all participants
              </button>
            </div>
          </div>

          {participants === null ? (
            <p className="field__help">Loading…</p>
          ) : participants.length === 0 ? (
            <p className="empty">
              <Sticker name="just-peeking" size={64} className="sticker--point" />
              Nobody has joined yet. People appear here a few seconds after they start writing.
            </p>
          ) : (
            <div className="plist">
              <div className="prow prow--head" aria-hidden="true">
                <span className="prow__nick">Name</span>
                <span className="prow__dots">Steps</span>
                <span className="prow__prompt">Prompt</span>
                <span className="prow__active">Last active</span>
              </div>
              <ul>
                {participants.map((p) => (
                  <li key={p.clientId}>
                    <button type="button" className={`prow${selected === p.clientId ? ' is-selected' : ''}`} onClick={() => setSelected(p.clientId)}>
                      <span className="prow__nick">{p.nickname}</span>
                      <span className="prow__dots">
                        <StepDots done={p.done} />
                      </span>
                      <span className="prow__prompt">{p.buildPromptLength > 0 ? <span className="pill">Prompt ready</span> : <span className="prow__none">No prompt yet</span>}</span>
                      <span className="prow__active">{timeAgo(now, p.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>

      <ParticipantPanel password={password} clientId={selected} now={now} onClose={() => setSelected(null)} onError={handle} />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat">
      <p className="stat__value">{value}</p>
      <p className="stat__label">{label}</p>
    </div>
  );
}

function StepDots({ done }: { done: StepId[] }) {
  const count = STEP_IDS.filter((id) => done.includes(id)).length;
  return (
    <>
      <span className="stepdots" aria-hidden="true">
        {STEP_IDS.map((id) => (
          <i key={id} className={`stepdot${done.includes(id) ? ' is-on' : ''}`} title={`${getStep(id).number}. ${getStep(id).title}`} />
        ))}
      </span>
      <span className="sr-only">
        {count} of {STEP_IDS.length} steps done
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------
// One participant, in a panel beside the list
// ---------------------------------------------------------------------------

function ParticipantPanel({
  password,
  clientId,
  now,
  onClose,
  onError,
}: {
  password: string;
  clientId: string | null;
  now: number;
  onClose: () => void;
  onError: (e: unknown) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<ParticipantDetail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (clientId && !dialog.open) dialog.showModal();
    if (!clientId && dialog.open) dialog.close();
  }, [clientId]);

  useEffect(() => {
    setDetail(null);
    setFailed(false);
    if (!clientId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await adminParticipant(password, clientId);
        if (!cancelled) {
          setDetail(next);
          setFailed(false);
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof UnauthorisedError) onError(e);
        else setFailed(true);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [clientId, password, onError]);

  return (
    <dialog ref={ref} className="drawer" onClose={onClose} aria-labelledby="drawer-title">
      <div className="drawer__head">
        <div>
          <h2 id="drawer-title">{detail?.participant.nickname ?? 'Loading…'}</h2>
          {detail && <p className="field__help">Last active {timeAgo(now, detail.participant.updatedAt)}</p>}
        </div>
        <button type="button" className="btn btn--small" onClick={onClose}>
          Close
        </button>
      </div>
      {failed && !detail && <p className="error">We couldn't load this person just now. It will try again in a moment.</p>}
      {detail && <ParticipantBody detail={detail} />}
    </dialog>
  );
}

function ParticipantBody({ detail }: { detail: ParticipantDetail }) {
  const { canvas, participant } = detail;
  const answers = clarificationsFrom(canvas.chats);
  const judged = COACH_STEP_IDS.filter((id) => canvas.judgements[id]);
  const answered = COACH_STEP_IDS.filter((id) => answers[id]);

  return (
    <div className="drawer__body">
      <section aria-labelledby="d-steps">
        <h3 id="d-steps">Steps</h3>
        <p>
          <StepDots done={participant.done} />
        </p>
      </section>

      <section aria-labelledby="d-checks">
        <h3 id="d-checks">Step checker</h3>
        {judged.length === 0 ? (
          <p className="field__help">No checks yet.</p>
        ) : (
          judged.map((id) => <JudgementRow key={id} id={id} canvas={canvas} />)
        )}
      </section>

      <section aria-labelledby="d-grill">
        <h3 id="d-grill">What they said when grilled</h3>
        {answered.length === 0 ? (
          <p className="field__help">No grill answers yet.</p>
        ) : (
          answered.map((id) => (
            <div key={id} className="drawer__group">
              <p className="drawer__label">
                {getStep(id).number}. {getStep(id).title}
              </p>
              <ul>
                {(answers[id] ?? []).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section aria-labelledby="d-canvas">
        <h3 id="d-canvas">Their canvas</h3>
        <Markdown>{canvasToMarkdown(canvas)}</Markdown>
      </section>
    </div>
  );
}

function JudgementRow({ id, canvas }: { id: CoachStepId; canvas: ParticipantDetail['canvas'] }) {
  const latest = canvas.judgements[id];
  if (!latest) return null;
  const stale = currentJudgement(canvas, id) === undefined;
  const step = STEPS.find((s) => s.id === id);
  return (
    <details className="drawer__group">
      <summary>
        {step?.number}. {step?.title}: {latest.pass ? 'passed' : 'not yet'}
        {stale ? ' (they have edited it since)' : ''}
      </summary>
      <ul className="judge__checks">
        {latest.checks.map((c) => (
          <li key={c.id} className={c.pass ? 'is-pass' : 'is-fail'}>
            <span className="checklist__mark" aria-hidden="true">
              {c.pass ? '✓' : '○'}
            </span>
            {c.label}
            <span className="judge__pct">{Math.round(c.probability * 100)}%</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
