// Test data: a small fictional canvas. Used by unit tests only.

import { emptyCanvas, type Canvas } from './canvas';

/** A full canvas with an idea parked on the first screen. The brief is not written yet. */
export function filledCanvas(): Canvas {
  const c = emptyCanvas();
  c.who = {
    who: 'New nurses on night shift',
    pain: 'At handover they hunt through three systems to find what changed for each patient.',
    evidence: 'I timed four handovers on ward 4: about 22 minutes each.',
    parkedIdea: 'A summary of what changed since the last shift.',
  };
  c.why = {
    whys: [
      'Notes live in three different systems.',
      'Each team writes in the tool it knows.',
      'Nobody owns a single handover summary.',
      '',
      '',
    ],
    consequence: 'Medication rounds start late and changes get missed.',
    statement:
      'New night nurses cannot see what changed for each patient at handover, because nobody owns a single summary and the notes sit in three systems. Rounds start late and changes get missed.',
  };
  c.success = {
    metric: 'Minutes to complete a handover',
    today: 'About 22 minutes; I timed four handovers on ward 4.',
    target: 'Under 10 minutes within two months.',
    guardrail: 'Mistakes in the notes',
  };
  c.bet = {
    assumption: 'Nurses will trust a summary they did not write themselves.',
    test: 'Show three nurses a hand-written summary and watch what they do with it.',
    passMark: '2 of 3 find the changed patient in under a minute.',
  };
  c.brief = {
    ...c.brief,
    firstTwoMinutes:
      '1. Opens the ward chat. 2. Sees one card per patient with what changed. 3. Taps a card to read the source note.',
    unhappyPath: 'A note is missing: the card says so and shows who to call.',
    where: 'In the ward chat they already use.',
  };
  return c;
}

/** The same canvas with no idea parked: the last screen asks for the smallest build instead. */
export function unparkedCanvas(): Canvas {
  const c = filledCanvas();
  c.who.parkedIdea = '';
  c.brief.smallestBuild = 'One page that lists what changed for each patient.';
  return c;
}

/** The same canvas with a written brief, as the last screen leaves it. */
export function briefedCanvas(): Canvas {
  const c = filledCanvas();
  c.brief.document = [
    '# Handover summary: product brief',
    '**In one line:** Help night nurses see what changed for each patient without hunting for notes.',
    '## Problem',
    'New night nurses cannot see what changed at handover because notes sit in three systems. Rounds start late.',
    '## Evidence',
    '- I timed four handovers on ward 4: about 22 minutes each.',
    '## Success',
    '- Metric: minutes to complete a handover',
    '- Today: about 22 minutes',
    '- Target: under 10 minutes within two months',
    '- Must not get worse: mistakes in the notes',
    '## Riskiest bet',
    'Nurses will trust a summary they did not write themselves.',
    '- Test: show three nurses a hand-written summary',
    '- Pass mark: 2 of 3 find the changed patient in under a minute',
    '- Result: not run yet',
    '## First version',
    '1. As a night nurse, I see one card per changed patient. Done when I can find the changed patient in under a minute.',
    '## Walkthrough',
    '1. Opens the ward chat.',
    '2. Sees one card per patient with what changed.',
    '3. Taps a card to read the source note.',
    'If it goes wrong: the card says a note is missing and shows who to call.',
    '## Not building',
    '- A new app',
    '- Alerts',
    '- Anything for day shift',
    '## Open questions',
    '- Which ward goes first?',
  ].join('\n');
  return c;
}
