// Test data: a small fictional canvas. Used by unit tests only.

import { emptyCanvas, type Canvas } from './canvas';

export function filledCanvas(): Canvas {
  const c = emptyCanvas();
  c.idea = {
    who: 'new nurses on night shift',
    pain: 'They spend twenty minutes hunting for handover notes across three systems.',
    wish: 'One place that shows what changed for each patient since the last shift.',
    oneLine: 'Help night nurses see what changed on their ward without hunting for notes.',
  };
  c.why.whys = [
    'Nurses miss changes to patient plans.',
    'Notes live in three different systems.',
    'Nobody owns a single handover summary.',
    '',
    '',
  ];
  c.why.statement = 'New night nurses need a reliable handover; if nothing changes, patients get the wrong care.';
  c.problem = {
    clarity: 'New night nurses on ward 4 cannot find the latest patient changes quickly.',
    consequence: 'Medication rounds start late and errors creep in.',
    cause: 'Handover notes are scattered across three systems.',
    confirmation: 'In a week of observation, handover took 22 minutes on average.',
    statement: 'New night nurses need to find patient changes at handover because notes are scattered. Today they search three systems, which delays rounds.',
  };
  c.metric = {
    primary: 'Minutes to complete a shift handover',
    baseline: 'About 22 minutes, from a week of observation on ward 4.',
    target: 'Under 10 minutes within two months.',
    guardrail: 'Medication error rate',
  };
  c.assumption = {
    list: 'Nurses will read a summary. The notes can be pulled together. It is worth the cost.',
    riskiest: 'Nurses will trust a summary they did not write themselves.',
    test: 'Hand-write summaries for one ward for three nights and ask nurses to use them.',
    threshold: '4 of 5 nurses say they would rather use the summary.',
  };
  c.experience = {
    where: 'A message in the ward chat channel at the start of each shift.',
    firstTwoMinutes: 'The nurse opens the chat, sees one card per patient with what changed, taps a card to see the source note.',
    unhappyPath: 'If a note is missing the card says so and shows who to call.',
    elevenStar: '',
  };
  return c;
}
