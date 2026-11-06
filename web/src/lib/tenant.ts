// shortcut: one tenant (Controllabor) until tenant-decoupling; every caller reads it from here,
// so moving to a per-session tenant changes this module and its importers, not 70 private copies.
export const TENANT_ID = 1;
