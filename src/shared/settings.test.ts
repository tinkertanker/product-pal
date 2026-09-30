import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './contracts';
import { readSettingsPatch, rowsFromPatch, settingsFromRows, toPublicSettings } from './settings';

describe('settings', () => {
  it('starts from the defaults', () => {
    expect(settingsFromRows([])).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.showTimings).toBe(false);
  });
  it('merges stored rows over the defaults and ignores junk', () => {
    const rows = [
      { key: 'showTimings', value: 'true' },
      { key: 'aiJudge', value: 'maybe' },
      { key: 'other', value: 'true' },
    ];
    expect(settingsFromRows(rows)).toEqual({ showTimings: true, aiJudge: true });
    expect(settingsFromRows([{ key: 'aiJudge', value: 'false' }]).aiJudge).toBe(false);
  });
  it('turns a patch into rows', () => {
    expect(rowsFromPatch({ aiJudge: false })).toEqual([{ key: 'aiJudge', value: 'false' }]);
    expect(rowsFromPatch({})).toEqual([]);
  });
  it('accepts only known settings holding booleans', () => {
    expect(readSettingsPatch({ showTimings: true })).toEqual({ ok: true, value: { showTimings: true } });
    expect(readSettingsPatch({})).toEqual({ ok: true, value: {} });
    expect(readSettingsPatch({ showTimings: 'yes' }).ok).toBe(false);
    expect(readSettingsPatch({ nope: true }).ok).toBe(false);
    expect(readSettingsPatch([]).ok).toBe(false);
    expect(readSettingsPatch(null).ok).toBe(false);
  });
  it('adds whether the judge is available', () => {
    expect(toPublicSettings(DEFAULT_SETTINGS, false)).toEqual({ showTimings: false, aiJudge: true, judgeAvailable: false });
  });
});
