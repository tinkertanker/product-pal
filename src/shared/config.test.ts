import { describe, expect, it } from 'vitest';
import { configFromEnv, configWarnings } from './config';

describe('configFromEnv', () => {
  it('reads codes and LLM settings, tidying whitespace and trailing slashes', () => {
    const config = configFromEnv({
      WORKSHOP_CODE: ' abc12, xyz99 ',
      LLM_BASE_URL: 'https://api.example.com/v1//',
      LLM_API_KEY: ' key ',
      LLM_MODEL: 'm',
      LLM_REASONING_EFFORT: 'low',
    });
    expect(config.codes).toEqual(['ABC12', 'XYZ99']);
    expect(config.llm).toEqual({ baseUrl: 'https://api.example.com/v1', apiKey: 'key', model: 'm', reasoningEffort: 'low' });
  });

  it('treats missing or non-text values as empty', () => {
    const config = configFromEnv({ WORKSHOP_CODE: 5, LLM_MODEL: undefined });
    expect(config.codes).toEqual([]);
    expect(config.llm).toEqual({ baseUrl: '', apiKey: '', model: '', reasoningEffort: '' });
  });
});

describe('configWarnings', () => {
  it('flags a missing code and missing LLM settings', () => {
    expect(configWarnings(configFromEnv({}))).toHaveLength(2);
  });
  it('is quiet when everything is set', () => {
    const config = configFromEnv({ WORKSHOP_CODE: 'A', LLM_BASE_URL: 'https://x', LLM_API_KEY: 'k', LLM_MODEL: 'm' });
    expect(configWarnings(config)).toEqual([]);
  });
});
