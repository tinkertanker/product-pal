import { useCallback, useEffect, useRef, useState } from 'react';
import { UnauthorisedError, streamCoach, type CoachBody, type CoachResult } from '../api';
import {
  canChallenge,
  canvasToMarkdown,
  completedCount,
  emptyCanvas,
  setField,
  type Canvas,
  type ChatMessage,
  type CoachStepId,
  type StepId,
} from '../shared/canvas';
import { grillOpener } from '../shared/prompts';
import { IDG_CREDIT, IDG_URL, STEPS, getMainField } from '../shared/steps';
import { canvasForRequest, clampMessages, type CoachMode } from '../shared/validation';
import { clearState, getClientId, loadState, saveState } from '../storage';
import { BuildStep } from './BuildStep';
import { CoachPanel, type PanelMode } from './CoachPanel';
import { ConfirmDialog, type ConfirmState } from './ConfirmDialog';
import { MobileProgress, Stepper } from './Stepper';
import { Sticker } from './Sticker';
import { StepHeader, StepView } from './StepView';

type Busy = { kind: CoachMode; step: StepId } | null;

const CUT_SHORT = 'Your coach ran out of room before finishing, so the end of this reply is missing. Try again for a full answer.';

/** Shown when a reply hits the length limit. The reply itself is kept. */
const TRUNCATED: Record<CoachMode, string> = {
  challenge: CUT_SHORT,
  grill: 'Your coach ran out of room before finishing. Ask it to carry on.',
  build: 'Your coach ran out of room before finishing your prompt, so the end may be missing. Check the last section, or press Rewrite to try again.',
  tune: CUT_SHORT,
};

