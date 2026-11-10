// The one place user-pickable data colours (stage, status and tag swatches) are defined.
// design-allow: user data colours chosen from this list are stored in the DB, not themed
export const DEFAULT_DATA_COLOR = "#6366f1"; // design-allow: user data colour, default swatch
export const DEFAULT_STAGE_COLORS = [
  "#64748b", DEFAULT_DATA_COLOR, "#8b5cf6", "#3b82f6", // design-allow: user data colour swatches
  "#06b6d4", "#22c55e", "#f59e0b", "#f97316", // design-allow: user data colour swatches
  "#ef4444", "#f43f5e", // design-allow: user data colour swatches
] as const;
