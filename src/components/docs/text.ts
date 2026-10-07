import { isValidElement } from "react";

// Props that hold styling or routing, not words a founder would search for.
const SKIP = new Set(["className", "href", "tone", "id", "key", "ref", "dateTime"]);

/** Every word in a piece of docs content (elements, arrays, plain objects), for search. */
export function textOf(node: unknown): string {
  if (node == null || typeof node === "boolean" || typeof node === "function") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  const props = isValidElement(node) ? (node.props as Record<string, unknown>) : typeof node === "object" ? (node as Record<string, unknown>) : null;
  if (!props) return "";
  return Object.entries(props)
    .filter(([k]) => !SKIP.has(k))
    .map(([, v]) => textOf(v))
    .join(" ");
}

/** Lowercased, single-spaced text for word matching. */
export function searchText(...parts: unknown[]) {
  return parts.map(textOf).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
}
