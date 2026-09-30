# Product Thinker

A single-activity web app for a hackathon. Participants join with a workshop code (no name, no account), then take one product idea through the *Product Thinking 101* sequence. An AI coach challenges their thinking; it does not fill in the boxes for them. They finish with a build prompt to paste into Claude Code, Codex, Lovable or a similar tool.

Everything a participant writes stays in their browser's `localStorage`. The server keeps nothing.

## Quick start

```sh
cp .env.example .env     # then fill in the values
npm install
npm run dev
```

Open http://localhost:5173. One process serves both the API and the app.

Other scripts: `npm run build`, `npm start` (production), `npm test`, `npm run typecheck`.

## Environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `WORKSHOP_CODE` | yes | One or more join codes, comma-separated. Matching ignores case and surrounding spaces. |
| `LLM_BASE_URL` | yes | Base URL of an OpenAI-compatible API, e.g. `https://api.deepseek.com`. The app calls `${LLM_BASE_URL}/chat/completions`. |
| `LLM_API_KEY` | yes | API key for that service. Never commit it. |
| `LLM_MODEL` | yes | Model name to send. |
| `LLM_REASONING_EFFORT` | no | Sent as `reasoning_effort` only if set. |
| `PORT` | no | Port to listen on. Default 5173. |
| `TRUST_PROXY` | no | Set to `1` (or a proxy setting Express understands) when running behind a reverse proxy, so rate limits see the real client IP. |

## Changing the workshop code

Edit `WORKSHOP_CODE` in `.env` (or in your host's settings) and restart. Use a comma to allow several: `WORKSHOP_CODE=M82T7,SPARE1`. People already inside get sent back to the join screen the next time they ask the coach for help, with a note to ask the facilitator.

## Switching model or provider

Any OpenAI-compatible Chat Completions endpoint works. Change three variables:

- DeepSeek: `LLM_BASE_URL=https://api.deepseek.com`
- OpenRouter: `LLM_BASE_URL=https://openrouter.ai/api/v1`, with a model such as `anthropic/claude-sonnet-4.5`

Only `delta.content` is streamed to the browser. Reasoning tokens (DeepSeek's `reasoning_content`) are dropped. Reasoning models spend part of the token budget on thinking, so if replies come back empty, try a lower `LLM_REASONING_EFFORT` or a non-reasoning model.

## How it is put together

- `src/shared/` is the functional core: canvas model, step content, prompts, validation, rate-limit maths, code matching, the build-prompt checklist and the suggestion parser. All pure, all tested (`npm test`).
- `server/` is the imperative shell: Express routes and the streaming call to the LLM.
- `src/` (the rest) is the React client.
- The server owns every system prompt. The client sends a mode, a step, the canvas and chat history; it can never send its own system prompt.
- Every `/api/coach` call re-checks the workshop code. Limits: 20 requests per 5 minutes per browser, 600 per 5 minutes per IP. Wrong-code attempts are also limited per IP.

## Deploying

Any Node 22 host:

```sh
npm install
npm run build
npm start
```

Set the environment variables on the host. Behind a proxy, also set `TRUST_PROXY=1`. The rate limiter is in memory, so run a single instance.

## Credits

- Frameworks and videos: [Product Thinking 101](https://www.idg.gov.sg/product-thinking/), Institute of Digital Government.
- The grilling prompt is adapted from Matt Pocock's *grilling* skill (MIT): https://github.com/mattpocock/skills
