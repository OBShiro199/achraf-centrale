import { formatFunding, reasonLabel, type DirectoryRow } from "@/lib/directory";
import { INVESTOR_TYPES, label, REGIONS, ROLES, SECTORS, STAGES, VALUES } from "@/lib/taxonomy";

export type ExportFormat = "csv" | "md" | "json";

type Value = string | number | boolean | string[] | null;
type Row = DirectoryRow;

const status = (r: Row) => (r.replied ? "Replied" : r.opened ? "Opened" : r.contacted ? "Contacted" : r.queued ? "Queued" : "Not contacted");

/** One list of fields drives every format. JSON keeps arrays and numbers; CSV and Markdown flatten them. */
const FIELDS: { key: string; header: string; get: (r: Row) => Value }[] = [
  { key: "name", header: "Name", get: (r) => r.full_name },
  { key: "first_name", header: "First name", get: (r) => r.first_name },
  { key: "last_name", header: "Last name", get: (r) => r.last_name },
  { key: "title", header: "Title", get: (r) => r.title },
  { key: "role", header: "Role", get: (r) => label(ROLES, r.role) },
  { key: "firm", header: "Firm", get: (r) => r.firm },
  { key: "firm_domain", header: "Firm domain", get: (r) => r.firm_domain },
  { key: "email", header: "Email", get: (r) => r.email },
  { key: "mobile", header: "Mobile", get: (r) => r.mobile },
  { key: "direct_phone", header: "Direct line", get: (r) => r.direct_phone },
  { key: "do_not_call", header: "Do not call", get: (r) => r.do_not_call },
  { key: "linkedin", header: "LinkedIn", get: (r) => r.linkedin_url },
  { key: "x", header: "X", get: (r) => r.twitter_url },
  { key: "website", header: "Website", get: (r) => r.website_url },
  { key: "city", header: "City", get: (r) => r.city },
  { key: "state", header: "State", get: (r) => r.state },
  { key: "country", header: "Country", get: (r) => r.country },
  { key: "region", header: "Region", get: (r) => (r.region ? label(REGIONS, r.region) : null) },
  { key: "type", header: "Type", get: (r) => label(INVESTOR_TYPES, r.investor_type) },
  { key: "stages", header: "Stages", get: (r) => r.stages.map((s) => label(STAGES, s)) },
  { key: "sectors", header: "Sectors", get: (r) => r.sectors.map((s) => label(SECTORS, s)) },
  { key: "values", header: "Values", get: (r) => r.values.map((v) => label(VALUES, v)) },
  { key: "firm_size", header: "Firm size", get: (r) => r.firm_employees },
  { key: "firm_raised_usd", header: "Firm raised (USD)", get: (r) => r.firm_funding },
  { key: "firm_raised", header: "Firm raised", get: (r) => formatFunding(r.firm_funding) },
  { key: "firm_founded", header: "Firm founded", get: (r) => r.firm_founded },
  { key: "fit_score", header: "Fit score", get: (r) => r.score },
  { key: "fit_reasons", header: "Fit reasons", get: (r) => r.reasons.map(reasonLabel) },
  { key: "claude_pick", header: "Claude pick", get: (r) => r.pick_why },
  { key: "saved", header: "Saved", get: (r) => r.saved },
  { key: "status", header: "Status", get: status },
];

function flat(v: Value): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function toCsv(rows: Row[]) {
  const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [FIELDS.map((f) => f.header), ...rows.map((r) => FIELDS.map((f) => flat(f.get(r))))].map((l) => l.map(cell).join(","));
  // BOM so Excel opens UTF-8 correctly.
  return "﻿" + lines.join("\r\n");
}

function toMarkdown(rows: Row[]) {
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const head = `| ${FIELDS.map((f) => f.header).join(" | ")} |`;
  const rule = `| ${FIELDS.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${FIELDS.map((f) => cell(flat(f.get(r)))).join(" | ")} |`);
  return [`# Centrale investors`, "", `${rows.length} investors, exported ${new Date().toISOString().slice(0, 10)}.`, "", head, rule, ...body, ""].join("\n");
}

function toJson(rows: Row[]) {
  return JSON.stringify(
    rows.map((r) => Object.fromEntries(FIELDS.map((f) => [f.key, f.get(r)]))),
    null,
    2,
  );
}

const FORMATS: Record<ExportFormat, { mime: string; build: (rows: Row[]) => string }> = {
  csv: { mime: "text/csv;charset=utf-8", build: toCsv },
  md: { mime: "text/markdown;charset=utf-8", build: toMarkdown },
  json: { mime: "application/json;charset=utf-8", build: toJson },
};

/** Downloads the given investors, in the order shown, as CSV, Markdown or JSON. */
export function downloadInvestors(rows: Row[], format: ExportFormat) {
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
