import type { InvestorRow } from "@/lib/data";
import { INVESTOR_TYPES, label, REVENUE, SECTORS, STAGES, VALUES } from "@/lib/taxonomy";

export type ExportFormat = "csv" | "md" | "json";

type Value = string | number | boolean | string[] | null;

const status = (r: InvestorRow) => (r.replied ? "Replied" : r.opened ? "Opened" : r.contacted ? "Contacted" : "Not contacted");

/** One list of fields drives every format. JSON keeps arrays and numbers; CSV and Markdown flatten them. */
const FIELDS: { key: string; header: string; get: (r: InvestorRow) => Value }[] = [
  { key: "name", header: "Name", get: (r) => r.full_name },
  { key: "title", header: "Title", get: (r) => r.title },
  { key: "firm", header: "Firm", get: (r) => r.firm },
  { key: "email", header: "Email", get: (r) => r.email },
  { key: "phone", header: "Phone", get: (r) => r.phone },
  { key: "location", header: "Location", get: (r) => r.location },
  { key: "type", header: "Type", get: (r) => label(INVESTOR_TYPES, r.investor_type) },
  { key: "stages", header: "Stages", get: (r) => r.stages.map((s) => label(STAGES, s)) },
  { key: "sectors", header: "Sectors", get: (r) => r.sectors.map((s) => label(SECTORS, s)) },
  { key: "cheque_min_usd", header: "Cheque min (USD)", get: (r) => r.check_min_usd },
  { key: "cheque_max_usd", header: "Cheque max (USD)", get: (r) => r.check_max_usd },
  { key: "fund_size_usd", header: "Fund size (USD)", get: (r) => r.fund_size_usd },
  { key: "leads_rounds", header: "Leads rounds", get: (r) => r.leads_rounds },
  { key: "minimum_revenue", header: "Minimum revenue", get: (r) => (r.min_revenue_band ? label(REVENUE, r.min_revenue_band) : null) },
  { key: "values", header: "Values", get: (r) => r.values.map((v) => label(VALUES, v)) },
  { key: "focus", header: "Focus", get: (r) => r.focus_note },
  { key: "thesis", header: "Thesis", get: (r) => r.thesis },
  { key: "portfolio", header: "Portfolio", get: (r) => r.portfolio },
  { key: "website", header: "Website", get: (r) => r.website_url },
  { key: "fit_score", header: "Fit score", get: (r) => r.score },
  { key: "saved", header: "Saved", get: (r) => r.saved },
  { key: "status", header: "Status", get: status },
];

function flat(v: Value): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function toCsv(rows: InvestorRow[]) {
  const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [FIELDS.map((f) => f.header), ...rows.map((r) => FIELDS.map((f) => flat(f.get(r))))].map((l) => l.map(cell).join(","));
  // BOM so Excel opens UTF-8 correctly.
  return "﻿" + lines.join("\r\n");
}

function toMarkdown(rows: InvestorRow[]) {
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const head = `| ${FIELDS.map((f) => f.header).join(" | ")} |`;
  const rule = `| ${FIELDS.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${FIELDS.map((f) => cell(flat(f.get(r)))).join(" | ")} |`);
  return [`# Centrale investors`, "", `${rows.length} investors, exported ${new Date().toISOString().slice(0, 10)}.`, "", head, rule, ...body, ""].join("\n");
}

function toJson(rows: InvestorRow[]) {
  return JSON.stringify(
    rows.map((r) => Object.fromEntries(FIELDS.map((f) => [f.key, f.get(r)]))),
    null,
    2,
  );
}

const FORMATS: Record<ExportFormat, { mime: string; build: (rows: InvestorRow[]) => string }> = {
  csv: { mime: "text/csv;charset=utf-8", build: toCsv },
  md: { mime: "text/markdown;charset=utf-8", build: toMarkdown },
  json: { mime: "application/json;charset=utf-8", build: toJson },
};

/** Downloads the given investors, in the order shown, as CSV, Markdown or JSON. */
export function downloadInvestors(rows: InvestorRow[], format: ExportFormat) {
  const { mime, build } = FORMATS[format];
  const blob = new Blob([build(rows)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `centrale-investors-${new Date().toISOString().slice(0, 10)}.${format}`,
  });
  a.click();
  URL.revokeObjectURL(url);
}
