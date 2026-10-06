import type { StepId } from '../shared/canvas';

export type StickerName =
  | 'greetings'
  | 'handraise'
  | 'sus'
  | 'facepalm'
  | 'ok'
  | 'shrug'
  | 'happy'
  | 'jumping-for-joy'
  | 'just-peeking'
  | 'intenseglare'
  | 'crashed'
  | 'yay'
  | 'point-left'
  | 'face';

/** One sticker per step header. Kept here so the shared step data stays free of UI. */
export const STEP_STICKER: Record<StepId, StickerName> = {
  who: 'handraise',
  why: 'sus',
  success: 'ok',
  bet: 'shrug',
  brief: 'jumping-for-joy',
};

type Props = {
  name: StickerName;
  /** Rendered size in CSS pixels. The file is square. */
  size: number;
  /** Text for screen readers. Leave empty when the sticker is only decoration. */
  alt?: string;
  /** Set for stickers that are visible on first paint, so they are not lazy-loaded. */
  eager?: boolean;
  className?: string;
};

export function Sticker({ name, size, alt = '', eager = false, className }: Props) {
  const decorative = alt === '';
  return (
    <img
      className={`sticker${className ? ` ${className}` : ''}`}
      src={`${import.meta.env.BASE_URL}stickers/${name}.webp`}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={decorative ? true : undefined}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
    />
  );
}
