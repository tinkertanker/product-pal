import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { isQuestionsOpener } from '../shared/briefFlow';
import { parseSuggestion } from '../shared/suggestion';
import type { ChatMessage } from '../shared/canvas';
import { CopyButton } from './CopyButton';
import { Markdown } from './Markdown';
import { Sticker } from './Sticker';
import { artifactLabel } from '../shared/session';

export type PanelMode = 'questions' | 'review';

type Props = {
  mode: PanelMode | null;
  available: PanelMode[];
  onMode: (mode: PanelMode) => void;
  /** A request for this step is running (drives the "thinking" line). */
  busy: boolean;
  /** Any coach request is running, on any step. Send and Start again wait for it. */
  locked: boolean;
  error: string;
  reviewText: string;
  chat: ChatMessage[];
  onSendChat: (text: string) => void;
  onRestartChat: () => void;
  reviewActions?: ReactNode;
};

const TAB_LABEL: Record<PanelMode, string> = { questions: 'Chat', review: 'Review' };

const THINKING_TEXT = {
  review: 'Your coach is reading your brief…',
  questions: 'Pal is thinking…',
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

function ReviewReply({ text, busy }: { text: string; busy: boolean }) {
  if (!text) return busy ? <Thinking kind="review" /> : null;
  const parsed = parseSuggestion(text);
  return (
    <>
      {parsed.body && <Markdown>{parsed.body}</Markdown>}
      {(parsed.suggestion || (parsed.pending && busy)) && (
        <div className="suggestion">
          <p className="suggestion__title">Something you could add</p>
          {parsed.suggestion ? (
            <>
              <p className="suggestion__text">{parsed.suggestion}</p>
              <div className="suggestion__actions">
                <CopyButton text={parsed.suggestion} label="Copy" className="btn btn--primary" />
              </div>
            </>
          ) : (
            <p className="suggestion__note">Writing a draft for you…</p>
          )}
        </div>
      )}
    </>
  );
}

function QuestionChat({ chat, busy, locked, onSend, onRestart }: { chat: ChatMessage[]; busy: boolean; locked: boolean; onSend: (t: string) => void; onRestart: () => void }) {
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
    if (!text || locked) return;
    onSend(text);
    setDraft('');
  }

  // The auto-sent opener is not worth showing.
  const shown = chat.filter((m, i) => !(i === 0 && m.role === 'user' && isQuestionsOpener(m.content)));
  const waiting = busy && (!last || last.role === 'user' || last.content === '');

  return (
    <div className="chat">
      <div className="grill-intro">
        <Sticker name="intenseglare" size={44} className="sticker--avatar" />
        <p>Ask about your notes or anything Pal suggested. Or let me coach you, one question at a time.</p>
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
            {m.reference && <details className="chat-reference"><summary>{artifactLabel(m.reference)}</summary><p>{m.reference.text}</p></details>}
            <p>{m.content}</p>
          </div>
        ),
      )}
      {waiting && <Thinking kind="questions" />}
      <div ref={endRef} />
      <form className="chat__form" onSubmit={submit}>
        <label htmlFor="chat-input" className="sr-only">
          Your message to Pal
        </label>
        <textarea
          id="chat-input"
          rows={3}
          value={draft}
          placeholder="Ask a question or reply. Cmd/Ctrl+Enter to send."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          maxLength={4000}
        />
        <div className="chat__actions">
          <button type="submit" className="btn btn--primary" disabled={locked || draft.trim().length === 0}>
            Send
          </button>
          <button type="button" className="btn btn--quiet" onClick={onRestart} disabled={locked}>
            Start again
          </button>
        </div>
      </form>
    </div>
  );
}

export function CoachPanel(props: Props) {
  const { mode, available, onMode, busy, locked, error, reviewText, chat, onSendChat, onRestartChat } = props;
  const ref = useRef<HTMLElement>(null);

  // On a narrow screen the panel sits below the boxes; bring it into view when it opens.
  useEffect(() => {
    if (mode) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [mode]);

  if (!mode && !error) return null;

  return (
    <aside className="coach" aria-label="Coach" aria-live="polite" aria-busy={busy} ref={ref}>
      <div className="coach__head">
        <h3>Chat with Pal</h3>
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

      {error && (
        <div className="error error--with-sticker" role="alert">
          <Sticker name="crashed" size={44} className="sticker--error" />
          <p>{error}</p>
        </div>
      )}
      {mode === 'review' && <><ReviewReply text={reviewText} busy={busy} />{!busy && props.reviewActions}</>}
      {mode === 'questions' && <QuestionChat chat={chat} busy={busy} locked={locked} onSend={onSendChat} onRestart={onRestartChat} />}
    </aside>
  );
}
