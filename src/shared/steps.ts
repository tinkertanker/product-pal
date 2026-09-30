// Step content lives here as data. Components render it; prompts read it.

import type { StepId } from './canvas';

export type FieldDef = {
  /** Key inside the step's section of the canvas. The five whys use "whys.0" … "whys.4". */
  id: string;
  label: string;
  placeholder?: string;
  /** Guiding question shown under the label. */
  helper?: string;
  multiline: boolean;
  required: boolean;
  /** The one field the coach challenges and rewrites. */
  main?: boolean;
};

export type StepDef = {
  id: StepId;
  number: number;
  title: string;
  /** Used in sentences: "Grill me on my problem statement." */
  shortTitle: string;
  minutes: number;
  /** What to show in the chip, e.g. "5+". */
  minutesLabel: string;
  videoId: string;
  whyItMatters: string;
  fields: FieldDef[];
  shapeItLike: string;
  avoid: string;
  /** Short note under the fields. */
  hint?: string;
  callout?: { title: string; body: string };
};

export const PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLPCy3_08hWx_zOwXQM2jXKuwWYMil6HAd';
export const IDG_URL = 'https://www.idg.gov.sg/product-thinking/';
export const IDG_CREDIT = 'Product Thinking 101, Institute of Digital Government';
export const embedUrl = (videoId: string) => `https://www.youtube-nocookie.com/embed/${videoId}`;

const whyFields: FieldDef[] = Array.from({ length: 5 }, (_, i) => ({
  id: `whys.${i}`,
  label: `Why? (${i + 1})`,
  placeholder: i === 0 ? "Start with the surface problem, e.g. 'Staff miss follow-up emails'" : 'Why does that happen?',
  multiline: false,
  required: i < 3,
}));

