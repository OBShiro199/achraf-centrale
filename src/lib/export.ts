import type { DirectoryRow } from "@/lib/directory";

export type ExportFormat = "csv" | "md" | "json";

type Value = string | number | boolean | string[] | null;
type Row = DirectoryRow;

/** One list of fields drives every format. JSON keeps arrays and numbers; CSV and Markdown flatten them. */
const FIELDS: { key: string; header: string; get: (r: Row) => Value }[] = [
  { key: "name", header: "Name", get: (r) => r.full_name },
  { key: "first_name", header: "First name", get: (r) => r.first_name },
  { key: "last_name", header: "Last name", get: (r) => r.last_name },
  { key: "title", header: "Title", get: (r) => r.title },
  { key: "firm", header: "Firm", get: (r) => r.firm },
  { key: "firm_website", header: "Firm website", get: (r) => r.firm_website },
  { key: "firm_domain", header: "Firm domain", get: (r) => r.firm_domain },
  { key: "industry", header: "Industry", get: (r) => r.industry },
  // "11-50" on its own opens in Excel as a date, so it carries its unit.
  { key: "firm_size", header: "Firm size", get: (r) => (r.size ? `${r.size} people` : null) },
  { key: "founded", header: "Founded", get: (r) => r.founded },
  { key: "city", header: "City", get: (r) => r.city },
  { key: "state", header: "State", get: (r) => r.state },
  { key: "country", header: "Country", get: (r) => r.country },
  { key: "stages", header: "Stages", get: (r) => r.stages },
  { key: "sector_focus", header: "Sector focus", get: (r) => r.focus },
  { key: "email", header: "Email", get: (r) => r.email },
  { key: "phone", header: "Phone", get: (r) => r.phone },
  { key: "linkedin", header: "LinkedIn", get: (r) => r.linkedin_url },
  { key: "fit_score", header: "Fit score", get: (r) => r.score },
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
