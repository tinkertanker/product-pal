import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UnauthorisedError, requestJudgement, streamCoach, type CoachBody, type CoachResult } from '../api';
import {
  canvasToMarkdown,
  completedCount,
  currentJudgement,
  emptyCanvas,
  isStepComplete,
  missingBeforeBrief,
  setField,
  stepFingerprint,
  type Canvas,
  type ChatMessage,
  type StepId,
} from '../shared/canvas';
import { parseAssumptions, parseFit } from '../shared/coachOutput';
import { afterRun, questionsOpener, isQuestionsOpener, stampJoined, stampMeta } from '../shared/briefFlow';
import { clarificationsFrom, nicknameFor, type CoachMode, type Judgement, type PublicSettings } from '../shared/contracts';
import { emptyBoxesMessage, failedCheckIds, judgeView, needsAutoCheck, shouldNudge, canCheck } from '../shared/judgeFlow';
import { IDG_CREDIT, IDG_URL, STEPS } from '../shared/steps';
import { canvasForRequest, clampMessages } from '../shared/validation';
import { clearState, getClientId, loadState, saveState, type SavedState } from '../storage';
import { BriefStep } from './BriefStep';
import { CoachPanel, type PanelMode } from './CoachPanel';
import { ConfirmDialog, type ConfirmState } from './ConfirmDialog';
import { downloadText } from './download';
import type { NudgeView } from './JudgeCard';
import { MobileProgress, Stepper } from './Stepper';
import { Sticker } from './Sticker';
import { CheckBar, StepHeader, StepView } from './StepView';
import { useSync } from './useSync';

/** How a coach run ended; see `afterRun`. */
type RunResult = { result: CoachResult | null; cancelled: boolean; superseded: boolean };

type Busy = { kind: CoachMode; step: StepId } | null;

/** A nudge as held in memory: `done` is false while the reply is still arriving. */
type Nudge = { fingerprint: string; text: string; done: boolean };

const CUT_SHORT = 'Your coach ran out of room before finishing, so the end of this reply is missing. Try again for a full answer.';

/** Shown when a reply hits the length limit. The reply itself is kept. */
const TRUNCATED: Record<CoachMode, string> = {
  nudge: CUT_SHORT,
  questions: 'Your coach ran out of room before finishing. Ask it to carry on.',
  statement: CUT_SHORT,
  assumptions: CUT_SHORT,
  brief: 'Your coach ran out of room before finishing your brief, so the end may be missing. Check the last section, or press Rewrite to try again.',
  review: CUT_SHORT,
};

const downloadMarkdown = (canvas: Canvas) => downloadText('product-brief.md', canvasToMarkdown(canvas));

const without = <T,>(record: Partial<Record<StepId, T>>, id: StepId): Partial<Record<StepId, T>> => {
  const rest = { ...record };
  delete rest[id];
  return rest;
};

