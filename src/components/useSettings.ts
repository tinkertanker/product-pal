import { useEffect, useState } from 'react';
import { fetchPublicSettings } from '../api';
import { DEFAULT_SETTINGS, type PublicSettings } from '../shared/contracts';
import { loadSettings, saveSettings } from '../storage';

const FALLBACK: PublicSettings = { ...DEFAULT_SETTINGS, judgeAvailable: false };
const REFRESH_MS = 60_000;

const same = (a: PublicSettings, b: PublicSettings) => a.showTimings === b.showTimings && a.aiJudge === b.aiJudge && a.judgeAvailable === b.judgeAvailable;

/**
 * The facilitator's settings. Starts from the last ones this browser saw, so
 * nothing flickers on load, then refreshes every minute.
 */
export function useSettings(): PublicSettings {
  const [settings, setSettings] = useState<PublicSettings>(() => loadSettings() ?? FALLBACK);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const next = await fetchPublicSettings();
      if (cancelled || !next) return;
      saveSettings(next);
      setSettings((prev) => (same(prev, next) ? prev : next));
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return settings;
}
