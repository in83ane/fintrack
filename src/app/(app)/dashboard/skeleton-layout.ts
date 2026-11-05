// Shared by the real page and its loading shell.
export const layout = {
  "root": "dashboard-page relative isolate min-h-[calc(100dvh-var(--topbar-h))] overflow-hidden py-4 sm:py-8 pb-24",
  "container": "dashboard-sections app-page-container relative z-10",
  "kpis": "dashboard-stats grid grid-cols-2 sm:grid-cols-4 gap-3",
  "hero": "dashboard-net-worth bg-background rounded-2xl sm:rounded-3xl p-4 sm:p-6 relative overflow-hidden border border-border",
  "bottom": "grid grid-cols-1 lg:grid-cols-12 gap-4"
} as const;
