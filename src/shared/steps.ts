// Step content lives here as data. Components render it; prompts read it.
//
// Reading budget: one line of introduction per screen, labels of eight words
// or fewer, helpers of twelve or so. Placeholders are worked examples from one
// running story (night nurses and ward handovers), never instructions.

import type { StepId } from './canvas';

export type FieldDef = {
  /** Key inside the step's section of the canvas. The whys use "whys.0" … "whys.4". */
  id: string;
  label: string;
  /**
   * For boxes whose question builds on an earlier answer: the earlier answer is
   * quoted in the label. `from` is "stepId.fieldId"; `template` contains "{quote}".
   * When the earlier answer is empty, the plain `label` is shown.
   */
  quote?: { from: string; template: string };
  /** Label to use in the markdown export, where a quoted label would read oddly. */
  exportLabel?: string;
  /** A worked example, starting "e.g.". */
  placeholder?: string;
  /** One short line under the label. */
  helper?: string;
  multiline: boolean;
  required: boolean;
  /** Tucked behind the step's "add more" link until asked for or filled in. */
  more?: boolean;
  /** Required only when no idea was parked on the first screen; hidden otherwise. */
  requiredUnlessParked?: boolean;
  /** Pal can draft this box from the earlier answers; the participant edits it. */
  drafted?: boolean;
  /** False for a box the step checker never looks at (the parked idea). Editing it does not make a check stale. */
  judged?: boolean;
};

export type StepDef = {
  id: StepId;
  number: number;
  title: string;
  /** Used in sentences: "Ask me questions about my riskiest bet." */
  shortTitle: string;
  minutes: number;
  videoId: string;
  /** The one line a participant reads before the first box. */
  intro: string;
  fields: FieldDef[];
  /** Label of the link that reveals the `more` boxes. */
  moreLabel?: string;
  /** Shown behind "Need a nudge?". */
  nudge: string;
};

export const PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLPCy3_08hWx_zOwXQM2jXKuwWYMil6HAd';
export const IDG_URL = 'https://www.idg.gov.sg/product-thinking/';
export const IDG_CREDIT = 'Product Thinking 101, Institute of Digital Government';
export const embedUrl = (videoId: string) => `https://www.youtube-nocookie.com/embed/${videoId}`;

