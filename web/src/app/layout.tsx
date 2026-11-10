import type { Metadata, Viewport } from "next";
import { Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Insights } from "@/components/Insights";

const figtree = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// viewport-fit=cover so env(safe-area-inset-*) is non-zero on notched phones
// (the review page's fixed action bar pads itself with it).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Helm CRM",
  description: "Controllabor Kft.: Helm CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="hu"
      // Light only for now (Kai, 2026-11-10, Astryx redesign). users.settings.theme
      // is kept but not read until the dark theme is designed again.
      data-theme="light"
      className={`${figtree.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        {children}
        {/* Field RUM — see components/Insights.tsx. Needs Speed Insights enabled
            on the Vercel project (Áron) before it reports anything. */}
        <Insights />
      </body>
    </html>
  );
}
