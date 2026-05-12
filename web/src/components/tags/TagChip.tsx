import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagChipProps {
  name: string;
  color: string;
  onRemove?: () => void;
  size?: "sm" | "default";
}

function textColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1e293b" : "#ffffff";
}

export function TagChip({ name, color, onRemove, size = "default" }: TagChipProps) {
  const fg = textColor(color);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
      )}
      style={{ backgroundColor: color, color: fg }}
    >
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
