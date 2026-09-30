// Reads the environment once. The only place that touches process.env.

import 'dotenv/config';
import { parseCodes } from '../src/shared/workshopCode';

export type Config = {
  port: number;
  production: boolean;
  codes: string[];
  llm: { baseUrl: string; apiKey: string; model: string; reasoningEffort: string };
  trustProxy: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT) || 5173,
    production: env.NODE_ENV === 'production',
    codes: parseCodes(env.WORKSHOP_CODE),
    llm: {
      baseUrl: (env.LLM_BASE_URL ?? '').replace(/\/+$/, ''),
      apiKey: env.LLM_API_KEY ?? '',
      model: env.LLM_MODEL ?? '',
      reasoningEffort: env.LLM_REASONING_EFFORT ?? '',
    },
    trustProxy: env.TRUST_PROXY ?? '',
  };
}