export const STEPS: StepDef[] = [
  {
    id: 'idea',
    number: 1,
    title: 'Your idea',
    shortTitle: 'idea',
    minutes: 3,
    minutesLabel: '3',
    videoId: 'DqGP6BvyRdk',
    whyItMatters:
      'Most ideas that fail solve a problem nobody had. Start by writing down who is hurting and how — not what you want to build.',
    fields: [
      {
        id: 'who',
        label: 'Who is this for?',
        placeholder: "A specific person or role, e.g. 'new nurses on night shift'",
        multiline: false,
        required: true,
      },
      { id: 'pain', label: 'What is painful for them today?', multiline: true, required: true },
      { id: 'wish', label: 'What do you wish existed?', multiline: true, required: true },
      {
        id: 'oneLine',
        label: 'Your idea in one line',
        placeholder: 'Say it the way a colleague would, not the way a vendor would',
        multiline: false,
        required: true,
        main: true,
      },
    ],
    shapeItLike: 'One sentence about a need that keeps coming back, in plain words.',
    avoid: "Naming the technology ('a chatbot', 'an AI agent') instead of the job it does.",
  },
  {
    id: 'why',
    number: 2,
    title: 'Start with the why',
    shortTitle: 'why',
    minutes: 7,
    minutesLabel: '7',
    videoId: 'wdzcM6ax5YY',
    whyItMatters:
      "A request like 'build us a chatbot' is a solution. Ask 'why?' until you reach the need underneath it. If the idea only makes sense because it uses AI, there is no why.",
    fields: [
      ...whyFields,
      {
        id: 'statement',
        label: 'Your why in one sentence',
        placeholder: '[Who] needs [outcome]; if nothing changes, [consequence].',
        multiline: true,
        required: true,
        main: true,
      },
    ],
    hint: 'Stop when you reach a cause you can actually do something about.',
    shapeItLike: '[Named user] needs [outcome]; if nothing changes, [consequence].',
    avoid: "A why that is a feature request in disguise. Test it: delete the word 'AI'. Does it still make sense?",
  },
  {
    id: 'problem',
    number: 3,
    title: 'Problem statement',
    shortTitle: 'problem statement',
    minutes: 8,
    minutesLabel: '8',
    videoId: 'aBSAouM7iaE',
    whyItMatters: 'A clear problem statement keeps everyone on the same problem. Use the 4Cs. No solutions allowed yet.',
    fields: [
      {
        id: 'clarity',
        label: 'Clarity',
        helper: 'Who is affected? What are they trying to do? What is broken, and how badly?',
        multiline: true,
        required: true,
      },
      {
        id: 'consequence',
        label: 'Consequence',
        helper: "What happens if nobody fixes this? If the answer is 'not much', it may not be worth solving.",
        multiline: true,
        required: true,
      },
      {
        id: 'cause',
        label: 'Cause',
        helper: 'Why does the problem exist? Link back to your five whys.',
        multiline: true,
        required: true,
      },
      {
        id: 'confirmation',
        label: 'Confirmation',
        helper: 'What evidence shows it is real? A number, an observation, a quote.',
        multiline: true,
        required: true,
      },
      {
        id: 'statement',
        label: 'Problem statement',
        placeholder: '[User] needs to [do X] because [reason]. Today they [workaround], which costs [consequence].',
        multiline: true,
        required: true,
        main: true,
      },
    ],
    shapeItLike: 'One user, one moment, one pain — backed by evidence.',
    avoid: "A statement that already contains the fix. If it names an app, a tool or AI, it's a proposal, not a problem.",
  },
  {
    id: 'metric',
    number: 4,
    title: 'Useful metric',
    shortTitle: 'metric',
    minutes: 6,
    minutesLabel: '6',
    videoId: 'Rtb_tlSzTJ0',
    whyItMatters: "You need one number that shows the user's life got better. Usage counts don't do that.",
    fields: [
      {
        id: 'primary',
        label: 'Primary outcome metric',
        placeholder: 'e.g. minutes to complete a handover',
        multiline: false,
        required: true,
        main: true,
      },
      {
        id: 'baseline',
        label: "Today's value (a rough guess is fine — say how you'd check it)",
        multiline: true,
        required: true,
      },
      { id: 'target', label: 'What would count as success, and by when?', multiline: true, required: true },
      {
        id: 'guardrail',
        label: 'Guardrail — what must not get worse?',
        placeholder: 'e.g. error rate, cost, staff trust',
        multiline: false,
        required: true,
      },
    ],
    callout: {
      title: 'Vanity metrics to avoid',
      body: "Logins, prompts sent, reports generated, seats deployed, page views. Leading indicators tell you early; lagging indicators prove the outcome. Aim for the outcome.",
    },
    shapeItLike: 'One outcome metric, today\'s baseline, a target and a guardrail.',
    avoid: "Counting activity. If the metric goes up while nobody's life improves, it's a vanity metric.",
  },
  {
    id: 'assumption',
    number: 5,
    title: 'Riskiest assumption',
    shortTitle: 'riskiest assumption',
    minutes: 6,
    minutesLabel: '6',
    videoId: '_iZNhzdLd7A',
    whyItMatters:
      'Every idea rests on beliefs that might be false. Find the one that would kill the idea, and test it cheaply before you build.',
    fields: [
      {
        id: 'list',
        label: 'What must be true for this to work?',
        placeholder: 'Will people want it? Can it be built? Is it worth the cost?',
        multiline: true,
        required: true,
      },
      { id: 'riskiest', label: 'The riskiest one', multiline: true, required: true, main: true },
      {
        id: 'test',
        label: 'Cheapest test you could run this week — no code',
        placeholder: 'Interviews, a spreadsheet, a paper mock-up, running it by hand',
        multiline: true,
        required: true,
      },
      {
        id: 'threshold',
        label: 'Pass or fail? Decide before you test',
        placeholder: 'e.g. 4 of 5 users finish the task without help',
        multiline: false,
        required: true,
      },
    ],
    callout: {
      title: 'Example',
      body: "Singapore's health appointment booking system began as a FormSG form feeding a spreadsheet. Not scalable — but it proved people would book. The test group made 24 bookings; the control group made none.",
    },
    shapeItLike:
      'The belief that would kill the idea, a test you can run this week, and a pass mark set in advance.',
    avoid: "'We'll find out once it's built.' That is the most expensive test there is.",
  },
  {
    id: 'experience',
    number: 6,
    title: 'Customer experience',
    shortTitle: 'customer experience',
    minutes: 6,
    minutesLabel: '6',
    videoId: 'wMe7WgWzIe8',
    whyItMatters: 'People adopt things that fit their day. Design the journey, not the screen.',
    fields: [
      {
        id: 'where',
        label: "Where does this show up in the user's day?",
        placeholder: 'Inside a tool they already use? Email, chat, an existing system?',
        multiline: true,
        required: true,
      },
      {
        id: 'firstTwoMinutes',
        label: "The first two minutes, step by step, from the user's side",
        multiline: true,
        required: true,
        main: true,
      },
      {
        id: 'unhappyPath',
        label: 'What happens when it goes wrong?',
        placeholder: 'Wrong answer, missing data, needs a human — what does the user see and do?',
        multiline: true,
        required: true,
      },
      {
        id: 'elevenStar',
        label: 'Stretch: what would an 11-star version be? What part of it is worth building now?',
        multiline: true,
        required: false,
      },
    ],
    shapeItLike:
      "Two minutes in the user's shoes, inside the tools they already use, including when things go wrong.",
    avoid: 'Another portal to log in to, and no plan for wrong answers.',
  },
  {
    id: 'build',
    number: 7,
    title: 'Build prompt',
    shortTitle: 'build prompt',
    minutes: 5,
    minutesLabel: '5+',
    videoId: 'sI5veUTIzkk',
    whyItMatters:
      'Now — and only now — decide what to build. Turn your canvas into a prompt for your coding tool, then tune it until a stranger could build from it.',
    fields: [],
    shapeItLike: 'A prompt a stranger could build from: who it is for, the problem, the metric, and the smallest first version.',
    avoid: 'Asking for everything at once. A first version tests one assumption.',
  },
];

export function getStep(id: StepId): StepDef {
  const step = STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown step: ${id}`);
  return step;
}

export function getMainField(id: StepId): FieldDef | undefined {
  return getStep(id).fields.find((f) => f.main);
}

export function totalMinutes(): number {
  return STEPS.reduce((sum, s) => sum + s.minutes, 0);
}