function downloadMarkdown(canvas: Canvas) {
  const blob = new Blob([canvasToMarkdown(canvas)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'product-canvas.md';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Workspace({ code, onUnauthorised }: { code: string; onUnauthorised: () => void }) {
  const [initial] = useState(loadState);
  const [canvas, setCanvas] = useState<Canvas>(initial.canvas);
  const [challenges, setChallenges] = useState(initial.challenges);
  const [stepIndex, setStepIndex] = useState(initial.step);
  const [panelModes, setPanelModes] = useState<Partial<Record<StepId, PanelMode>>>({});
  const [tune, setTune] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ step: StepId; message: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const step = STEPS[stepIndex] ?? STEPS[0]!;
  const done = completedCount(canvas);

  // Autosave, debounced.
  useEffect(() => {
    const timer = window.setTimeout(() => saveState({ canvas, challenges, step: stepIndex }), 400);
    return () => window.clearTimeout(timer);
  }, [canvas, challenges, stepIndex]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const goTo = useCallback((index: number) => {
    setStepIndex(index);
    window.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
  }, []);

  const update = useCallback((fn: (c: Canvas) => Canvas) => setCanvas(fn), []);
  const setChat = (id: StepId, fn: (messages: ChatMessage[]) => ChatMessage[]) =>
    update((c) => ({ ...c, chats: { ...c.chats, [id]: fn(c.chats[id]) } }));
  const setPanel = (id: StepId, mode: PanelMode) => setPanelModes((p) => ({ ...p, [id]: mode }));

  /**
   * Run one coach request. Only one at a time. Resolves with the reply, or
   * null on failure; the caller then undoes whatever it streamed in.
   */
  async function run(kind: CoachMode, stepId: StepId, body: Omit<CoachBody, 'code' | 'clientId' | 'mode'>, onText: (text: string) => void): Promise<CoachResult | null> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy({ kind, step: stepId });
    setError(null);
    try {
      const result = await streamCoach({ ...body, mode: kind, code, clientId: getClientId() }, onText, controller.signal);
      if (result.truncated) setError({ step: stepId, message: TRUNCATED[kind] });
      return result;
    } catch (e) {
      if (e instanceof UnauthorisedError) {
        onUnauthorised();
      } else if (!controller.signal.aborted) {
        setError({ step: stepId, message: e instanceof Error ? e.message : "Your coach couldn't answer just now. Please try again in a moment." });
      }
      return null;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(null);
      }
    }
  }

  // ---- Challenge ---------------------------------------------------------
  async function challenge() {
    const id = step.id as CoachStepId;
    if (busy || !canChallenge(canvas, id)) return;
    setPanel(id, 'challenge');
    setChallenges((c) => ({ ...c, [id]: '' }));
    const result = await run('challenge', id, { step: id, canvas: canvasForRequest(canvas) }, (t) => setChallenges((c) => ({ ...c, [id]: t })));
    // A reply that broke off is dropped, so its draft can't be used.
    if (result === null) setChallenges((c) => ({ ...c, [id]: undefined }));
  }

  function useSuggestion(text: string) {
    const main = getMainField(step.id);
    if (main) update((c) => setField(c, step.id, main.id, text));
  }

  // ---- Grill -------------------------------------------------------------
  async function sendGrill(id: CoachStepId, history: ChatMessage[]) {
    // `history` already ends with the participant's turn.
    setChat(id, () => [...history, { role: 'assistant', content: '' }]);
    const result = await run('grill', id, { step: id, canvas: canvasForRequest(canvas), messages: clampMessages(history) }, (t) =>
      setChat(id, (m) => [...m.slice(0, -1), { role: 'assistant', content: t }]),
    );
    if (result === null) {
      // Drop the coach's turn, even if part of it arrived, so it isn't saved or sent back.
      // If only the automatic opener is left, clear it so Grill me starts afresh.
      setChat(id, (m) => {
        const rest = m[m.length - 1]?.role === 'assistant' ? m.slice(0, -1) : m;
        return rest.length === 1 && rest[0]?.content === grillOpener(id) ? [] : rest;
      });
    }
  }

  function grill() {
    const id = step.id as CoachStepId;
    if (busy) return;
    setPanel(id, 'grill');
    const existing = canvas.chats[id];
    if (existing.length === 0) void sendGrill(id, [{ role: 'user', content: grillOpener(id) }]);
  }

  function answerGrill(text: string) {
    const id = step.id as CoachStepId;
    void sendGrill(id, [...canvas.chats[id], { role: 'user', content: text }]);
  }

  function restartGrill() {
    const id = step.id as CoachStepId;
    setChat(id, () => []);
    void sendGrill(id, [{ role: 'user', content: grillOpener(id) }]);
  }

  // ---- Build and tune ----------------------------------------------------
  async function writePrompt() {
    if (busy) return;
    const write = async () => {
      const previous = canvas.build.prompt;
      setPanelModes((p) => ({ ...p, build: undefined }));
      update((c) => ({ ...c, build: { ...c.build, prompt: '' } }));
      const result = await run('build', 'build', { canvas: canvasForRequest(canvas) }, (t) => update((c) => ({ ...c, build: { ...c.build, prompt: t } })));
      // On failure, put back the prompt they had, edits included.
      if (result === null || result.text.trim() === '') update((c) => ({ ...c, build: { ...c.build, prompt: previous } }));
    };
    if (canvas.build.prompt.trim()) {
      setConfirm({
        title: 'Replace your build prompt?',
        message: "A new prompt will replace the one you have now, including any edits you've made.",
        confirmLabel: 'Yes, replace it',
        onConfirm: () => void write(),
      });
    } else {
      await write();
    }
  }

  async function tunePrompt() {
    if (busy) return;
    setPanel('build', 'tune');
    setTune('');
    const result = await run('tune', 'build', { canvas: canvasForRequest(canvas) }, setTune);
    if (result === null) setTune('');
  }

  // ---- Start over --------------------------------------------------------
  function startOver() {
    setConfirm({
      title: 'Start over?',
      message: "This clears everything you've written on this device. Your workshop code stays, so you can start again straight away.",
      confirmLabel: 'Yes, clear it',
      onConfirm: () => {
        abortRef.current?.abort();
        setBusy(null);
        clearState();
        setCanvas(emptyCanvas());
        setChallenges({});
        setPanelModes({});
        setTune('');
        setError(null);
        goTo(0);
      },
    });
  }

  // ---- Panel view --------------------------------------------------------
  const id = step.id;
  const chat = canvas.chats[id];
  const available: PanelMode[] =
    id === 'build'
      ? tune || busy?.kind === 'tune' ? ['tune'] : []
      : [
          ...(challenges[id] !== undefined || busy?.kind === 'challenge' ? (['challenge'] as const) : []),
          ...(chat.length > 0 ? (['grill'] as const) : []),
        ];
  const chosen = panelModes[id];
  const mode: PanelMode | null = chosen && available.includes(chosen) ? chosen : (available[available.length - 1] ?? null);
  const stepBusy = busy?.step === id;
  const mainLabel = getMainField(id)?.label ?? '';
  const stepError = error && error.step === id ? error.message : '';

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <p className="brand">
            <Sticker name="face" size={28} eager className="sticker--brand" />
            Product Pal
          </p>
          <div className="topbar__status">
            <p className="topbar__progress" aria-label={`${done} of 7 steps complete`}>
              {done} of 7
            </p>
            {done === STEPS.length && <Sticker name="yay" size={34} eager className="sticker--done hide-narrow" />}
          </div>
          <div className="topbar__actions">
            <button type="button" className="btn btn--small" onClick={() => downloadMarkdown(canvas)}>
              Download<span className="hide-narrow"> (.md)</span>
            </button>
            <button type="button" className="btn btn--small btn--quiet" onClick={startOver}>
              Start over
            </button>
          </div>
        </div>
        <MobileProgress canvas={canvas} current={stepIndex} onSelect={goTo} />
      </header>

      <div className="layout">
        <Stepper canvas={canvas} current={stepIndex} onSelect={goTo} />

        <main className="main" ref={mainRef} tabIndex={-1} id="main">
          <div className="main__content">
            <StepHeader step={step} />
            {step.id === 'build' ? (
              <BuildStep
                canvas={canvas}
                busy={busy !== null}
                writing={busy?.kind === 'build'}
                onBuild={(patch) => update((c) => ({ ...c, build: { ...c.build, ...patch } }))}
                onWrite={() => void writePrompt()}
                onTune={() => void tunePrompt()}
                onDownload={() => downloadMarkdown(canvas)}
                onGoToStep={goTo}
              />
            ) : (
              <StepView
                step={step}
                canvas={canvas}
                onField={(fieldId, value) => update((c) => setField(c, step.id, fieldId, value))}
                canChallenge={canChallenge(canvas, step.id)}
                busy={busy !== null}
                onChallenge={() => void challenge()}
                onGrill={grill}
              />
            )}
          </div>

          <div className="main__coach">
            <CoachPanel
              mode={mode}
              available={available}
              onMode={(m) => setPanel(id, m)}
              busy={stepBusy}
              error={stepError}
              challengeText={challenges[id] ?? ''}
              tuneText={tune}
              chat={chat}
              mainFieldLabel={mainLabel}
              onUseSuggestion={useSuggestion}
              onSendChat={answerGrill}
              onRestartGrill={restartGrill}
              emptyText={
                id === 'build'
                  ? "Once your build prompt is written, press Tune this prompt and I'll tell you what is missing, what is unclear and what is too big to build in one go."
                  : "When you've written a first go, press Challenge this and I'll tell you what's working and what could be stronger. Or press Grill me and I'll ask you questions."
              }
            />
          </div>

          <nav className="pager" aria-label="Previous and next step">
            <button type="button" className="btn" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
              ← Previous
            </button>
            {stepIndex < STEPS.length - 1 && (
              <button type="button" className="btn btn--primary" onClick={() => goTo(stepIndex + 1)}>
                Next →
              </button>
            )}
          </nav>
        </main>
      </div>

      <footer className="footer">
        <p>
          Frameworks from Product Thinking 101 by the{' '}
          <a href={IDG_URL} target="_blank" rel="noreferrer" title={IDG_CREDIT}>
            Institute of Digital Government
          </a>
          .
        </p>
      </footer>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
