import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Baseline (2026-09-17, NATE-CI-1): these components predate the
  // react-hooks/set-state-in-effect, react-hooks/purity and
  // react/no-unescaped-entities rules and are not being rewritten as part of
  // adding the eslint CI gate. Downgraded to "warn" here ONLY for the exact
  // files/rules below so `eslint --max-warnings 9999` still fails the build
  // on any NEW error. Do not add files to this list — fix new code instead.
  {
    files: [
      "src/app/(app)/companies/CompaniesSearch.tsx",
      "src/app/(app)/enrichment/EnrichmentClient.tsx",
      "src/app/(app)/leads/[[]id[]]/LeadDetailClient.tsx",
      "src/app/(app)/persons/[[]id[]]/page.tsx",
      "src/app/(app)/quotes/NewQuoteDialog.tsx",
      "src/app/(app)/quotes/QuotesClient.tsx",
      "src/app/drive/DriveScreen.tsx",
      "src/components/CommandPalette.tsx",
      "src/components/DeleteCardDialog.tsx",
      "src/components/LeaveCompanyModal.tsx",
      "src/components/layout/AppShell.tsx",
      "src/components/layout/Topbar.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
]);

export default eslintConfig;