export function Workspace({ code, settings, onUnauthorised }: { code: string; settings: PublicSettings; onUnauthorised: () => void }) {
  const [initial] = useState<SavedState>(loadState);
  const [canvas, setCanvas] = useState<Canvas>(initial.canvas);
  const [nudges, setNudges] = useState<Partial<Record<StepId, Nudge>>>(() =>
    Object.fromEntries(Object.entries(initial.nudges).map(([id, n]) => [id, { ...n, done: true }])),
  );
  const [stepIndex, setStepIndex] = useState(initial.step);
  const [panelModes, setPanelModes] = useState<Partial<Record<StepId, PanelMode>>>({});
  const [review, setReview] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [gate, setGate] = useState<StepId[] | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ step: StepId; message: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [moves, setMoves] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  // The step checker and the nudge that follows it run on their own, so they never wait for the coach's `busy`.
  const [checking, setChecking] = useState<ReadonlySet<StepId>>(() => new Set());
  const [judgeErrors, setJudgeErrors] = useState<Partial<Record<StepId, string>>>({});
  /** Screens where "Check my step" was pressed with boxes empty; the message then follows what is still empty. */
  const [tried, setTried] = useState<ReadonlySet<StepId>>(() => new Set());
  const checksRunning = useRef(new Set<StepId>());
  const nudgeAbort = useRef<Partial<Record<StepId, AbortController>>>({});
  const nudgeStarted = useRef<Partial<Record<StepId, string>>>({});
  const generation = useRef(0);
  const canvasRef = useRef(canvas);
  canvasRef.current = canvas;
  const nudgesRef = useRef(nudges);
  nudgesRef.current = nudges;

  const judgeOn = settings.aiJudge && settings.judgeAvailable;
  const completion = useMemo(() => ({ judge: judgeOn }), [judgeOn]);
  const nickname = useMemo(() => nicknameFor(getClientId()), []);

  const step = STEPS[stepIndex] ?? STEPS[0]!;
  const id = step.id;
  const stepRef = useRef<StepId>(id);
  stepRef.current = id;
  const done = completedCount(canvas, completion);
  useSync(
    code,
    canvas,
    STEPS.filter((s) => isStepComplete(canvas, s.id, completion)).map((s) => s.id),
  );

  // Autosave, debounced. Only finished nudges are kept.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved: SavedState['nudges'] = {};
      for (const s of STEPS) {
        const n = nudges[s.id];
        if (n?.done && n.text) saved[s.id] = { fingerprint: n.fingerprint, text: n.text };
      }
      saveState({ canvas, nudges: saved, step: stepIndex });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [canvas, nudges, stepIndex]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      for (const c of Object.values(nudgeAbort.current)) c.abort();
    },
    [],
  );

  const goTo = useCallback((index: number) => {
    setStepIndex(index);
    setGate(null);
    setMoves((n) => n + 1);
  }, []);

  // Once the new step has rendered, show it from the top and move focus to its title.
  useEffect(() => {
    if (moves === 0) return;
    window.scrollTo({ top: 0 });
    mainRef.current?.querySelector<HTMLElement>('#step-title')?.focus({ preventScroll: true });
  }, [moves]);

  /** Every change to the canvas goes through here, so the join and first-typing times are noted once. */
  const update = useCallback((fn: (c: Canvas) => Canvas) => setCanvas((c) => stampMeta(fn(c), Date.now())), []);
  // On opening, note the join time only; the first-typing time waits for a real keystroke.
  useEffect(() => setCanvas((c) => stampJoined(c, Date.now())), []);

  const setChat = (stepId: StepId, fn: (messages: ChatMessage[]) => ChatMessage[]) =>
    update((c) => ({ ...c, chats: { ...c.chats, [stepId]: fn(c.chats[stepId]) } }));
  const setPanel = (stepId: StepId, mode: PanelMode) => setPanelModes((p) => ({ ...p, [stepId]: mode }));

  /**
   * Run one coach request. Only one at a time: callers check `abortRef` first,
   * and a run that finds another in progress never starts or cancels it.
   * Resolves with the reply (null on failure) and how the run ended, so the
   * caller can ask `afterRun` what to do with what it streamed in.
   */
  async function run(kind: CoachMode, stepId: StepId, body: Omit<CoachBody, 'code' | 'clientId' | 'mode'>, onText: (text: string) => void): Promise<RunResult> {
    if (abortRef.current) {
      setError({ step: stepId, message: 'Your coach was busy with something else, so that did not go through. Please try again in a moment.' });
      return { result: null, cancelled: false, superseded: true };
    }
    const gen = generation.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy({ kind, step: stepId });
    setError(null);
    let result: CoachResult | null = null;
    try {
      result = await streamCoach({ ...body, mode: kind, code, clientId: getClientId() }, (t) => gen === generation.current && onText(t), controller.signal);
      if (result.truncated && gen === generation.current) setError({ step: stepId, message: TRUNCATED[kind] });
    } catch (e) {
      if (e instanceof UnauthorisedError) {
        onUnauthorised();
      } else if (!controller.signal.aborted && gen === generation.current) {
        setError({ step: stepId, message: e instanceof Error ? e.message : "Your coach couldn't answer just now. Please try again in a moment." });
      }
    }
    const cancelled = gen !== generation.current;
    const superseded = !cancelled && abortRef.current !== controller;
    if (superseded) setError({ step: stepId, message: 'Your coach switched to something else, so that reply was set aside. Please try again.' });
    if (abortRef.current === controller) {
      abortRef.current = null;
      setBusy(null);
    }
    return { result: result && !cancelled ? result : null, cancelled, superseded };
  }

  // ---- Step checker ------------------------------------------------------

  /** Ask the checker about a step. Resolves with its verdict, or null if it didn't run or failed. */
  async function runCheck(stepId: StepId): Promise<Judgement | null> {
    const snapshot = canvasRef.current;
    if (checksRunning.current.has(stepId) || !canCheck(snapshot, stepId)) return null;
    const gen = generation.current;
    const publish = () => setChecking(new Set(checksRunning.current));
    checksRunning.current.add(stepId);
    publish();
    setJudgeErrors((e) => ({ ...e, [stepId]: '' }));
    try {
      const judgement = await requestJudgement({
        code,
        clientId: getClientId(),
        step: stepId,
        canvas: canvasForRequest(snapshot),
        clarifications: clarificationsFrom(snapshot.chats)[stepId],
      });
      if (gen !== generation.current) return null;
      update((c) => ({ ...c, judgements: { ...c.judgements, [stepId]: judgement } }));
      // A miss gets one nudge, whichever screen is showing. Skip it if they typed during the check.
      const already = nudgeStarted.current[stepId] ?? nudgesRef.current[stepId]?.fingerprint;
      if (judgement.fingerprint === stepFingerprint(canvasRef.current, stepId) && shouldNudge(judgement, already)) void startNudge(stepId, judgement, snapshot, gen);
      return judgement;
    } catch (e) {
      if (e instanceof UnauthorisedError) onUnauthorised();
      else if (gen === generation.current) setJudgeErrors((all) => ({ ...all, [stepId]: e instanceof Error ? e.message : "The step checker couldn't answer just now. Please try again in a moment." }));
      return null;
    } finally {
      checksRunning.current.delete(stepId);
      publish();
    }
  }

  /** "Check my step": say which boxes are empty, or run the checker. */
  function pressCheck(stepId: StepId) {
    const missing = emptyBoxesMessage(canvasRef.current, stepId) !== '';
    setTried((t) => {
      const next = new Set(t);
      if (missing) next.add(stepId);
      else next.delete(stepId);
      return next;
    });
    if (!missing) void runCheck(stepId);
  }

  /** The coach's reply to a miss: one nudge per judgement, streamed under the card. */
  async function startNudge(stepId: StepId, judgement: Judgement, snapshot: Canvas, gen: number) {
    const { fingerprint } = judgement;
    nudgeStarted.current[stepId] = fingerprint;
    nudgeAbort.current[stepId]?.abort();
    const controller = new AbortController();
    nudgeAbort.current[stepId] = controller;
    const put = (text: string, finished: boolean) => {
      if (gen === generation.current) setNudges((n) => ({ ...n, [stepId]: { fingerprint, text, done: finished } }));
    };
    put('', false);
    try {
      const result = await streamCoach(
        { mode: 'nudge', code, clientId: getClientId(), step: stepId, failed: failedCheckIds(judgement), canvas: canvasForRequest(snapshot) },
        (text) => put(text, false),
        controller.signal,
      );
      put(result.text, true);
    } catch (e) {
      if (e instanceof UnauthorisedError) onUnauthorised();
      // The nudge is a bonus. If it fails, the card's fix lines are still there; a new check can try again.
      if (gen === generation.current) setNudges((n) => without(n, stepId));
      if (nudgeStarted.current[stepId] === fingerprint) delete nudgeStarted.current[stepId];
    } finally {
      if (nudgeAbort.current[stepId] === controller) delete nudgeAbort.current[stepId];
    }
  }

  /** Next never waits: if this step hasn't been checked yet, the check runs in the background. */
  function next() {
    if (needsAutoCheck(canvas, id, completion, checksRunning.current.has(id))) void runCheck(id);
    goTo(stepIndex + 1);
  }

  // ---- Ask me questions --------------------------------------------------
  async function sendChat(stepId: StepId, history: ChatMessage[]) {
    if (abortRef.current) return;
    // `history` already ends with the participant's turn.
    setChat(stepId, () => [...history, { role: 'assistant', content: '' }]);
    const end = await run('questions', stepId, { step: stepId, canvas: canvasForRequest(canvas), messages: clampMessages(history) }, (t) =>
      setChat(stepId, (m) => [...m.slice(0, -1), { role: 'assistant', content: t }]),
    );
    if (afterRun({ text: end.result?.text ?? null, cancelled: end.cancelled, superseded: end.superseded }) === 'restore') {
      // Drop the coach's turn, even if part of it arrived, so it isn't saved or sent back.
      // If only the automatic opener is left, clear it so "Ask me questions" starts afresh.
      setChat(stepId, (m) => {
        const rest = m[m.length - 1]?.role === 'assistant' ? m.slice(0, -1) : m;
        return rest.length === 1 && rest[0] && isQuestionsOpener(rest[0].content) ? [] : rest;
      });
    }
  }

  function askQuestions() {
    if (abortRef.current) return;
    setPanel(id, 'questions');
    if (canvas.chats[id].length === 0) void sendChat(id, [{ role: 'user', content: questionsOpener(id) }]);
  }

  function answerQuestion(text: string) {
    if (abortRef.current) return;
    void sendChat(id, [...canvas.chats[id], { role: 'user', content: text }]);
  }

  function restartQuestions() {
    if (abortRef.current) return;
    setChat(id, () => []);
    void sendChat(id, [{ role: 'user', content: questionsOpener(id) }]);
  }

  // ---- Draft it for me ---------------------------------------------------
  async function draftStatement() {
    if (abortRef.current) return;
    const previous = canvas.why.statement;
    const request = canvasForRequest(setField(canvas, 'why', 'statement', ''));
    const go = async () => {
      if (abortRef.current) return;
      update((c) => setField(c, 'why', 'statement', ''));
      const end = await run('statement', 'why', { canvas: request, clarifications: clarificationsFrom(canvas.chats) }, (t) => update((c) => setField(c, 'why', 'statement', t)));
      if (afterRun({ text: end.result?.text ?? null, cancelled: end.cancelled, superseded: end.superseded }) === 'restore') update((c) => setField(c, 'why', 'statement', previous));
    };
    if (previous.trim()) {
      setConfirm({
        title: 'Replace your problem statement?',
        message: "A new draft will replace what you've written.",
        confirmLabel: 'Yes, replace it',
        onConfirm: () => void go(),
      });
    } else {
      await go();
    }
  }

  // ---- Suggest three -----------------------------------------------------
  async function suggestAssumptions() {
    if (abortRef.current) return;
    setSuggestions([]);
    const end = await run('assumptions', 'bet', { canvas: canvasForRequest(canvas), clarifications: clarificationsFrom(canvas.chats) }, (t) => setSuggestions(parseAssumptions(t)));
    if (afterRun({ text: end.result?.text ?? null, cancelled: end.cancelled, superseded: end.superseded }) === 'restore') setSuggestions([]);
  }

  function pickSuggestion(text: string) {
    const apply = () => update((c) => setField(c, 'bet', 'assumption', text));
    if (canvas.bet.assumption.trim()) {
      setConfirm({ title: 'Use this suggestion?', message: "It will replace what's in the box now.", confirmLabel: 'Yes, use it', onConfirm: apply });
    } else {
      apply();
    }
  }

  // ---- The brief ---------------------------------------------------------
  function startBrief() {
    const latest = canvasRef.current;
    const write = async () => {
      if (abortRef.current) return;
      const previous = { document: latest.brief.document, fit: latest.brief.fit };
      setPanelModes((p) => ({ ...p, brief: undefined }));
      setReview('');
      update((c) => ({ ...c, brief: { ...c.brief, document: '', fit: '' } }));
      const request = canvasForRequest({ ...latest, brief: { ...latest.brief, document: '', fit: '' } });
      const end = await run('brief', 'brief', { canvas: request, clarifications: clarificationsFrom(latest.chats) }, (t) => {
        const { fit, rest } = parseFit(t);
        update((c) => ({ ...c, brief: { ...c.brief, fit: fit ?? '', document: rest } }));
      });
      // On failure, put back the brief they had, edits included.
      if (afterRun({ text: end.result?.text ?? null, cancelled: end.cancelled, superseded: end.superseded }) === 'restore') update((c) => ({ ...c, brief: { ...c.brief, ...previous } }));
    };
    if (latest.brief.document.trim()) {
      setConfirm({
        title: 'Rewrite your brief?',
        message: "A new brief will replace the one you have now, including any edits you've made.",
        confirmLabel: 'Yes, rewrite it',
        onConfirm: () => void write(),
      });
    } else {
      void write();
    }
  }

  /**
   * "Write my brief": check this screen's boxes first, then write. If anything
   * earlier is still unsigned-off, list it and let the participant go ahead anyway.
   */
  async function writeBrief(anyway = false) {
    if (abortRef.current || checksRunning.current.has('brief')) return;
    const gen = generation.current;
    const snapshot = canvasRef.current;
    const missingBoxes = emptyBoxesMessage(snapshot, 'brief') !== '';
    setTried((t) => {
      const next = new Set(t);
      if (missingBoxes) next.add('brief');
      else next.delete('brief');
      return next;
    });
    if (missingBoxes) return;
    setGate(null);

    if (!anyway) {
      let current = snapshot;
      if (judgeOn) {
        const verdict = currentJudgement(snapshot, 'brief') ?? (await runCheck('brief'));
        if (verdict) current = { ...snapshot, judgements: { ...snapshot.judgements, brief: verdict } };
      }
      // Start over may have cleared everything while the check ran.
      if (gen !== generation.current) return;
      const missing = missingBeforeBrief(current, completion);
      if (missing.length > 0) {
        setGate(missing);
        return;
      }
    }
    if (gen !== generation.current) return;
    if (abortRef.current) {
      setError({ step: 'brief', message: 'Your coach was busy, so your brief has not started. Press Write my brief to try again.' });
      return;
    }
    startBrief();
  }

  async function reviewBrief() {
    if (abortRef.current) return;
    setPanel('brief', 'review');
    setReview('');
    const end = await run('review', 'brief', { canvas: canvasForRequest(canvas), clarifications: clarificationsFrom(canvas.chats) }, setReview);
    if (afterRun({ text: end.result?.text ?? null, cancelled: end.cancelled, superseded: end.superseded }) === 'restore') setReview('');
  }

  // ---- Start over --------------------------------------------------------
  function startOver() {
    setConfirm({
      title: 'Start over?',
      message: "This clears everything you've written on this device. Your workshop code stays, so you can start again straight away.",
      confirmLabel: 'Yes, clear it',
      onConfirm: () => {
        abortRef.current?.abort();
        abortRef.current = null;
        for (const c of Object.values(nudgeAbort.current)) c.abort();
        nudgeAbort.current = {};
        setBusy(null);
        generation.current += 1;
        checksRunning.current.clear();
        nudgeStarted.current = {};
        setChecking(new Set());
        setJudgeErrors({});
        setTried(new Set());
        clearState();
        setCanvas(stampMeta(emptyCanvas(), Date.now()));
        setNudges({});
        setPanelModes({});
        setReview('');
        setSuggestions([]);
        setGate(null);
        setError(null);
        goTo(0);
      },
    });
  }

  // ---- What this screen shows --------------------------------------------
  const chat = canvas.chats[id];
  const available: PanelMode[] = [
    ...(chat.length > 0 ? (['questions'] as const) : []),
    ...(id === 'brief' && (review || (busy?.kind === 'review' && busy.step === id)) ? (['review'] as const) : []),
  ];
  const chosen = panelModes[id];
  const mode: PanelMode | null = chosen && available.includes(chosen) ? chosen : (available[available.length - 1] ?? null);
  const stepBusy = busy?.step === id;
  const stepError = error && error.step === id ? error.message : '';

  const view = judgeView(canvas, id, checking.has(id));
  const stepDone = isStepComplete(canvas, id, completion);
  const emptyMessage = tried.has(id) ? emptyBoxesMessage(canvas, id) : '';
  const savedNudge = nudges[id];
  const currentFingerprint = currentJudgement(canvas, id)?.fingerprint;
  const nudge: NudgeView | undefined =
    savedNudge && savedNudge.fingerprint === currentFingerprint ? { text: savedNudge.text, pending: !savedNudge.done } : undefined;

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
            <p className="topbar__progress" aria-label={`${done} of ${STEPS.length} steps complete`}>
              {done} of {STEPS.length}
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
            <StepView
              key={id}
              step={step}
              canvas={canvas}
              onField={(fieldId, value) => update((c) => setField(c, id, fieldId, value))}
              busy={busy !== null}
              drafting={busy?.kind === 'statement'}
              onDraft={() => void draftStatement()}
              suggesting={busy?.kind === 'assumptions'}
              suggestions={suggestions}
              onSuggest={() => void suggestAssumptions()}
              onPickSuggestion={pickSuggestion}
            >
              {id === 'brief' ? (
                <BriefStep
                  canvas={canvas}
                  busy={busy !== null}
                  writing={busy?.kind === 'brief'}
                  judgeOn={judgeOn}
                  checking={view.kind === 'checking'}
                  onBrief={(patch) => update((c) => ({ ...c, brief: { ...c.brief, ...patch } }))}
                  onWrite={() => void writeBrief()}
                  onWriteAnyway={() => void writeBrief(true)}
                  gate={gate}
                  onGoToStep={goTo}
                  onCheck={() => pressCheck('brief')}
                  onReview={() => void reviewBrief()}
                  onQuestions={askQuestions}
                  view={view}
                  checkError={judgeErrors[id] ?? ''}
                  emptyMessage={emptyMessage}
                  nudge={nudge}
                />
              ) : (
                <CheckBar
                  stepId={id}
                  passed={stepDone}
                  judgeOn={judgeOn}
                  view={view}
                  error={judgeErrors[id] ?? ''}
                  emptyMessage={emptyMessage}
                  nudge={nudge}
                  busy={busy !== null}
                  onCheck={() => pressCheck(id)}
                  onQuestions={askQuestions}
                />
              )}
            </StepView>
          </div>

          {(mode || stepError) && (
            <div className="main__coach">
              <CoachPanel
                mode={mode}
                available={available}
                onMode={(m) => setPanel(id, m)}
                busy={stepBusy}
                locked={busy !== null}
                error={stepError}
                reviewText={review}
                chat={chat}
                onSendChat={answerQuestion}
                onRestartChat={restartQuestions}
              />
            </div>
          )}

          <nav className="pager" aria-label="Previous and next step">
            <button type="button" className="btn" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
              ← Previous
            </button>
            {stepIndex < STEPS.length - 1 && (
              <button type="button" className={!judgeOn || stepDone ? 'btn btn--primary' : 'btn'} onClick={next}>
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
          . Adapted from{' '}
          <a href="https://metaskills.sg/" target="_blank" rel="noreferrer">
            Metaskills Institute
          </a>
          .
        </p>
      </footer>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
