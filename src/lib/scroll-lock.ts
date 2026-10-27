/** All modal families share one lock on the actual document scrolling root. */
let locks = 0;
let restore: (() => void) | undefined;
export function lockDocumentScroll() {
  if (locks++ === 0) {
    const root = (document.scrollingElement || document.documentElement) as HTMLElement;
    const overflow = root.style.getPropertyValue('overflow');
    const priority = root.style.getPropertyPriority('overflow');
    root.style.setProperty('overflow', 'hidden');
    restore = () => {
      if (overflow) root.style.setProperty('overflow', overflow, priority);
      else root.style.removeProperty('overflow');
    };
  }
  let released = false;
  return () => { if (released) return; released = true; if (--locks === 0) { restore?.(); restore = undefined; } };
}

/** Stable ref callback: focus only when a field mounts, never on each render. */
export function focusWithoutScroll(node: HTMLElement | null) { node?.focus({ preventScroll: true }); }
