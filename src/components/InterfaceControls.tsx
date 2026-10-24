"use client";

import React from "react";
import { flushSync } from "react-dom";
import { Eye, EyeOff, Moon, Sun } from "lucide-react";
import { useApp } from "@/src/context/AppContext";
import { useInterface } from "./InterfaceProvider";

export function InterfaceControls() {
  const { darkMode, setDarkMode, language } = useApp();
  const { privateMode, setPrivateMode } = useInterface();
  const toggleTheme = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const apply = () => { flushSync(() => setDarkMode(!darkMode)); document.documentElement.classList.toggle('light-mode', darkMode); };
    if (!document.startViewTransition || reduced) { apply(); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(apply);
    try {
      await transition.ready;
      document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, { duration: 600, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' });
    } catch { /* A newer transition can supersede this reveal. */ }
  };
  return <div className="flex items-center gap-1">
    <button className="ft-icon-button" aria-pressed={privateMode} aria-label={language === 'th' ? (privateMode ? 'แสดงยอดเงิน' : 'ซ่อนยอดเงิน') : (privateMode ? 'Show amounts' : 'Hide amounts')} onClick={() => setPrivateMode(!privateMode)}>{privateMode ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    <button className="ft-icon-button" aria-label={language === 'th' ? (darkMode ? 'ใช้ธีมสว่าง' : 'ใช้ธีมมืด') : (darkMode ? 'Use light theme' : 'Use dark theme')} onClick={toggleTheme}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
  </div>;
}

export function DensityToggle() {
  const { density, setDensity } = useInterface();
  const { language } = useApp();
  return <div className="ft-density" role="group" aria-label={language === 'th' ? 'ความหนาแน่นของตาราง' : 'Table density'}>{['comfortable', 'compact'].map(value => <button key={value} aria-pressed={density === value} onClick={() => setDensity(value)}>{language === 'th' ? (value === 'compact' ? 'กระชับ' : 'สบายตา') : (value === 'compact' ? 'Compact' : 'Comfortable')}</button>)}</div>;
}
