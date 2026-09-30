// Standalone grilling prompt participants can copy into any AI assistant.
// Adapted from Matt Pocock's "grilling" skill (MIT): https://github.com/mattpocock/skills

export const GRILL_CREDIT = "Adapted from Matt Pocock's grilling skill (MIT)";
export const GRILL_CREDIT_URL = 'https://github.com/mattpocock/skills';
export const GRILL_SKILL_INSTALL = 'npx skills@latest add mattpocock/skills';

export const GRILL_PROMPT = `Grill me relentlessly about the plan below until we reach a shared understanding. Treat it as a design tree: every decision branches into decisions that depend on it.

Work in rounds. Each round, ask every question you can ask now without guessing at answers I haven't given yet. Number each question and give your recommended answer. Then wait for my answers before the next round.

Format each question like this:
❓ Q1 – <title>: <question, with options if useful>
➡️ <your recommended answer>

Each round of answers opens new questions. Keep going until every branch is covered and nothing is silently assumed. Don't act on the plan until I confirm we're aligned.

My plan:
<paste your canvas or build prompt here>`;

/** The line a build prompt opens with when the participant wants to be grilled first. */
export const GRILL_OPENER =
  "Before you write any code, grill me. Interview me in rounds of up to three numbered questions, each with your recommended answer, until we share an understanding of what to build. Don't start building until I confirm.";
