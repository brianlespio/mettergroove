import { useEffect, useState } from 'react';

/** Phones and narrow windows. Desktop hover behavior stays unchanged. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse), (max-width: 640px)');
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return coarse;
}
