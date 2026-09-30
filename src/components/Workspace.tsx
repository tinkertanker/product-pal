import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UnauthorisedError, requestJudgement, streamCoach, type CoachBody, type CoachResult } from '../api';
import {
  canChallenge,
  canvasToMarkdown,
  completedCount,
  emptyCanvas,
  isStepComplete,
  missingCoachSteps,
  setField,
  type Canvas,
  type ChatMessage,
  type CoachStepId,
  type StepId,
} from '../shared/canvas';
import { clarificationsFrom, nicknameFor, type PublicSettings } from '../shared/contracts';
import { canCheck, isCoachStep, judgeView, needsAutoCheck } from '../shared/judgeFlow';
import { grillOpener } from '../shared/prompts';
import { IDG_CREDIT, IDG_URL, STEPS, getMainField } from '../shared/steps';
import { canvasForRequest, clampMessages, type CoachMode } from '../shared/validation';
import { clearState, getClientId, loadState, saveState } from '../storage';
import { BuildStep } from './BuildStep';
import { CoachPanel, type PanelMode } from './CoachPanel';
import { ConfirmDialog, type ConfirmState } from './ConfirmDialog';
import { downloadText } from './download';
import { MobileProgress, Stepper } from './Stepper';
import { Sticker } from './Sticker';
import { StepHeader, StepView } from './StepView';
import { useSync } from './useSync';

type Busy = { kind: CoachMode; step: StepId } | null;

const CUT_SHORT = 'Your coach ran out of room before finishing, so the end of this reply is missing. Try again for a full answer.';

/** Shown when a reply hits the length limit. The reply itself is kept. */
const TRUNCATED: Record<CoachMode, string> = {
  challenge: CUT_SHORT,
  grill: 'Your coach ran out of room before finishing. Ask it to carry on.',
  build: 'Your coach ran out of room before finishing your prompt, so the end may be missing. Check the last section, or press Rewrite to try again.',
  tune: CUT_SHORT,
};

const downloadMarkdown = (canvas: Canvas) => downloadText('product-canvas.md', canvasToMarkdown(canvas));

const JUDGE_ANYWAY = "Your coach hasn't signed off on every step yet. You can still write your prompt, but it may be vaguer. Go ahead?";
const LENGTH_ANYWAY = "Some steps aren't filled in yet. You can still write your prompt, but it may be vaguer. Go ahead?";

