import { clsx, type ClassValue } from "clsx";

export const BRAND = "Centrale";
export const TAGLINE = "Bulk VC applications. One platform.";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function money(n: number | null | undefined) {
  if (n == null) return "";
  if (n >= 1_000_000_000) return `$${+(n / 1_000_000_000).toFixed(1)}bn`;
  if (n >= 1_000_000) return `$${+(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

export function chequeRange(min: number | null, max: number | null) {
  if (min == null && max == null) return "";
  if (min != null && max != null) return `${money(min)} to ${money(max)}`;
  return money(min ?? max);
}

export function initials(name: string | null | undefined) {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function faviconFor(domain: string | null | undefined) {
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null;
}

export const DECK_EXTENSIONS = [".pdf", ".pptx", ".ppt", ".key", ".docx"];
export const DECK_MAX_BYTES = 50 * 1024 * 1024;
