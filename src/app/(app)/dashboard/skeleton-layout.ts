// Shared by the real page and its loading shell.
export const layout = {
  "root": "relative isolate min-h-[calc(100dvh-var(--topbar-h))] overflow-hidden py-7 sm:py-8 pb-24",
  "container": "app-page-container relative z-10 space-y-5",
  "kpis": "grid grid-cols-2 sm:grid-cols-4 gap-3",
  "hero": "bg-surface/50 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-4 sm:p-6 relative overflow-hidden border border-border shadow-xl",
  "bottom": "grid grid-cols-1 lg:grid-cols-12 gap-4"
} as const;
