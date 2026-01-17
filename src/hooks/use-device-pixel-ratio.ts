import { useEffect, useState } from 'react';

export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(
    typeof window !== 'undefined' ? window.devicePixelRatio : 1
  );

  useEffect(() => {
    if (typeof window === 'undefined') { return; }

    const updateDpr = (): void => {
      setDpr(window.devicePixelRatio);
    };

    window.addEventListener('resize', updateDpr);

    return (): void => {
      window.removeEventListener('resize', updateDpr);
    };
  }, []);

  return dpr;
}
