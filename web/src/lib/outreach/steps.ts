/**
 * How many touches a cold-email sequence has. Its own leaf module on purpose:
 * `lib/outreach/drafts.ts` imports zod, and pulling this constant from there
 * into `lib/content/labels.ts` dragged zod into the client bundle of every
 * /marketing route - 225 KB over budget on three routes (CI, 2026-09-18).
 * Nothing may be added to this file that imports anything.
 */
export const MAX_STEP = 4;
