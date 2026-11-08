import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal hash router (#/inventory, #/edit/<uid>) so the build works on any
 * static host without server rewrites.
 */
export function useHashRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [path, setPath] = useState(read);

  useEffect(() => {
    const onChange = () => {
      setPath(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((to: string) => {
    if (read() !== to) window.location.hash = to;
  }, []);

  return { path, navigate };
}

export type Navigate = (to: string) => void;
