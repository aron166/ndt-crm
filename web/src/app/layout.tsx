import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Insights } from "@/components/Insights";
import { getTheme } from "@/lib/theme";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-rendered into the first byte of the document: the light palette is
  // an attribute override in globals.css, so there is no window in which the
  // wrong theme is painted and nothing to re-run on the client.
  const theme = await getTheme();

  return (
    <html
      lang="hu"
      data-theme={theme}
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
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
