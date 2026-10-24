"use client";

import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { usePathname } from "next/navigation";

const InterfaceContext = createContext({ privateMode: false, setPrivateMode: (_: boolean) => {}, density: "comfortable", setDensity: (_: string) => {} });
export const useInterface = () => useContext(InterfaceContext);

export function InterfaceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [privateMode, setPrivateMode] = useState(false);
  const [density, setDensity] = useState("comfortable");
  useLayoutEffect(() => { document.documentElement.dataset.page = pathname.split('/')[1] || 'dashboard'; }, [pathname]);
  useEffect(() => {
    try { setPrivateMode(sessionStorage.getItem('fintrack-private') === 'true'); setDensity(localStorage.getItem('fintrack-density') || 'comfortable'); } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.privacy = String(privateMode);
    try { sessionStorage.setItem('fintrack-private', String(privateMode)); } catch {}
  }, [privateMode]);
  useEffect(() => {
    document.documentElement.dataset.density = density;
    try { localStorage.setItem('fintrack-density', density); } catch {}
  }, [density]);
  return <InterfaceContext.Provider value={{ privateMode, setPrivateMode, density, setDensity }}><MotionConfig reducedMotion="user" transition={{ duration: .2, ease: [.22, 1, .36, 1] }}>{children}</MotionConfig></InterfaceContext.Provider>;
}
