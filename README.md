# Product Pal

A single-activity web app for a hackathon. Participants join with a workshop code (no name, no account), then take one product idea through the *Product Thinking 101* sequence. An AI coach challenges their thinking; it does not fill in the boxes for them. They finish with a build prompt to paste into Claude Code, Codex, Lovable or a similar tool.

What a participant writes is saved in their browser's `localStorage`, and a copy of their progress is sent quietly to the server (under a made-up nickname such as "Coral Otter", with no name or account) so the facilitator can see it on `/admin` and help them along. The join screen tells participants this and asks them to use made-up or anonymised details.

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

Steps 1 to 6 are marked done by an AI judge rather than by length. When a participant presses **Check my step**, or moves on with **Next**, the Worker sends that step's text to TypeSafe's `jev-latest` model (`POST https://api.typesafe.ai/v1/systemone`, 10 second timeout) as a handful of yes/no questions, for example "does the problem statement leave out any solution?". The questions, the pass rule and the wording participants see are in `src/shared/judge.ts`. A check passes at a probability of 0.5 or more; a step passes when it reads as a genuine attempt (0.6 or more), every required check passes, and, on steps with four or more checks, at most one other check misses. The participant's own answers from the Grill chat are sent with the step and count towards it.

If `TYPESAFE_API_KEY` is missing, or the facilitator switches **Use the AI step checker** off on `/admin`, the app falls back to the simple length rule. Docs are at https://docs.typesafe.ai. Set the key with `npx wrangler secret put TYPESAFE_API_KEY`.

## Facilitator page (`/admin`)

Set `ADMIN_PASSWORD`, open `/admin` and enter it. You can see every participant (by nickname), which steps each has finished, whether they have a build prompt, and read their canvas, checker results and Grill answers. You can also switch the suggested timings and the AI step checker on or off for everyone, download everyone's canvases as one Markdown file, and clear all participants between events.

Participants' browsers send their progress to `POST /api/sync` (at most every few seconds). Everything `/api/admin/*` needs an `Authorization: Bearer <ADMIN_PASSWORD>` header; wrong passwords count against the same per-IP limit as wrong workshop codes.

## Changing the workshop code

Locally, edit `WORKSHOP_CODE` in `.dev.vars` and restart `npm run dev`. In production, run `npx wrangler secret put WORKSHOP_CODE` (no redeploy needed). Use a comma to allow several: `WORKSHOP_CODE=M82T7,SPARE1`. People already inside get sent back to the join screen the next time they ask the coach for help, with a note to ask the facilitator.

## Switching model or provider

Any OpenAI-compatible Chat Completions endpoint works. Change `LLM_BASE_URL` and `LLM_MODEL` in `wrangler.jsonc` (and the `LLM_API_KEY` secret):

- DeepSeek: `LLM_BASE_URL=https://api.deepseek.com`
- OpenRouter: `LLM_BASE_URL=https://openrouter.ai/api/v1`, with a model such as `anthropic/claude-sonnet-4.5`

Only `delta.content` is streamed to the browser. Reasoning tokens (DeepSeek's `reasoning_content`) are dropped. Reasoning models spend part of the token budget on thinking, so if replies come back empty, try a lower `LLM_REASONING_EFFORT` or a non-reasoning model.

## How it is put together

- `src/shared/` is the functional core: canvas model, step content, prompts, validation, config parsing, rate-limit policy, code matching, the build-prompt checklist and the suggestion parser. All pure, all tested (`npm test`).
- `worker/` is the imperative shell: `worker/index.ts` is the Cloudflare Worker (routes, rate-limit bindings), `worker/llm.ts` makes the streaming call to the LLM, `worker/jev.ts` calls the step checker and `worker/store.ts` holds the SQL for D1. Anything that is not `/api/*` is served as static assets, with single-page-app fallback.
- `src/` (the rest) is the React client.
- The Worker owns every system prompt. The client sends a mode, a step, the canvas and chat history; it can never send its own system prompt.
- Every `/api/coach` call re-checks the workshop code. Limits, enforced by [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) bindings declared in `wrangler.jsonc`: 10 requests per minute per browser, 200 per minute per IP, and 60 wrong-code attempts per minute per IP. `/api/judge` adds 30 requests per minute per browser, and `/api/sync` allows 30 per minute per browser. Counts are approximate and local to each Cloudflare location. If a binding is missing, that limit is skipped.
- Routes: `GET /api/health`, `POST /api/join`, `POST /api/coach`, `POST /api/judge`, `POST /api/sync` (204; bodies over 200 KB get 413), `GET /api/settings` (no code needed), and the admin routes `GET|DELETE /api/admin/participants`, `GET /api/admin/participants/:clientId` and `GET|PUT /api/admin/settings`.
- The build prompt and tune modes also receive what the participant clarified in Grill (`clarifications`), which overrides the canvas where they differ.

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

## Credits

- The first version of this activity was built by the [Metaskills Institute](https://metaskills.sg/).
- Frameworks and videos: [Product Thinking 101](https://www.idg.gov.sg/product-thinking/), Institute of Digital Government.
- The grilling prompt is adapted from Matt Pocock's *grilling* skill (MIT): https://github.com/mattpocock/skills
