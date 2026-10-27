export type ThemeOrigin = { x: number; y: number };

let active: ViewTransition | undefined;
let reveal: Animation | undefined;
let revision = 0;

/** Reveal the new theme from the control, keeping a real snapshot of the old theme. */
export function transitionTheme(update: () => void, origin?: ThemeOrigin) {
  const current = ++revision;
  active?.skipTransition();
  reveal?.cancel();
  active = undefined;
  reveal = undefined;
  const root = document.documentElement;
  root.classList.remove('theme-transition');
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!document.startViewTransition || preference.matches) {
    update();
    return;
  }

  const x = Math.max(0, Math.min(innerWidth, origin?.x ?? innerWidth - 32));
  const y = Math.max(0, Math.min(innerHeight, origin?.y ?? 32));
  const radius = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)));
  root.style.setProperty('--vx', `${x}px`);
  root.style.setProperty('--vy', `${y}px`);
  const multiplier = Number(getComputedStyle(root).getPropertyValue('--m')) || 1;
  let applied = false;
  const apply = () => {
    if (current !== revision || applied) return;
    applied = true;
    update();
  };
  root.classList.add('theme-transition');
  try {
    const transition = document.startViewTransition(apply);
    active = transition;
    const cancel = () => { transition.skipTransition(); if (current === revision) reveal?.cancel(); };
    preference.addEventListener('change', cancel);
    void transition.ready.then(() => {
      if (current !== revision) return;
      reveal = root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 600 * multiplier, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(apply);
    void transition.finished.catch(apply).finally(() => {
      preference.removeEventListener('change', cancel);
      if (current !== revision) return;
      root.classList.remove('theme-transition');
      reveal?.cancel();
      reveal = undefined;
      active = undefined;
    });
  } catch {
    root.classList.remove('theme-transition');
    apply();
  }
}
