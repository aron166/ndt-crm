import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatHUF(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("hu-HU", {
    style: "currency",
    currency: "HUF",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function fullName(
  firstName: string | null,
  lastName: string | null
): string {
  return [firstName, lastName].filter(Boolean).join(" ") || "—";
}

export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const diffMs = Date.now() - new Date(date).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0)  return "ma";
  if (days === 1) return "tegnap";
  if (days < 7)   return `${days} napja`;
  if (days < 30)  return `${Math.floor(days / 7)} hete`;
  if (days < 365) return `${Math.floor(days / 30)} hónapja`;
  const years = Math.floor(days / 365);
  return `${years} éve`;
}

export function contactFreshness(date: Date | string | null | undefined): string {
  if (!date) return "coral";
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days < 30)  return "mint";
  if (days < 90)  return "mute";
  return "amber";
}
