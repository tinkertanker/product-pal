# Product Pal

A single-activity web app for a hackathon. Participants join with a workshop code (no name, no account), then take one product idea through the *Product Thinking 101* sequence. An AI coach challenges their thinking; it does not fill in the boxes for them. They finish with a build prompt to paste into Claude Code, Codex, Lovable or a similar tool.

Everything a participant writes stays in their browser's `localStorage`. The server keeps nothing.

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

Plain vars live in `wrangler.jsonc`. Secrets are not in the file: locally they come from `.dev.vars` (git-ignored; see `.dev.vars.example`), in production from `wrangler secret put`. A value in `.dev.vars` overrides the same var from `wrangler.jsonc` when running locally.

## Changing the workshop code

Locally, edit `WORKSHOP_CODE` in `.dev.vars` and restart `npm run dev`. In production, run `npx wrangler secret put WORKSHOP_CODE` (no redeploy needed). Use a comma to allow several: `WORKSHOP_CODE=M82T7,SPARE1`. People already inside get sent back to the join screen the next time they ask the coach for help, with a note to ask the facilitator.

## Switching model or provider

Any OpenAI-compatible Chat Completions endpoint works. Change `LLM_BASE_URL` and `LLM_MODEL` in `wrangler.jsonc` (and the `LLM_API_KEY` secret):

- DeepSeek: `LLM_BASE_URL=https://api.deepseek.com`
- OpenRouter: `LLM_BASE_URL=https://openrouter.ai/api/v1`, with a model such as `anthropic/claude-sonnet-4.5`

Only `delta.content` is streamed to the browser. Reasoning tokens (DeepSeek's `reasoning_content`) are dropped. Reasoning models spend part of the token budget on thinking, so if replies come back empty, try a lower `LLM_REASONING_EFFORT` or a non-reasoning model.

## How it is put together

- `src/shared/` is the functional core: canvas model, step content, prompts, validation, config parsing, rate-limit policy, code matching, the build-prompt checklist and the suggestion parser. All pure, all tested (`npm test`).
- `worker/` is the imperative shell: `worker/index.ts` is the Cloudflare Worker (routes, rate-limit bindings) and `worker/llm.ts` makes the streaming call to the LLM. Anything that is not `/api/*` is served as static assets, with single-page-app fallback.
- `src/` (the rest) is the React client.
- The Worker owns every system prompt. The client sends a mode, a step, the canvas and chat history; it can never send its own system prompt.
- Every `/api/coach` call re-checks the workshop code. Limits, enforced by [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) bindings declared in `wrangler.jsonc`: 10 requests per minute per browser, 200 per minute per IP, and 60 wrong-code attempts per minute per IP. Counts are approximate and local to each Cloudflare location. If a binding is missing, that limit is skipped.

## Deploying

The app deploys as one Cloudflare Worker with static assets, at https://product-pal.tk.sg (a Workers custom domain, configured in `wrangler.jsonc`; the `tk.sg` zone must be on the same Cloudflare account).

```sh
npx wrangler login                    # once
npx wrangler secret put WORKSHOP_CODE
npx wrangler secret put LLM_API_KEY
npm run deploy                        # npm run build && wrangler deploy
```

Check the setup without deploying by running `npx wrangler deploy --dry-run` after a build.

## Credits

- Frameworks and videos: [Product Thinking 101](https://www.idg.gov.sg/product-thinking/), Institute of Digital Government.
- The grilling prompt is adapted from Matt Pocock's *grilling* skill (MIT): https://github.com/mattpocock/skills
