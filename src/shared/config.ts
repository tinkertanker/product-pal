// Turn the Worker's environment into typed settings. Pure: no process.env, no IO.

import { parseCodes } from './workshopCode';

export type Config = {
  codes: string[];
  llm: { baseUrl: string; apiKey: string; model: string; reasoningEffort: string };
};

export type RawEnv = {
  WORKSHOP_CODE?: unknown;
  LLM_BASE_URL?: unknown;
  LLM_API_KEY?: unknown;
  LLM_MODEL?: unknown;
  LLM_REASONING_EFFORT?: unknown;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function configFromEnv(env: RawEnv): Config {
  return {
    codes: parseCodes(text(env.WORKSHOP_CODE)),
    llm: {
      baseUrl: text(env.LLM_BASE_URL).trim().replace(/\/+$/, ''),
      apiKey: text(env.LLM_API_KEY).trim(),
      model: text(env.LLM_MODEL).trim(),
      reasoningEffort: text(env.LLM_REASONING_EFFORT).trim(),
    },
  };
}

/** Human-readable problems with the configuration, for logging. Empty means fine. */
export function configWarnings(config: Config): string[] {
  const warnings: string[] = [];
  if (config.codes.length === 0) warnings.push('WORKSHOP_CODE is not set: nobody will be able to join.');
  if (!config.llm.baseUrl || !config.llm.apiKey || !config.llm.model) {
    warnings.push('LLM_BASE_URL, LLM_API_KEY or LLM_MODEL is missing: the coach will not work.');
  }
  return warnings;
}
