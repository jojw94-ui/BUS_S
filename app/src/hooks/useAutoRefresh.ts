import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * enabled 이고 앱이 화면에 떠 있을 때만 intervalMs 마다 callback 을 부른다.
 * 앱이 다시 앞으로 오면 바로 한 번 부른다.
 */
export function useAutoRefresh(callback: () => void, intervalMs: number, enabled: boolean) {
  const cb = useRef(callback);
  cb.current = callback;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(() => cb.current(), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        cb.current();
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [intervalMs, enabled]);
}
