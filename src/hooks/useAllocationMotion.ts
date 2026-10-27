"use client";
import { useLayoutEffect, type RefObject } from 'react';

const revealed = new Set<string>();
const ease = 'cubic-bezier(.22,1,.36,1)';
/** Final segment geometry + one mask. A session visit never repeats the entrance. */
export function useAllocationMotion(root: RefObject<HTMLElement | null>, ready: boolean, identity: string) {
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || !ready || revealed.has(identity)) return;
    revealed.add(identity);
    element.dataset.allocationRun = '1';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animations: Animation[] = [];
    const animate = (node: Element, frames: Keyframe[], duration: number, delay = 0) => {
      animations.push(node.animate(frames, { duration, delay, easing: ease, fill: 'backwards' }));
    };
    element.querySelectorAll('[data-allocation-bar]').forEach(bar => animate(bar,
      [{ clipPath: 'inset(0 100% 0 0 round 999px)' }, { clipPath: 'inset(0 0 0 0 round 999px)' }], 800));
    const radial = Array.from({length:61}, (_, frame) => ({
      offset: frame / 60,
      clipPath: `polygon(50% 50%, ${Array.from({length:65}, (_, i) => {
        const angle = -Math.PI / 2 + frame / 60 * Math.PI * 2 * i / 64;
        return `${50 + 75 * Math.cos(angle)}% ${50 + 75 * Math.sin(angle)}%`;
      }).join(',')})`,
    }));
    element.querySelectorAll('[data-allocation-donut]').forEach(donut => animate(donut, radial, 800));
    element.querySelectorAll('[data-allocation-label]').forEach((label, index) => animate(label, [{opacity:0},{opacity:1}], 180, index * 60));
    element.querySelectorAll('[data-allocation-progress]').forEach(progress => animate(progress, [{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}], 500));
    // No forward fill or base opacity: interruption always leaves final geometry.
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => { if (media.matches) animations.forEach(animation => animation.cancel()); };
    media.addEventListener('change', stop);
    return () => media.removeEventListener('change', stop);
  }, [root, ready, identity]);
}
