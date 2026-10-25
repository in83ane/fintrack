"use client";

import React, { useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/** Animate the committed route without remounting its state or delaying navigation. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useLayoutEffect(() => {
    const container = root.current;
    if (!container) return;
    // Keep the persistent sidebar/top bar still. Public routes use the full page.
    const content = container.querySelector<HTMLElement>('[data-page-content]') || container;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = preference.matches;
    const animation = content.animate(
      reduced
        ? [{ opacity: 0.85 }, { opacity: 1 }]
        : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: reduced ? 100 : 240, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
    // Remove even the identity transform, so fixed dialogs keep their viewport anchor.
    animation.onfinish = () => animation.cancel();
    const cancel = () => animation.cancel();
    preference.addEventListener('change', cancel);
    return () => {
      preference.removeEventListener('change', cancel);
      animation.cancel();
    };
  }, [pathname]);

  return <div ref={root} className="min-w-0">{children}</div>;
}
