# Product Pal

A single-activity web app for a hackathon. Participants join with a workshop code (no name, no account), then take one product idea through five screens based on *Product Thinking 101*. An AI coach asks questions and points out gaps; it does not fill in the boxes for them. They finish with a one-page product brief to hand to a coding agent such as Claude Code, Codex, Cursor or Lovable.

The five screens:

1. **Who hurts.** One person or role, what is hard for them today, and how you know. An idea you already have can be parked in a separate box.
2. **Why.** Ask why up to five times, down to a cause the team could change. Then the cost of doing nothing, and a problem statement (Pal can draft it).
3. **Success.** One number that moves when their day gets better, and what it is today. A target and a guardrail are optional.
4. **Riskiest bet.** The assumption that would sink the idea, a test you could run in 30 minutes without code, and a pass mark decided in advance. Pal can suggest three assumptions.
5. **Your brief.** A walkthrough of the first two minutes, what the user sees when it goes wrong, and the smallest thing to build. Pal then writes the brief.

What a participant writes is saved in their browser's `localStorage`, and a copy of their progress is sent quietly to the server (under a made-up nickname such as "Coral Otter", with no name or account) so the facilitator can see it on `/admin` and help them along. The join screen tells participants this and asks them to use made-up or anonymised details.

Adapted from [Metaskills Institute](https://metaskills.sg/).

## Quick start

```sh
cp .dev.vars.example .dev.vars   # then fill in the values
npm install
npm run dev
```

Open http://localhost:5173. One command runs the React app and the Cloudflare Worker (the API) together, via `@cloudflare/vite-plugin`, in the same runtime as production.

Other scripts: `npm run build` (Worker plus static assets into `dist/`), `npm run deploy`, `npm test`, `npm run typecheck`.

## Configuration

| Name | Kind | Required | What it does |
| --- | --- | --- | --- |
| `WORKSHOP_CODE` | secret | yes | One or more join codes, comma-separated. Matching ignores case and surrounding spaces. |
| `LLM_API_KEY` | secret | yes | API key for the LLM service. Never commit it. |
| `LLM_BASE_URL` | var | yes | Base URL of an OpenAI-compatible API. Set in `wrangler.jsonc` (`https://api.deepseek.com`). The app calls `${LLM_BASE_URL}/chat/completions`. |
| `LLM_MODEL` | var | yes | Model name to send. Set in `wrangler.jsonc` (`deepseek-flash`). |
| `LLM_REASONING_EFFORT` | var | no | Sent as `reasoning_effort` only if set. |
| `TYPESAFE_API_KEY` | secret | no | Key for TypeSafe's Jev model, the AI step checker (see below). Without it, steps count as done by a simple length rule. |
| `ADMIN_PASSWORD` | secret | no | Password for the facilitator page at `/admin`. Without it every `/api/admin/*` route answers 503. |
| `DB` | D1 binding | yes | The `product-pal` D1 database, declared in `wrangler.jsonc`. Holds each participant's synced progress and the facilitator's settings. |

Plain vars live in `wrangler.jsonc`. Secrets are not in the file: locally they come from `.dev.vars` (git-ignored; see `.dev.vars.example`), in production from `wrangler secret put`. A value in `.dev.vars` overrides the same var from `wrangler.jsonc` when running locally.

## Step checker (Jev)

Each screen is marked done by an AI judge rather than by length. When a participant presses **Check my step**, or moves on with **Next**, the Worker sends that screen's text to TypeSafe's `jev-latest` model (`POST https://api.typesafe.ai/v1/systemone`, 10 second timeout) as a handful of yes/no questions. The questions, the pass rule and the wording participants see are in `src/shared/judge.ts`. The participant's own answers from the question chat are sent with the step and count towards it.

Every screen also gets a `genuine` check ("Reads as a real attempt"), which is required and needs a probability of 0.6. Required checks must always pass.

| Screen | Checks (required ones in bold) |
| --- | --- |
| Who hurts | **names one person or role**, describes a hard moment, **describes the difficulty without naming a fix**, says how you know or how you would find out |
| Why | **each why digs into a cause** (bar of 0.3, as its scores run lower), ends at something a team could change, says what happens if nothing changes, **the problem statement stops before any solution** |
| Success | **measures a change in their day** (not logins or usage), gives today's value or how to find it |
| Riskiest bet | the assumption would sink the idea, the test fits in 30 minutes without code, the pass mark is a number decided up front |
| Your brief | walks through what the user does and sees, says what the user sees when it goes wrong |

Pass rule: a check passes at a probability of 0.5 or more (unless noted above). A screen passes when every required check passes and, on screens with four or more checks besides `genuine`, at most one other check misses. When a screen fails, Pal writes a short nudge: one line and one question for each missed check.

If `TYPESAFE_API_KEY` is missing, or the facilitator switches **Use the AI step checker** off on `/admin`, the app falls back to a simple length rule. Docs are at https://docs.typesafe.ai. Set the key with `npx wrangler secret put TYPESAFE_API_KEY`.

## The coach (Pal)

The browser names a mode; the Worker owns every prompt (`src/shared/prompts.ts`). There are six modes:

| Mode | What it does |
| --- | --- |
| `nudge` | After a failed check, one short line and one question for each miss. |
| `questions` | A chat that asks one question at a time about a screen. After about four useful answers it lists what to change in which box. |
| `statement` | Drafts the problem statement from screens 1 and 2, using only what the participant wrote. The parked idea is left out. |
| `assumptions` | Suggests three assumptions: do people want it, can it work, is it worth it. |
| `brief` | Writes the product brief. If an idea was parked, it starts with a short `fit` note on whether that idea would test the riskiest bet. |
| `review` | Critiques the brief after the participant has edited it: what is missing, unclear, too big or does not match their notes, plus one suggested paragraph. |

## The outcome: a product brief

The brief is one page of Markdown, 350 to 450 words, with a title, an "In one line" summary and these sections: Problem, Evidence, Success, Riskiest bet, First version (up to three stories), Walkthrough, Not building, Open questions. It uses only what the participant wrote and names no technology. Participants edit it by hand, and can ask Pal to review it.

They pick the tool they will build with, then:

- **Copy brief** copies the Markdown.
- **Download** saves it with a short block of working rules on top, named for the tool: `CLAUDE.md` for Claude Code, `PROJECT.md` for Lovable, `AGENTS.md` for Codex, Cursor and others (`src/shared/agentFile.ts`).
- **Copy kick-off message** copies a separate first message for the agent. It asks it to read the file, ask the open questions in one round of up to three questions with recommended answers, then propose a plan for story 1 (`src/shared/kickoff.ts`). For Lovable, which has no file to read, paste it after the brief.

## Facilitator page (`/admin`)

Set `ADMIN_PASSWORD`, open `/admin` and enter it. You can see every participant (by nickname), which screens each has finished, whether they have a brief, and read their canvas, checker results and question-chat answers. You can also switch the suggested timings and the AI step checker on or off for everyone, download everyone's canvases as one Markdown file, and clear all participants between events.

Participants' browsers send their progress to `POST /api/sync` (debounced to about every four seconds). If a sync fails, the browser retries with backoff, starting at 15 seconds and doubling up to two minutes. Everything `/api/admin/*` needs an `Authorization: Bearer <ADMIN_PASSWORD>` header; wrong passwords count against the same per-IP limit as wrong workshop codes.

## Changing the workshop code

Locally, edit `WORKSHOP_CODE` in `.dev.vars` and restart `npm run dev`. In production, run `npx wrangler secret put WORKSHOP_CODE` (no redeploy needed). Use a comma to allow several: `WORKSHOP_CODE=M82T7,SPARE1`. People already inside get sent back to the join screen the next time they ask the coach for help, with a note to ask the facilitator.

## Switching model or provider

Any OpenAI-compatible Chat Completions endpoint works. Change `LLM_BASE_URL` and `LLM_MODEL` in `wrangler.jsonc` (and the `LLM_API_KEY` secret):

- DeepSeek: `LLM_BASE_URL=https://api.deepseek.com`
- OpenRouter: `LLM_BASE_URL=https://openrouter.ai/api/v1`, with a model such as `anthropic/claude-sonnet-4.5`

Only `delta.content` is streamed to the browser. Reasoning tokens (DeepSeek's `reasoning_content`) are dropped. Reasoning models spend part of the token budget on thinking, so if replies come back empty, try a lower `LLM_REASONING_EFFORT` or a non-reasoning model.

## How it is put together

- `src/shared/` is the functional core: canvas model, step content, prompts, validation, config parsing, rate-limit policy, code matching, the product brief shape, the agent file and kick-off message, and the suggestion parser. All pure, all tested (`npm test`).
- `worker/` is the imperative shell: `worker/index.ts` is the Cloudflare Worker (routes, rate-limit bindings), `worker/llm.ts` makes the streaming call to the LLM, `worker/jev.ts` calls the step checker and `worker/store.ts` holds the SQL for D1. Anything that is not `/api/*` is served as static assets, with single-page-app fallback.
- `src/` (the rest) is the React client.
- The Worker owns every system prompt. The client sends a mode, a step, the canvas and chat history; it can never send its own system prompt.
- Every `/api/coach` call re-checks the workshop code. Limits, enforced by [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) bindings declared in `wrangler.jsonc`: 10 requests per minute per browser, 200 per minute per IP, and 60 wrong-code attempts per minute per IP. `/api/judge` adds 30 requests per minute per browser, and `/api/sync` allows 30 per minute per browser. Counts are approximate and local to each Cloudflare location. If a binding is missing, that limit is skipped.
- Routes: `GET /api/health`, `POST /api/join`, `POST /api/coach`, `POST /api/judge`, `POST /api/sync` (204; bodies over 200 KB get 413), `GET /api/settings` (no code needed; if the database does not answer within 1.5 seconds it returns 503, so browsers keep the settings they last had instead of falling back to defaults), and the admin routes `GET|DELETE /api/admin/participants`, `GET /api/admin/participants/:clientId` and `GET|PUT /api/admin/settings`.
- The `statement`, `assumptions`, `brief` and `review` modes also receive what the participant clarified in the question chats (`clarifications`), which overrides the canvas where they differ.

## Deploying

The app deploys as one Cloudflare Worker with static assets, at https://product-pal.tk.sg (a Workers custom domain, configured in `wrangler.jsonc`; the `tk.sg` zone must be on the same Cloudflare account).

```sh
npx wrangler login                    # once
npx wrangler secret put WORKSHOP_CODE
npx wrangler secret put LLM_API_KEY
npx wrangler secret put TYPESAFE_API_KEY   # optional: the AI step checker
npx wrangler secret put ADMIN_PASSWORD     # optional: the /admin page
npx wrangler d1 migrations apply product-pal --remote   # creates the tables; run before each deploy that adds a migration
npm run deploy                        # npm run build && wrangler deploy
```

The D1 database `product-pal` is created once (`npx wrangler d1 create product-pal`); its id is already in `wrangler.jsonc`. For local development, apply the migrations to the local copy with `npx wrangler d1 migrations apply product-pal --local`.

Check the setup without deploying by running `npx wrangler deploy --dry-run` after a build.

## Old saves

Canvases and database rows from the first version (seven steps) are upgraded when they are read (`normaliseCanvas`, `normaliseDone`), so no migration is needed.

## Credits

- Adapted from [Metaskills Institute](https://metaskills.sg/), who built the first version of this activity.
- Frameworks and videos: [Product Thinking 101](https://www.idg.gov.sg/product-thinking/), Institute of Digital Government.
- The question-asking approach is adapted from Matt Pocock's *grilling* skill (MIT): https://github.com/mattpocock/skills
