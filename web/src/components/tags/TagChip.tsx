import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagChipProps {
  name: string;
  color: string;
  onRemove?: () => void;
  size?: "sm" | "default";
}

export function TagChip({ name, color, onRemove, size = "default" }: TagChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      )}
      style={{ backgroundColor: "var(--ui-surface-muted)", color: "var(--ui-text)" }}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full opacity-70 hover:opacity-100 transition-opacity"
          aria-label={`Remove tag ${name}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
