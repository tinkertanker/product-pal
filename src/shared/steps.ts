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
      "Before we talk about what to build, let's get clear on who you're helping. Lots of good ideas fall over because they fix something nobody was really struggling with. So start with a person, and what's hard for them today.",
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
    shapeItLike:
      'Try one plain sentence about a need that keeps coming up for this person. Imagine explaining it to a colleague over lunch.',
    avoid:
      "Try not to name the technology yet. 'A chatbot' or 'an AI agent' describes how, and we don't know the how yet. Describe the job it would do instead.",
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
      "When someone asks for 'a chatbot', they've already jumped to an answer. If you keep asking 'why?', you'll usually find the real need a few layers down. Here's a handy check: if your idea only makes sense because it uses AI, we haven't found the why yet.",
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
    hint: "You can stop when you reach a cause that you or your team could actually do something about. Three whys is fine if that's where it lands.",
    shapeItLike:
      "Name the person, what they need, and what happens if nothing changes. For example: 'New night nurses need an accurate handover; if nothing changes, patients miss their medication.'",
    avoid:
      "Watch for a feature request dressed up as a why. A quick test is to cross out the word 'AI'. If the sentence still makes sense, you're on the right track.",
  },
  {
    id: 'problem',
    number: 3,
    title: 'Problem statement',
    shortTitle: 'problem statement',
    minutes: 8,
    minutesLabel: '8',
    videoId: 'aBSAouM7iaE',
    whyItMatters:
      "A good problem statement means everyone on your team is working on the same problem. The 4Cs below help you build one, a piece at a time. Hold off on solutions for now. You'll get to them soon, I promise.",
    fields: [
      {
        id: 'clarity',
        label: 'Clarity',
        helper: "Who is affected? What are they trying to do? What's getting in the way, and how badly?",
        multiline: true,
        required: true,
      },
      {
        id: 'consequence',
        label: 'Consequence',
        helper: "What happens if nobody fixes this? If the honest answer is 'not much', that's worth knowing now.",
        multiline: true,
        required: true,
      },
      {
        id: 'cause',
        label: 'Cause',
        helper: 'Why does the problem exist? Your five whys from the last step should help here.',
        multiline: true,
        required: true,
      },
      {
        id: 'confirmation',
        label: 'Confirmation',
        helper: "How do you know it's real? A number, something you've seen, or something someone told you all count.",
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
    shapeItLike: 'Aim for one person, one moment and one pain, with a bit of evidence to back it up.',
    avoid:
      "If your statement mentions an app, a tool or AI, there's a solution hiding inside it. Take that part out and see what's left.",
  },
  {
    id: 'metric',
    number: 4,
    title: 'Useful metric',
    shortTitle: 'metric',
    minutes: 6,
    minutesLabel: '6',
    videoId: 'Rtb_tlSzTJ0',
    whyItMatters:
      "How will you know if this actually helped? Pick one number that would change if your user's day got better. Counting how often people use your thing won't tell you that on its own.",
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
        label: "What is it today? A rough guess is fine; just note how you'd check it.",
        multiline: true,
        required: true,
      },
      { id: 'target', label: 'What would count as success, and by when?', multiline: true, required: true },
      {
        id: 'guardrail',
        label: "Guardrail: what mustn't get worse?",
        placeholder: 'e.g. error rate, cost, staff trust',
        multiline: false,
        required: true,
      },
    ],
    callout: {
      title: 'Watch out for vanity metrics',
      body: "Logins, prompts sent, reports generated, seats and page views can all go up while nobody is better off. It's fine to watch an early signal, such as how many people try it, but make your main number the outcome you really care about.",
    },
    shapeItLike:
      "One outcome number, what it is today, what you're hoping it becomes, and one thing you'll keep an eye on so it doesn't get worse.",
    avoid: "Counting activity. Ask yourself: could this number go up while nobody's life improves? If so, pick another.",
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
      "Every idea quietly depends on a few things being true. Let's find the one that would sink your idea if it turned out to be wrong, and think of a cheap way to check it before you spend hours building.",
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
        label: 'The cheapest test you could run this week, without writing any code',
        placeholder: 'Interviews, a spreadsheet, a paper mock-up, running it by hand',
        multiline: true,
        required: true,
      },
      {
        id: 'threshold',
        label: 'What result would count as a pass? Decide this before you test',
        placeholder: 'e.g. 4 of 5 users finish the task without help',
        multiline: false,
        required: true,
      },
    ],
    callout: {
      title: 'A real example',
      body: "Singapore's health appointment booking system started life as a FormSG form feeding into a spreadsheet. It would never have scaled, but it showed that people really would book: 24 bookings from the group who were offered it, and none from the group who weren't.",
    },
    shapeItLike:
      "The belief that would sink the idea, a test you could run this week, and the result you'd count as a pass.",
    avoid:
      "'We'll find out once it's built.' That's the slowest and most expensive way to find out, and in a hackathon you don't have the time.",
  },
  {
    id: 'experience',
    number: 6,
    title: 'Customer experience',
    shortTitle: 'customer experience',
    minutes: 6,
    minutesLabel: '6',
    videoId: 'wMe7WgWzIe8',
    whyItMatters:
      "People stick with things that fit into their day. So rather than drawing a screen, walk through the moment from your user's side, including the bits where things go wrong.",
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
        label: 'Stretch: what would an amazing, 11-star version look like? Which small part of it is worth building now?',
        multiline: true,
        required: false,
      },
    ],
    shapeItLike:
      "Two minutes in your user's shoes, inside a tool they already use, and what they see when something goes wrong.",
    avoid: 'Asking people to log in to yet another portal, or forgetting to plan for wrong answers.',
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
      "Well done for getting this far. Now you get to decide what to build! Turn your canvas into a prompt for your coding tool, then keep tuning it until someone who has never met you could build from it.",
    fields: [],
    shapeItLike:
      "Enough detail that a stranger could build it: who it's for, the problem, how you'll measure success, and the smallest first version.",
    avoid: 'Asking for everything at once. Your first version only needs to test your riskiest assumption.',
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
