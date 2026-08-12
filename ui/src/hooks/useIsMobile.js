import { useEffect, useState } from 'react';

// Single source of truth for desktop-vs-mobile RENDERING only — per
// Core Reading UI Contract §0/§1/§2, this never affects state or action
// dispatch, only which layout composition App.jsx renders from the same
// state tree.
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [breakpoint]);
  return isMobile;
}
