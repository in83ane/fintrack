"use client";
import React, { createContext, useContext, useEffect, useState } from 'react';
const Context = createContext({ multiplier: 1 });
export function MotionSettings({ children }: { children: React.ReactNode }) {
  const [multiplier, setMultiplier] = useState(1);
  useEffect(() => {
    const sync = () => {
      const slow = process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('motion') === 'slow';
      setMultiplier(slow ? 5 : 1);
      document.documentElement.style.setProperty('--m', slow ? '5' : '1');
    };
    sync(); window.addEventListener('popstate', sync); window.addEventListener('fintrack:route', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('fintrack:route', sync); };
  }, []);
  return <Context.Provider value={{ multiplier }}>{children}</Context.Provider>;
}
export const useMotionSettings = () => useContext(Context);
