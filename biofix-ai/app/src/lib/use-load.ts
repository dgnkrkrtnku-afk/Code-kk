import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useApp } from './app-context';

/** Load data when the screen is focused, and again whenever the global data version is bumped. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const { errText, version } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await fn();
      if (my === seq.current) { setData(d); setError(''); }
    } catch (e) {
      if (my === seq.current) setError(errText(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { data, setData, error, loading, reload };
}
