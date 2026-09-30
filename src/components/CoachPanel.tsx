import { useEffect, useRef, useState, type FormEvent } from 'react';
import { parseSuggestion } from '../shared/suggestion';
import type { ChatMessage } from '../shared/canvas';
import { CopyButton } from './CopyButton';
import { Markdown } from './Markdown';
import { Sticker } from './Sticker';

export type PanelMode = 'challenge' | 'grill' | 'tune';

type Props = {
  mode: PanelMode | null;
  available: PanelMode[];
  onMode: (mode: PanelMode) => void;
  /** A request for this step is running. */
  busy: boolean;
  error: string;
  challengeText: string;
  tuneText: string;
  chat: ChatMessage[];
  mainFieldLabel: string;
  onUseSuggestion: (text: string) => void;
  onSendChat: (text: string) => void;
  onRestartGrill: () => void;
  emptyText: string;
};

const TAB_LABEL: Record<PanelMode, string> = { challenge: 'Challenge', grill: 'Grill', tune: 'Tune' };

const THINKING_TEXT = {
  challenge: 'Your coach is reading what you wrote…',
  tune: 'Your coach is reading your prompt…',
  grill: 'Your coach is thinking of a question…',
} as const;

function Thinking({ kind }: { kind: keyof typeof THINKING_TEXT }) {
  return (
    <p className="thinking" role="status">
      <Sticker name="just-peeking" size={48} className="sticker--thinking" />
      <span className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {THINKING_TEXT[kind]}
    </p>
  );
}

function SuggestionCard({
  suggestion,
  pending,
  onUse,
  mainFieldLabel,
  kind,
}: {
  suggestion: string | null;
  pending: boolean;
  onUse?: (text: string) => void;
  mainFieldLabel: string;
  kind: 'challenge' | 'tune';
}) {
  if (!suggestion && !pending) return null;
  return (
    <div className="suggestion">
      <p className="suggestion__title">{kind === 'challenge' ? `Here is a tighter draft of “${mainFieldLabel}”` : 'Something you could add'}</p>
      {suggestion ? (
        <>
          <p className="suggestion__text">{suggestion}</p>
          <div className="suggestion__actions">
            {kind === 'challenge' && onUse ? (
              <button type="button" className="btn btn--primary" onClick={() => onUse(suggestion)}>
                Use this draft
              </button>
            ) : (
              <CopyButton text={suggestion} label="Copy" className="btn btn--primary" />
            )}
            {kind === 'challenge' && <span className="suggestion__note">You can still change it afterwards.</span>}
          </div>
        </>
      ) : (
        <p className="suggestion__note">Writing a draft for you…</p>
      )}
    </div>
  );
}

function CoachReply({ text, busy, kind, onUse, mainFieldLabel }: { text: string; busy: boolean; kind: 'challenge' | 'tune'; onUse?: (t: string) => void; mainFieldLabel: string }) {
  if (!text) return busy ? <Thinking kind={kind} /> : null;
  const parsed = parseSuggestion(text);
  return (
    <>
      {parsed.body && <Markdown>{parsed.body}</Markdown>}
      <SuggestionCard suggestion={parsed.suggestion} pending={parsed.pending && busy} onUse={onUse} mainFieldLabel={mainFieldLabel} kind={kind} />
    </>
  );
}

function GrillChat({ chat, busy, onSend, onRestart }: { chat: ChatMessage[]; busy: boolean; onSend: (t: string) => void; onRestart: () => void }) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const last = chat[chat.length - 1];

  // Follow the reply only while it arrives. Doing it on every change also fired
  // on a step change and dragged the page down to the old chat on mobile.
  useEffect(() => {
    if (busy) endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [busy, chat.length, last?.content.length]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    onSend(text);
    setDraft('');
  }

  // The auto-sent opener is not worth showing.
  const shown = chat.filter((m, i) => !(i === 0 && m.role === 'user' && m.content.startsWith('Grill me on my')));
  const waiting = busy && (!last || last.role === 'user' || last.content === '');

  return (
    <div className="chat">
      <div className="grill-intro">
        <Sticker name="intenseglare" size={44} className="sticker--avatar" />
        <p>I'll ask the questions. Take your time with your answers, and reply whenever you're ready.</p>
      </div>
      {shown.map((m, i) =>
        m.role === 'assistant' ? (
          m.content ? (
            <div key={i} className="bubble bubble--coach">
              <Markdown>{m.content}</Markdown>
            </div>
          ) : null
        ) : (
          <div key={i} className="bubble bubble--you">
            <p>{m.content}</p>
          </div>
        ),
      )}
      {waiting && <Thinking kind="grill" />}
      <div ref={endRef} />
      <form className="chat__form" onSubmit={submit}>
        <label htmlFor="chat-input" className="sr-only">
          Your answer
        </label>
        <textarea
          id="chat-input"
          rows={3}
          value={draft}
          placeholder="Type your answer here. Press Cmd/Ctrl+Enter to send."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          maxLength={4000}
        />
        <div className="chat__actions">
          <button type="submit" className="btn btn--primary" disabled={busy || draft.trim().length === 0}>
            Send
          </button>
          <button type="button" className="btn btn--quiet" onClick={onRestart} disabled={busy}>
            Start again
          </button>
        </div>
      </form>
    </div>
  );
}

export function CoachPanel(props: Props) {
  const { mode, available, onMode, busy, error, challengeText, tuneText, chat, mainFieldLabel, onUseSuggestion, onSendChat, onRestartGrill, emptyText } = props;
  const empty = !mode && !error;

  return (
    <aside className={`coach${empty ? ' coach--empty' : ''}`} aria-label="Coach" aria-live="polite" aria-busy={busy}>
      <div className="coach__head">
        <h3>Your coach</h3>
        {available.length > 1 && (
          <div className="tabs" role="group" aria-label="Coach mode">
            {available.map((m) => (
              <button key={m} type="button" className={`tab${m === mode ? ' is-on' : ''}`} aria-pressed={m === mode} onClick={() => onMode(m)}>
                {TAB_LABEL[m]}
              </button>
            ))}
          </div>
        )}
      </div>

      {empty && (
        <div className="coach__empty">
          <Sticker name="point-left" size={72} className="sticker--point" />
          <p>{emptyText}</p>
        </div>
      )}
      {error && (
        <div className="error error--with-sticker" role="alert">
          <Sticker name="crashed" size={44} className="sticker--error" />
          <p>{error}</p>
        </div>
      )}
      {mode === 'challenge' && <CoachReply text={challengeText} busy={busy} kind="challenge" onUse={onUseSuggestion} mainFieldLabel={mainFieldLabel} />}
      {mode === 'tune' && <CoachReply text={tuneText} busy={busy} kind="tune" mainFieldLabel={mainFieldLabel} />}
      {mode === 'grill' && <GrillChat chat={chat} busy={busy} onSend={onSendChat} onRestart={onRestartGrill} />}
    </aside>
  );
}
