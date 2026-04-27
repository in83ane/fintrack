import type { Metadata } from "next";
import { Inter, Playfair_Display, Prompt } from "next/font/google";
import "../index.css";
import { AppProvider } from "@/src/context/AppContext";
import { ErrorBoundary } from "@/src/components/ErrorBoundary";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-serif" });
const prompt = Prompt({ subsets: ["latin", "thai"], weight: ["300", "400", "500", "600", "700", "800", "900"], variable: "--font-prompt" });

export const metadata: Metadata = {
  title: "FinTrack | Portfolio Management",
  description: "Unified Investment Dashboard with real-time tracking and insights.",
  icons: "/fintrack-icon.svg",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${playfair.variable} ${prompt.variable}`}>
      <head>
        <link rel="icon" href="/fintrack-icon.svg" type="image/svg+xml" />
      </head>
      <body className={`${prompt.className} bg-[#131313] text-[#e5e2e1] min-h-screen antialiased`}>
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
