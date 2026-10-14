#!/usr/bin/env node
// Loads a CSV of investors into investors_achraf and refreshes search, in one command:
//
//   SUPABASE_URL=https://tldvqiqucfmlnkgxaufy.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/import-investors.mjs path/to/batch.csv [--dry-run]
//
// The header row names investors_achraf columns (email, full_name, title, firm, firm_domain, linkedin_url,
// stage, focus, city, country and so on); other columns are ignored by the database. stage and focus take a
// JSON array or values separated by semicolons. Anyone already listed (same email or LinkedIn URL) or removed
// at their own request is skipped. Keep the service role key out of the repo and shell history files.
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const BATCH = 1000;
const ARRAY_COLUMNS = new Set(["stage", "focus"]);

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function toArray(v) {
  const s = v.trim();
  if (s.startsWith("[")) {
    try { return JSON.parse(s); } catch { /* fall through to splitting */ }
  }
  return s.split(";").map((x) => x.trim()).filter(Boolean);
}

function toRecords(rows) {
  const [header, ...body] = rows;
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => {
    const o = {};
    keys.forEach((k, i) => {
      if (!k || k === "id") return;
      const v = (r[i] ?? "").trim();
      if (v === "") return;
      o[k] = ARRAY_COLUMNS.has(k) ? toArray(v) : v;
    });
    return o;
  });
}

async function main() {
  const [path, ...flags] = process.argv.slice(2);
  const dry = flags.includes("--dry-run");
  if (!path) throw new Error("Usage: node scripts/import-investors.mjs <file.csv> [--dry-run]");
  const records = toRecords(parseCsv(await readFile(path, "utf8")));
  const usable = records.filter((r) => r.email || r.linkedin_url);
  console.log(`${records.length} rows read, ${usable.length} with an email or LinkedIn URL.`);
  if (dry) {
    console.log("Dry run. First row as it would be sent:", JSON.stringify(usable[0] ?? null, null, 2));
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false } });

  let added = 0;
  for (let i = 0; i < usable.length; i += BATCH) {
    const { data, error } = await db.rpc("import_investors", { p_rows: usable.slice(i, i + BATCH) });
    if (error) throw new Error(`Batch starting at row ${i + 1}: ${error.message}`);
    added += data.added;
    console.log(`Rows ${i + 1} to ${Math.min(i + BATCH, usable.length)}: ${data.added} added, ${data.skipped} skipped${data.first_id ? ` (ids ${data.first_id} to ${data.last_id})` : ""}`);
  }

  console.log("Refreshing filter counts");
  const { error } = await db.rpc("import_finish");
  if (error) {
    console.error(`Filter counts not refreshed (${error.message}). Run this in the SQL editor: select private.refresh_lead_facets();`);
    process.exitCode = 1;
  }
  console.log(`Done. ${added} investors added.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