export const STEPS: StepDef[] = [
  {
    id: 'who',
    number: 1,
    title: 'Who hurts',
    shortTitle: 'person and their pain',
    minutes: 5,
    videoId: 'DqGP6BvyRdk',
    intro: 'Start with a person, and what is hard for them today.',
    fields: [
      {
        id: 'who',
        label: 'Who is this for?',
        helper: "One person or role, not 'users'.",
        placeholder: 'e.g. New nurses on night shift',
        multiline: false,
        required: true,
      },
      {
        id: 'pain',
        label: "What's hard for them today?",
        helper: "A moment you've seen, not a feature you want.",
        placeholder: 'e.g. At handover they hunt through three systems to find what changed',
        multiline: true,
        required: true,
      },
      {
        id: 'evidence',
        label: 'How do you know?',
        helper: "Something you saw, heard or counted. 'I haven't checked yet; I'd ask a nurse' is fine too.",
        placeholder: 'e.g. I timed four handovers: about 20 minutes each',
        multiline: true,
        required: true,
      },
      {
        id: 'parkedIdea',
        label: 'Your idea, parked',
        helper: "Already have a solution in mind? Park it here. We'll check later whether it still fits.",
        placeholder: 'e.g. A summary of what changed since the last shift',
        multiline: true,
        required: false,
        judged: false,
      },
    ],
    nudge:
      'Say it the way you would to a colleague. If you catch yourself naming an app, a chatbot or AI in the first three boxes, move it to the parked idea box.',
  },
  {
    id: 'why',
    number: 2,
    title: 'Why',
    shortTitle: 'why',
    minutes: 7,
    videoId: 'wdzcM6ax5YY',
    intro: 'Keep asking why until you reach something you could change.',
    fields: [
      {
        id: 'whys.0',
        label: 'Why does this happen?',
        quote: { from: 'who.pain', template: 'Why does this happen? “{quote}”' },
        exportLabel: 'Why does this happen?',
        placeholder: 'e.g. Notes live in three different systems',
        multiline: false,
        required: true,
      },
      {
        id: 'whys.1',
        label: 'And why is that?',
        quote: { from: 'why.whys.0', template: 'And why is that? “{quote}”' },
        exportLabel: 'And why is that? (2)',
        placeholder: 'e.g. Each team writes in the tool it knows',
        multiline: false,
        required: true,
      },
      {
        id: 'whys.2',
        label: 'And why is that?',
        quote: { from: 'why.whys.1', template: 'And why is that? “{quote}”' },
        exportLabel: 'And why is that? (3)',
        helper: 'You can stop when you reach something your team could change.',
        placeholder: 'e.g. Nobody owns a single handover summary',
        multiline: false,
        required: true,
      },
      {
        id: 'whys.3',
        label: 'And why is that?',
        quote: { from: 'why.whys.2', template: 'And why is that? “{quote}”' },
        exportLabel: 'And why is that? (4)',
        multiline: false,
        required: false,
        more: true,
      },
      {
        id: 'whys.4',
        label: 'And why is that?',
        quote: { from: 'why.whys.3', template: 'And why is that? “{quote}”' },
        exportLabel: 'And why is that? (5)',
        multiline: false,
        required: false,
        more: true,
      },
      {
        id: 'consequence',
        label: 'If nothing changes, what happens?',
        placeholder: 'e.g. Medication rounds start late and changes get missed',
        multiline: true,
        required: true,
      },
      {
        id: 'statement',
        label: 'Your problem statement',
        helper: 'Pal can draft this from your answers. Then make it yours.',
        placeholder:
          'e.g. New night nurses cannot see what changed at handover because notes sit in three systems, so rounds start late.',
        multiline: true,
        required: true,
        drafted: true,
      },
    ],
    moreLabel: 'Ask why again',
    nudge:
      "Cross out the word 'AI'. If your answers still make sense, you're on the right track. The problem statement should stop before any solution.",
  },
  {
    id: 'success',
    number: 3,
    title: 'Success',
    shortTitle: 'measure of success',
    minutes: 4,
    videoId: 'Rtb_tlSzTJ0',
    intro: 'Pick one number that moves when their day gets better.',
    fields: [
      {
        id: 'metric',
        label: 'What number changes for them if this works?',
        helper: "Something in their day, such as minutes saved. Usage numbers such as logins don't count.",
        placeholder: 'e.g. Minutes to complete a handover',
        multiline: false,
        required: true,
      },
      {
        id: 'today',
        label: 'Roughly what is it today?',
        helper: "A guess is fine. Say how you'd check.",
        placeholder: "e.g. About 20 minutes; I'd time three handovers",
        multiline: false,
        required: true,
      },
      {
        id: 'target',
        label: 'Target, and by when',
        placeholder: 'e.g. Under 10 minutes within a month',
        multiline: false,
        required: false,
        more: true,
      },
      {
        id: 'guardrail',
        label: "What mustn't get worse?",
        placeholder: 'e.g. Mistakes in the notes',
        multiline: false,
        required: false,
        more: true,
      },
    ],
    moreLabel: 'Add a target and a guardrail',
    nudge:
      "Ask yourself whether this number could go up while nobody's life improves. Logins, page views and prompts sent usually can. If yours can, pick another.",
  },
  {
    id: 'bet',
    number: 4,
    title: 'Riskiest bet',
    shortTitle: 'riskiest bet',
    minutes: 6,
    videoId: '_iZNhzdLd7A',
    intro: 'Find the belief that would sink the idea, and test it cheaply.',
    fields: [
      {
        id: 'assumption',
        label: 'The assumption that would sink it',
        helper: 'Stuck? Ask Pal to suggest three, then pick one or write your own.',
        placeholder: "e.g. Nurses will trust a summary they didn't write",
        multiline: true,
        required: true,
      },
      {
        id: 'test',
        label: 'A test you could run in 30 minutes, without code',
        placeholder: 'e.g. Show three nurses a hand-written summary and watch what they do',
        multiline: true,
        required: true,
      },
      {
        id: 'passMark',
        label: 'What counts as a pass? Decide now.',
        placeholder: 'e.g. 2 of 3 find the changed patient in under a minute',
        multiline: false,
        required: true,
      },
    ],
    nudge:
      "'We'll find out once it's built' is the slowest test there is. Singapore's appointment booking system began as a form feeding a spreadsheet, and that was enough to show people would book.",
  },
  {
    id: 'brief',
    number: 5,
    title: 'Your brief',
    shortTitle: 'walkthrough',
    minutes: 8,
    videoId: 'wMe7WgWzIe8',
    intro: 'Walk through the moment from their side, then let Pal write it up.',
    fields: [
      {
        id: 'firstTwoMinutes',
        label: 'Their first two minutes, step by step',
        placeholder: 'e.g. 1. Opens the ward chat. 2. Sees one card per changed patient. 3. Taps a card to read the note.',
        multiline: true,
        required: true,
      },
      {
        id: 'unhappyPath',
        label: 'When it goes wrong, what does the user see?',
        placeholder: 'e.g. A note is missing: the card says so and shows who to call',
        multiline: true,
        required: true,
      },
      {
        id: 'smallestBuild',
        label: "What's the smallest thing you'd build to run your test?",
        placeholder: 'e.g. One page that lists what changed for each patient',
        multiline: true,
        required: false,
        requiredUnlessParked: true,
      },
      {
        id: 'where',
        label: 'Where will they meet it in their day?',
        placeholder: 'e.g. In the ward chat they already use',
        multiline: false,
        required: false,
        more: true,
      },
    ],
    moreLabel: 'Say where they will meet it',
    nudge:
      'Stay inside a tool they already use, and plan for wrong answers. Your first version only needs to test your riskiest bet.',
  },
];

export function getStep(id: StepId): StepDef {
  const step = STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown step: ${id}`);
  return step;
}

export function totalMinutes(): number {
  return STEPS.reduce((sum, s) => sum + s.minutes, 0);
}

/** A phrase for the join screen, when timings are shown. */
export function approxDuration(): string {
  const minutes = totalMinutes();
  if (minutes <= 35) return 'about half an hour';
  if (minutes <= 50) return 'about 45 minutes';
  return 'about an hour';
}
