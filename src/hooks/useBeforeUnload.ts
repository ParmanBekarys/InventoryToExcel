import { useEffect } from 'react';

/** Shows the browser's "Leave site? Changes may not be saved" prompt while `active` is true. */
export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
}
