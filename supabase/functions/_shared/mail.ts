import { SUPABASE_URL } from "./core.ts";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text to simple HTML paragraphs, with an open-tracking pixel appended. */
export function toTrackedHtml(text: string, outreachId: string) {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const pixel = `<img src="${SUPABASE_URL}/functions/v1/track-open?m=${outreachId}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`;
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#141414">${paragraphs}${pixel}</div>`;
}

export { escapeHtml };
