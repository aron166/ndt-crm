import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Helm CRM",
  description: "Controllabor Kft. — Helm CRM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="hu"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        {children}
        {/* Field RUM (INP/LCP/CLS + element attribution). The dashboard was being
            read for INP numbers this app was never reporting — nothing was
            instrumented before this. Needs Speed Insights enabled on the Vercel
            project (Áron-only). */}
        <SpeedInsights />
      </body>
    </html>
  );
}
