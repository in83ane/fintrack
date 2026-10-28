// Shared by the real page and its loading shell.
export const layout = {
  "root": "relative isolate min-h-[calc(100dvh-var(--topbar-h))] w-full pt-8 pb-24",
  "container": "app-page-container space-y-7",
  "content": "grid grid-cols-1 gap-6"
} as const;