export function Workspace({ code, settings, onUnauthorised }: { code: string; settings: PublicSettings; onUnauthorised: () => void }) {
  const [initial] = useState(loadState);
  const [canvas, setCanvas] = useState<Canvas>(initial.canvas);
  const [challenges, setChallenges] = useState(initial.challenges);
  const [stepIndex, setStepIndex] = useState(initial.step);
  const [panelModes, setPanelModes] = useState<Partial<Record<StepId, PanelMode>>>({});
  const [tune, setTune] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ step: StepId; message: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [moves, setMoves] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // The step checker runs on its own, so it never waits for the coach's `busy`.
  const [checking, setChecking] = useState<ReadonlySet<StepId>>(() => new Set());
  const [judgeErrors, setJudgeErrors] = useState<Partial<Record<StepId, string>>>({});
  const checksRunning = useRef(new Set<StepId>());
  const generation = useRef(0);
  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;

  const judgeOn = settings.aiJudge && settings.judgeAvailable;
  const completion = useMemo(() => ({ judge: judgeOn }), [judgeOn]);
  const nickname = useMemo(() => nicknameFor(getClientId()), []);

  const step = STEPS[stepIndex] ?? STEPS[0]!;
  const done = completedCount(canvas, completion);
  useSync(
    code,
    canvas,
    STEPS.filter((s) => isStepComplete(canvas, s.id, completion)).map((s) => s.id),
  );

  // Autosave, debounced.
  useEffect(() => {
    const timer = window.setTimeout(() => saveState({ canvas, challenges, step: stepIndex }), 400);
    return () => window.clearTimeout(timer);
  }, [canvas, challenges, stepIndex]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const goTo = useCallback((index: number) => {
    setStepIndex(index);
    setMoves((n) => n + 1);
  }, []);

  // Once the new step has rendered, show it from the top and move focus to its title.
  useEffect(() => {
    if (moves === 0) return;
    window.scrollTo({ top: 0 });
    mainRef.current?.querySelector<HTMLElement>('#step-title')?.focus({ preventScroll: true });
  }, [moves]);

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

  // ---- Step checker ------------------------------------------------------
  async function checkStep(id: CoachStepId) {
    const snapshot = canvasRef.current;
    if (checksRunning.current.has(id) || !canCheck(snapshot, id)) return;
    const gen = generation.current;
    const publish = () => setChecking(new Set(checksRunning.current));
    checksRunning.current.add(id);
    publish();
    setJudgeErrors((e) => ({ ...e, [id]: '' }));
    try {
      const judgement = await requestJudgement({
        code,
        clientId: getClientId(),
        step: id,
        canvas: canvasForRequest(snapshot),
        clarifications: clarificationsFrom(snapshot.chats)[id],
      });
      if (gen === generation.current) update((c) => ({ ...c, judgements: { ...c.judgements, [id]: judgement } }));
    } catch (e) {
      if (e instanceof UnauthorisedError) onUnauthorised();
      else if (gen === generation.current) setJudgeErrors((all) => ({ ...all, [id]: e instanceof Error ? e.message : "The step checker couldn't answer just now. Please try again in a moment." }));
    } finally {
      checksRunning.current.delete(id);
      publish();
    }
  }

  /** Next never waits: if this step hasn't been checked yet, the check runs in the background. */
  function next() {
    if (isCoachStep(step.id) && needsAutoCheck(canvas, step.id, completion, checksRunning.current.has(step.id))) void checkStep(step.id);
    goTo(stepIndex + 1);
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
  async function writePrompt(anyway = false) {
    if (busy) return;
    const unfinished = missingCoachSteps(canvas, completion).length > 0;
    const write = async () => {
      const previous = canvas.build.prompt;
      setPanelModes((p) => ({ ...p, build: undefined }));
      update((c) => ({ ...c, build: { ...c.build, prompt: '' } }));
      const result = await run('build', 'build', { canvas: canvasForRequest(canvas), clarifications: clarificationsFrom(canvas.chats) }, (t) => update((c) => ({ ...c, build: { ...c.build, prompt: t } })));
      // On failure, put back the prompt they had, edits included.
      if (result === null || result.text.trim() === '') update((c) => ({ ...c, build: { ...c.build, prompt: previous } }));
    };
    const replaceNote = canvas.build.prompt.trim() ? ' This will replace the prompt you have now, including any edits you have made.' : '';
    if (anyway && unfinished) {
      setConfirm({
        title: 'Write your prompt anyway?',
        message: (judgeOn ? JUDGE_ANYWAY : LENGTH_ANYWAY).replace(' Go ahead?', `${replaceNote} Go ahead?`),
        confirmLabel: 'Yes, write it',
        onConfirm: () => void write(),
      });
    } else if (canvas.build.prompt.trim()) {
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
    const result = await run('tune', 'build', { canvas: canvasForRequest(canvas), clarifications: clarificationsFrom(canvas.chats) }, setTune);
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
        generation.current += 1;
        checksRunning.current.clear();
        setChecking(new Set());
        setJudgeErrors({});
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
          <div className="brand-block">
            <p className="brand">
              <Sticker name="face" size={28} eager className="sticker--brand" />
              Product Pal
            </p>
            <p className="topbar__nick">You're {nickname}</p>
          </div>
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
        <MobileProgress canvas={canvas} current={stepIndex} onSelect={goTo} mode={completion} showTimings={settings.showTimings} checking={checking} />
      </header>

      <div className="layout">
        <Stepper canvas={canvas} current={stepIndex} onSelect={goTo} mode={completion} showTimings={settings.showTimings} checking={checking} />

        <main className="main" ref={mainRef} tabIndex={-1} id="main">
          <div className="main__content">
            <StepHeader step={step} showTimings={settings.showTimings} />
            {step.id === 'build' ? (
              <BuildStep
                canvas={canvas}
                busy={busy !== null}
                writing={busy?.kind === 'build'}
                onBuild={(patch) => update((c) => ({ ...c, build: { ...c.build, ...patch } }))}
                onWrite={() => void writePrompt()}
                onWriteAnyway={() => void writePrompt(true)}
                judge={judgeOn}
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
                judgeOn={judgeOn}
                canCheck={canCheck(canvas, step.id)}
                judgeView={judgeView(canvas, step.id, checking.has(step.id))}
                judgeError={judgeErrors[step.id] ?? ''}
                onCheck={() => void checkStep(step.id as CoachStepId)}
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
              <button type="button" className="btn btn--primary" onClick={next}>
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
