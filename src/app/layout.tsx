import type { Metadata, Viewport } from "next";
import { Anuphan } from "next/font/google";
import "../index.css";
import { AppProvider } from "@/src/context/AppContext";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";
import { InterfaceProvider } from "@/src/components/InterfaceProvider";

const anuphan = Anuphan({ subsets: ["latin", "thai"], variable: "--font-anuphan", display: "swap" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The app is responsive at the device width.  Keep browser zoom available
  // for accessibility instead of forcing users to compensate for a layout.
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  title: "FinTrack | Portfolio Management",
  description: "Unified Investment Dashboard with real-time tracking and insights.",
  icons: "/fintrack-icon.svg",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FinTrack",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${anuphan.variable}`} suppressHydrationWarning>
      <head>
        <link rel="icon" href="/fintrack-icon.svg" type="image/svg+xml" />
      </head>
      <body suppressHydrationWarning className={`${anuphan.className} bg-background text-foreground min-h-screen min-w-0 antialiased`}>
        <AppProvider>
          <InterfaceProvider>{children}</InterfaceProvider>
        </AppProvider>
      </body>
    </html>
  );
}
