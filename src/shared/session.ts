// Local session artifacts are evidence of what Pal said, never participant facts.
import { STEP_IDS, type Canvas, type StepId } from './canvas';
import { clarificationsFrom, fingerprint } from './contracts';

export const ARTIFACT_KINDS = ['statement', 'assumptions', 'brief', 'review', 'nudge'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
export type Artifact = { id: string; kind: ArtifactKind; step: StepId; text: string; basedOn: string };
export type Session = { id: string; artifacts: Artifact[] };
export const ARTIFACT_TEXT_LIMIT = 14000;
export const ARTIFACT_LIMIT = 9; // Four tools plus one nudge per step.

export function newSession(): Session {
  return { id: crypto.randomUUID(), artifacts: [] };
}

export function readArtifact(value: unknown): Artifact | undefined {
  if (!value || typeof value !== 'object') return;
  const a = value as Artifact;
  if (!ARTIFACT_KINDS.includes(a.kind) || !STEP_IDS.includes(a.step)) return;
  if (typeof a.id !== 'string' || !a.id || a.id.length > 100 || typeof a.basedOn !== 'string' || a.basedOn.length > 100) return;
  if (typeof a.text !== 'string' || !a.text.trim() || a.text.length > ARTIFACT_TEXT_LIMIT) return;
  return { id: a.id, kind: a.kind, step: a.step, text: a.text, basedOn: a.basedOn };
}

/** Hash only the source fields/conversation used by this kind of output. */
export function artifactFingerprint(canvas: Canvas, kind: ArtifactKind, step: StepId): string {
  const last = kind === 'statement' ? 'why' : kind === 'assumptions' ? 'success' : kind === 'nudge' ? step : 'brief';
  const fields: Record<string, unknown> = {};
  const conversations = clarificationsFrom(canvas.chats);
  for (const id of STEP_IDS) {
    const section: Record<string, unknown> = { ...canvas[id] };
    if (id === 'why' && kind === 'statement') delete section.statement;
    if (id === 'who' && kind === 'statement') delete section.parkedIdea;
    if (id === 'brief') {
      delete section.fit;
      if (kind !== 'review') delete section.document;
      delete section.platform;
      delete section.otherPlatform;
    }
    fields[id] = [section, conversations[id] ?? []];
    if (id === last) break;
  }
  return fingerprint(JSON.stringify(fields));
}

export function makeArtifact(canvas: Canvas, kind: ArtifactKind, step: StepId, text: string): Artifact {
  if (text.length > ARTIFACT_TEXT_LIMIT) throw new Error('Output is too long to attach exactly.');
  return { id: crypto.randomUUID(), kind, step, text, basedOn: artifactFingerprint(canvas, kind, step) };
}

export function rememberArtifact(session: Session, artifact: Artifact): Session {
  return { ...session, artifacts: [...session.artifacts.filter((a) => a.kind !== artifact.kind || a.step !== artifact.step), artifact].slice(-ARTIFACT_LIMIT) };
}

export const artifactStale = (canvas: Canvas, a: Artifact): boolean => a.basedOn !== artifactFingerprint(canvas, a.kind, a.step);

export function artifactLabel(a: Artifact): string {
  const name = { statement: 'Problem statement', assumptions: 'Assumption suggestions', brief: 'Brief and fit note', review: 'Brief review', nudge: 'Step feedback' }[a.kind];
  return `${name} · ${a.id.slice(0, 8)}`;
}
