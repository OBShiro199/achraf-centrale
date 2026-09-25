import type { InvestorRow } from "@/lib/data";
import { INVESTOR_TYPES, label, REVENUE, SECTORS, STAGES, VALUES } from "@/lib/taxonomy";

const COLUMNS: [string, (r: InvestorRow) => string | number | null][] = [
  ["Name", (r) => r.full_name],
  ["Title", (r) => r.title],
  ["Firm", (r) => r.firm],
  ["Email", (r) => r.email],
  ["Phone", (r) => r.phone],
  ["Location", (r) => r.location],
  ["Type", (r) => label(INVESTOR_TYPES, r.investor_type)],
  ["Stages", (r) => r.stages.map((s) => label(STAGES, s)).join("; ")],
  ["Sectors", (r) => r.sectors.map((s) => label(SECTORS, s)).join("; ")],
  ["Cheque min (USD)", (r) => r.check_min_usd],
  ["Cheque max (USD)", (r) => r.check_max_usd],
  ["Fund size (USD)", (r) => r.fund_size_usd],
  ["Leads rounds", (r) => (r.leads_rounds ? "Yes" : "No")],
  ["Minimum revenue", (r) => label(REVENUE, r.min_revenue_band)],
  ["Values", (r) => r.values.map((v) => label(VALUES, v)).join("; ")],
  ["Focus", (r) => r.focus_note],
  ["Thesis", (r) => r.thesis],
  ["Portfolio", (r) => r.portfolio.join("; ")],
  ["Website", (r) => r.website_url],
  ["Fit score", (r) => r.score],
  ["Saved", (r) => (r.saved ? "Yes" : "No")],
  ["Status", (r) => (r.replied ? "Replied" : r.opened ? "Opened" : r.contacted ? "Contacted" : "Not contacted")],
];

function cell(v: string | number | null) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Downloads the given investors as a CSV, in the order shown. */
export function downloadInvestorsCsv(rows: InvestorRow[], filename = "centrale-investors.csv") {
  const lines = [COLUMNS.map(([h]) => h).join(","), ...rows.map((r) => COLUMNS.map(([, get]) => cell(get(r))).join(","))];
  // BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
