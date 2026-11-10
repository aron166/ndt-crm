"use client";

import NextLink from "next/link";
import { Theme } from "@astryxdesign/core/theme";
import { LinkProvider } from "@astryxdesign/core/Link";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import huHU from "@astryxdesign/core/locales/hu-HU.generated.js";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";

// Astryx components are client components; this is the one client boundary
// they need. Light only for now (Kai, 2026-11-10): the dark palette comes back
// as its own designed theme, not as an inversion.
export function AstryxProviders({ children }: { children: React.ReactNode }) {
  return (
    <InternationalizationProvider locale="hu-HU" messages={{ "hu-HU": huHU }}>
      <Theme theme={neutralTheme} mode="light">
        <LinkProvider component={NextLink}>{children}</LinkProvider>
      </Theme>
    </InternationalizationProvider>
  );
}
