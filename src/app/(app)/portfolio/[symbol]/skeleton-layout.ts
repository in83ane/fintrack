// Shared by the real page and its loading shell.
export const layout = {
  "root": "p-6 lg:p-8 max-w-[1600px] mx-auto h-[calc(100vh-var(--topbar-h))] flex flex-col",
  "grid": "flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0",
  "metrics": "grid grid-cols-2 md:grid-cols-4 gap-4"
} as const;
