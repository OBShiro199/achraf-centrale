// Pitch deck: the slide schema Claude fills, and a PDF renderer in the Centrale sketchbook style.
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
// The bundled ESM build: the bin/ build uses extensionless imports Deno cannot resolve.
import roughBundle from "npm:roughjs@4.6.6/bundled/rough.esm.js";
import type { RoughGenerator } from "npm:roughjs@4.6.6/bin/generator.d.ts";
const rough = roughBundle as unknown as { generator(): RoughGenerator };

export const SLIDE_TYPES = [
  "cover",
  "problem",
  "solution",
  "how_it_works",
  "why_now",
  "traction",
  "business_model",
  "competition",
  "team",
  "use_of_funds",
  "ask",
] as const;
export type SlideType = (typeof SLIDE_TYPES)[number];

export interface Chart {
  kind: "bar" | "line" | "none";
  title: string;
  unit: string;
  labels: string[];
  values: number[];
}

export interface Slide {
  type: SlideType;
  kicker: string;
  headline: string;
  body: string;
  bullets: string[];
  stat_value: string;
  stat_label: string;
  chart: Chart;
  rows: { label: string; detail: string }[];
}

export interface Deck {
  company: string;
  tagline: string;
  slides: Slide[];
}

export const DECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["company", "tagline", "slides"],
  properties: {
    company: { type: "string" },
    tagline: { type: "string", description: "Under 10 words. What the company does, plainly." },
    slides: {
      type: "array",
      description: `Exactly ${SLIDE_TYPES.length} slides, one of each type, in this order: ${SLIDE_TYPES.join(", ")}.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "kicker", "headline", "body", "bullets", "stat_value", "stat_label", "chart", "rows"],
        properties: {
          type: { type: "string", enum: [...SLIDE_TYPES] },
          kicker: { type: "string", description: "2 to 4 word label above the headline, e.g. 'The problem'." },
          headline: { type: "string", description: "One claim, under 12 words." },
          body: { type: "string", description: "One or two sentences, under 40 words. Empty string if bullets say it." },
          bullets: { type: "array", items: { type: "string" }, description: "0 to 4 bullets, each under 14 words." },
          stat_value: { type: "string", description: "One headline number from the founder's answers, e.g. '$1.5m' or '40 customers'. Empty if none." },
          stat_label: { type: "string", description: "What the stat means, under 6 words. Empty if no stat." },
          chart: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "title", "unit", "labels", "values"],
            properties: {
              kind: { type: "string", enum: ["bar", "line", "none"] },
              title: { type: "string" },
              unit: { type: "string", description: "Prefix or suffix such as '$k' or '%'." },
              labels: { type: "array", items: { type: "string" } },
              values: { type: "array", items: { type: "number" } },
            },
          },
          rows: {
            type: "array",
            description: "Team members or competitors: label plus one line of detail. Empty for other slides.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "detail"],
              properties: { label: { type: "string" }, detail: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

// ------------------------------------------------------------------------------------------
// Rendering

const W = 960;
const H = 540;
const hex = (h: string) => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const C = {
  paper: hex("#f6f1e8"),
  panel: hex("#fffdf9"),
  ink: hex("#391c25"),
  display: hex("#2c141c"),
  body: hex("#3a2a2e"),
  muted: hex("#6f5f62"),
  label: hex("#9a8d88"),
  line: hex("#e7dfd2"),
  grid: hex("#efe7da"),
  gridMajor: hex("#e6dccd"),
  accent: hex("#d94a38"),
};
const ACCENT = "#d94a38";
const INK = "#391c25";
const GRAPHITE = "#6e6360";

interface Fonts {
  display: PDFFont;
  body: PDFFont;
  medium: PDFFont;
  hand: PDFFont;
  custom: boolean;
}

async function loadFonts(pdf: PDFDocument, fontBase: string | null): Promise<Fonts> {
  if (fontBase) {
    try {
      pdf.registerFontkit(fontkit);
      const get = async (name: string) => {
        const res = await fetch(`${fontBase}/fonts/${name}.ttf`);
        if (!res.ok) throw new Error(`font ${name} ${res.status}`);
        return pdf.embedFont(new Uint8Array(await res.arrayBuffer()), { subset: true });
      };
      const [display, body, medium, hand] = await Promise.all([
        get("Outfit-SemiBold"),
        get("Geist-Regular"),
        get("Geist-Medium"),
        get("Caveat-SemiBold"),
      ]);
      return { display, body, medium, hand, custom: true };
    } catch (err) {
      console.warn("custom fonts unavailable, using Helvetica", err);
    }
  }
  const [display, body, medium] = await Promise.all([
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  return { display, body, medium, hand: body, custom: false };
}

/** Standard fonts only cover WinAnsi; strip anything else so drawing never throws. */
function safe(text: string, fonts: Fonts) {
  const cleaned = text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, ", ");
  return fonts.custom ? cleaned : cleaned.replace(/[^\x20-\x7E£€·]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Draws wrapped text from a top edge (page coordinates measured from the top). Returns the new top. */
function text(
  page: PDFPage,
  fonts: Fonts,
  str: string,
  o: { x: number; top: number; size: number; font: PDFFont; color: ReturnType<typeof rgb>; maxWidth: number; lineHeight?: number; maxLines?: number },
) {
  const lh = o.lineHeight ?? 1.3;
  const lines = wrap(safe(str, fonts), o.font, o.size, o.maxWidth).slice(0, o.maxLines ?? 99);
  lines.forEach((line, i) => {
    page.drawText(line, { x: o.x, y: H - o.top - o.size * (0.85 + i * lh), size: o.size, font: o.font, color: o.color });
  });
  return o.top + lines.length * o.size * lh;
}

function background(page: PDFPage, graph: boolean) {
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.paper });
  if (!graph) return;
  for (let x = 0; x <= W; x += 24) {
    page.drawLine({ start: { x, y: 0 }, end: { x, y: H }, thickness: 0.5, color: x % 120 === 0 ? C.gridMajor : C.grid });
  }
  for (let y = 0; y <= H; y += 24) {
    page.drawLine({ start: { x: 0, y }, end: { x: W, y }, thickness: 0.5, color: y % 120 === 0 ? C.gridMajor : C.grid });
  }
}

/** Draws roughjs drawables (SVG coordinates, y down from the page top). */
function strokes(page: PDFPage, drawables: unknown[]) {
  const gen = rough.generator();
  for (const d of drawables) {
    // deno-lint-ignore no-explicit-any
    for (const p of gen.toPaths(d as any)) {
      const filled = p.fill && p.fill !== "none";
      page.drawSvgPath(p.d, {
        x: 0,
        y: H,
        ...(filled ? { color: hex(p.fill!), borderWidth: 0 } : { borderColor: hex(p.stroke), borderWidth: p.strokeWidth }),
      });
    }
  }
}

function brandTile(page: PDFPage, x: number, top: number, size = 7) {
  page.drawRectangle({ x, y: H - top - size, width: size, height: size, color: C.accent });
}

function footer(page: PDFPage, fonts: Fonts, company: string, n: number, total: number) {
  page.drawLine({ start: { x: 48, y: 40 }, end: { x: W - 48, y: 40 }, thickness: 0.6, color: C.line });
  page.drawText(safe(company, fonts), { x: 48, y: 24, size: 9, font: fonts.medium, color: C.muted });
  const right = `${n} / ${total}`;
  page.drawText(right, { x: W - 48 - fonts.body.widthOfTextAtSize(right, 9), y: 24, size: 9, font: fonts.body, color: C.label });
}

/** "$k" -> "$120k", "%" -> "40%", "customers" -> "40 customers". */
function formatValue(v: number, unit: string) {
  const u = unit.trim();
  const m = u.match(/^([$£€])(.*)$/);
  if (m) return `${m[1]}${v}${m[2]}`;
  if (u === "%" || u === "k" || u === "m") return `${v}${u}`;
  return u ? `${v} ${u}` : `${v}`;
}

function chart(page: PDFPage, fonts: Fonts, c: Chart, box: { x: number; top: number; w: number; h: number }, seed: number) {
  const n = Math.min(c.labels.length, c.values.length);
  if (c.kind === "none" || n === 0) return;
  const values = c.values.slice(0, n);
  const max = Math.max(...values, 1);
  const g = rough.generator();
  const x0 = box.x + 8;
  const y0 = box.top + box.h - 26; // baseline
  const plotH = box.h - 70;
  const plotW = box.w - 16;
  const opts = { seed, roughness: 0.9, stroke: INK, strokeWidth: 1.2 };

  text(page, fonts, c.title, { x: box.x, top: box.top, size: 12, font: fonts.medium, color: C.muted, maxWidth: box.w });

  const drawables: unknown[] = [g.line(x0, y0, x0 + plotW, y0, opts)];
  const step = plotW / n;
  const fmt = (v: number) => formatValue(v, c.unit);

  if (c.kind === "bar") {
    values.forEach((v, i) => {
      const bh = Math.max(2, (v / max) * plotH);
      const bw = Math.min(46, step * 0.56);
      const bx = x0 + step * i + (step - bw) / 2;
      const last = i === n - 1;
      drawables.push(
        g.rectangle(bx, y0 - bh, bw, bh, {
          seed: seed + i + 1,
          roughness: 0.9,
          stroke: last ? ACCENT : GRAPHITE,
          strokeWidth: 1,
          fill: last ? ACCENT : "#9a8d88",
          fillStyle: "hachure",
          hachureGap: 4,
          fillWeight: 0.8,
        }),
      );
    });
  } else {
    const pts = values.map((v, i) => [x0 + step * i + step / 2, y0 - (v / max) * plotH] as [number, number]);
    drawables.push(g.linearPath(pts, { seed: seed + 3, roughness: 0.8, stroke: ACCENT, strokeWidth: 2 }));
    pts.forEach(([px, py], i) => drawables.push(g.circle(px, py, 7, { seed: seed + 10 + i, stroke: INK, strokeWidth: 1, fill: INK, fillStyle: "solid" })));
  }
  strokes(page, drawables);

  values.forEach((v, i) => {
    const cx = x0 + step * i + step / 2;
    const lab = safe(c.labels[i] ?? "", fonts).slice(0, 10);
    page.drawText(lab, { x: cx - fonts.body.widthOfTextAtSize(lab, 9) / 2, y: H - y0 - 16, size: 9, font: fonts.body, color: C.label });
    const vy = c.kind === "bar" ? y0 - Math.max(2, (v / max) * plotH) - 14 : y0 - (v / max) * plotH - 16;
    const val = fmt(v);
    page.drawText(val, { x: cx - fonts.medium.widthOfTextAtSize(val, 9.5) / 2, y: H - vy, size: 9.5, font: fonts.medium, color: C.ink });
  });
}

function rowsTable(page: PDFPage, fonts: Fonts, rows: Slide["rows"], box: { x: number; top: number; w: number }) {
  let top = box.top;
  rows.slice(0, 5).forEach((r) => {
    page.drawLine({ start: { x: box.x, y: H - top }, end: { x: box.x + box.w, y: H - top }, thickness: 0.6, color: C.line });
    const labelBottom = text(page, fonts, r.label, { x: box.x, top: top + 16, size: 18, font: fonts.display, color: C.display, maxWidth: box.w * 0.3 });
    const detailBottom = text(page, fonts, r.detail, { x: box.x + box.w * 0.34, top: top + 18, size: 15, font: fonts.body, color: C.body, maxWidth: box.w * 0.66, maxLines: 2 });
    top = Math.max(labelBottom, detailBottom) + 16;
  });
  page.drawLine({ start: { x: box.x, y: H - top }, end: { x: box.x + box.w, y: H - top }, thickness: 0.6, color: C.line });
}

function bullets(page: PDFPage, fonts: Fonts, items: string[], box: { x: number; top: number; w: number }) {
  let top = box.top;
  items.slice(0, 4).forEach((b) => {
    brandTile(page, box.x, top + 6, 6);
    top = text(page, fonts, b, { x: box.x + 18, top, size: 15, font: fonts.body, color: C.body, maxWidth: box.w - 18 }) + 10;
  });
  return top;
}

export async function renderDeckPdf(deck: Deck, opts: { fontBase: string | null; website?: string | null; email?: string | null }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${deck.company} pitch deck`);
  pdf.setAuthor(deck.company);
  pdf.setCreator("Centrale");
  const fonts = await loadFonts(pdf, opts.fontBase);
  const total = deck.slides.length;
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  deck.slides.forEach((s, i) => {
    const page = pdf.addPage([W, H]);
    const bookend = s.type === "cover" || s.type === "ask";
    background(page, bookend);

    if (s.type === "cover") {
      brandTile(page, 64, 96, 12);
      text(page, fonts, deck.company, { x: 64, top: 150, size: 64, font: fonts.display, color: C.display, maxWidth: 780, lineHeight: 1.05 });
      const t = text(page, fonts, deck.tagline, { x: 64, top: 240, size: 24, font: fonts.body, color: C.muted, maxWidth: 700 });
      if (s.headline) text(page, fonts, s.headline, { x: 64, top: t + 18, size: 16, font: fonts.medium, color: C.ink, maxWidth: 700 });
      strokes(page, [rough.generator().curve([[64, t + 70], [220, t + 64], [380, t + 72]], { seed: 7, roughness: 1, stroke: ACCENT, strokeWidth: 2.4 })]);
      page.drawText(safe(`pitch deck, ${month.toLowerCase()}`, fonts), { x: 64, y: 70, size: fonts.custom ? 22 : 12, font: fonts.hand, color: hex("#6e6360") });
      if (opts.website) {
        const w = safe(opts.website.replace(/^https?:\/\//, ""), fonts);
        page.drawText(w, { x: W - 64 - fonts.medium.widthOfTextAtSize(w, 12), y: 70, size: 12, font: fonts.medium, color: C.ink });
      }
      return;
    }

    const top = text(page, fonts, s.kicker, { x: 48, top: 40, size: 12, font: fonts.medium, color: C.accent, maxWidth: 400 });
    const headBottom = text(page, fonts, s.headline, { x: 48, top: top + 8, size: 30, font: fonts.display, color: C.display, maxWidth: 820, lineHeight: 1.12, maxLines: 2 });
    const contentTop = headBottom + 26;
    const hasChart = s.chart?.kind && s.chart.kind !== "none" && s.chart.values.length > 0;
    const wide = s.rows.length > 0;

    if (wide) {
      let t = contentTop;
      if (s.body) t = text(page, fonts, s.body, { x: 48, top: t, size: 15, font: fonts.body, color: C.body, maxWidth: 820, maxLines: 2 }) + 16;
      rowsTable(page, fonts, s.rows, { x: 48, top: t, w: 864 });
    } else {
      const leftW = hasChart || s.stat_value ? 420 : 820;
      let t = contentTop;
      if (s.body) t = text(page, fonts, s.body, { x: 48, top: t, size: 16, font: fonts.body, color: C.body, maxWidth: leftW, maxLines: 4 }) + 18;
      bullets(page, fonts, s.bullets, { x: 48, top: t, w: leftW });

      if (hasChart) {
        chart(page, fonts, s.chart, { x: 510, top: contentTop - 6, w: 402, h: 300 }, 40 + i * 7);
      } else if (s.stat_value) {
        text(page, fonts, s.stat_value, { x: 520, top: contentTop + 20, size: 72, font: fonts.display, color: C.display, maxWidth: 400, lineHeight: 1 });
        text(page, fonts, s.stat_label, { x: 522, top: contentTop + 110, size: 16, font: fonts.body, color: C.muted, maxWidth: 380 });
        strokes(page, [rough.generator().line(522, contentTop + 100, 700, contentTop + 97, { seed: 9 + i, roughness: 1, stroke: ACCENT, strokeWidth: 2 })]);
      }
    }

    if (bookend && (opts.email || opts.website)) {
      const contact = [opts.email, opts.website?.replace(/^https?:\/\//, "")].filter(Boolean).join("   ");
      page.drawText(safe(contact, fonts), { x: 48, y: 62, size: 13, font: fonts.medium, color: C.ink });
    }
    footer(page, fonts, deck.company, i + 1, total);
  });

  return pdf.save();
}
