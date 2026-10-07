// Pitch deck: the slide schema Claude fills, and a PDF renderer. Decks are drawn in the founder's brand
// (colours, fonts, logo, favicon, homepage screenshot) when one was captured, and in the Centrale
// sketchbook style otherwise. Researched industry figures carry numbered sources and a sources slide.
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
// The bundled ESM build: the bin/ build uses extensionless imports Deno cannot resolve.
import roughBundle from "npm:roughjs@4.6.6/bundled/rough.esm.js";
import type { RoughGenerator } from "npm:roughjs@4.6.6/bin/generator.d.ts";
import { CENTRALE_THEME, type DeckTheme } from "./theme.ts";
const rough = roughBundle as unknown as { generator(): RoughGenerator };

export const SLIDE_TYPES = [
  "cover",
  "problem",
  "market",
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

export interface Fact {
  source_id: string;
  /** Source number shown on the slide, assigned after generation. */
  n: number;
  value: string;
  label: string;
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
  facts: Fact[];
}

export interface Source {
  n: number;
  value: string;
  claim: string;
  source_title: string;
  publisher: string;
  year: string;
  url: string;
}

export interface Deck {
  company: string;
  tagline: string;
  slides: Slide[];
  theme?: DeckTheme;
  sources?: Source[];
  industry?: string;
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
        required: ["type", "kicker", "headline", "body", "bullets", "stat_value", "stat_label", "chart", "rows", "facts"],
        properties: {
          type: { type: "string", enum: [...SLIDE_TYPES] },
          kicker: { type: "string", description: "2 to 4 word label above the headline, e.g. 'The problem'." },
          headline: { type: "string", description: "One claim, under 12 words." },
          body: { type: "string", description: "One or two sentences, under 40 words. Empty string if bullets say it." },
          bullets: { type: "array", items: { type: "string" }, description: "0 to 4 bullets, each under 14 words." },
          stat_value: { type: "string", description: "One headline number from the founder's own answers or website, e.g. '$1.5m' or '40 customers'. Empty if none. Never an industry figure." },
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
          facts: {
            type: "array",
            description: "Researched industry figures shown on this slide, 0 to 3. Each refers to a research fact by its id. Use on problem, market and why_now slides only.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source_id", "label"],
              properties: {
                source_id: { type: "string", description: "The research fact id, e.g. 's2'." },
                label: { type: "string", description: "What the figure measures, under 12 words, faithful to the research claim." },
              },
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
type Color = ReturnType<typeof rgb>;
const hex = (h: string): Color => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

interface Palette {
  paper: Color;
  ink: Color;
  display: Color;
  body: Color;
  muted: Color;
  label: Color;
  line: Color;
  accent: Color;
  coverBg: Color;
  coverInk: Color;
  coverMuted: Color;
  grid: Color;
  gridMajor: Color;
}

interface Fonts {
  display: PDFFont;
  body: PDFFont;
  medium: PDFFont;
  hand: PDFFont;
  custom: boolean;
}

interface Images {
  logo: PDFImage | null;
  favicon: PDFImage | null;
  screenshot: PDFImage | null;
}

interface Ctx {
  page: PDFPage;
  fonts: Fonts;
  c: Palette;
  t: DeckTheme;
  img: Images;
  sketch: boolean;
}

async function fetchBytes(url: string | null | undefined) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function embedImage(pdf: PDFDocument, url: string | null | undefined): Promise<PDFImage | null> {
  const bytes = await fetchBytes(url);
  if (!bytes) return null;
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return await pdf.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes);
  } catch (err) {
    console.warn("image embed failed", url, err);
  }
  return null;
}

/** A Google Fonts TTF for a family and weight; Google serves TTF to non-browser clients. */
async function googleFont(family: string, weights: number[]): Promise<Uint8Array | null> {
  for (const w of weights) {
    try {
      const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${w}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!css.ok) continue;
      const url = (await css.text()).match(/url\((https:[^)]+\.ttf)\)/)?.[1];
      if (!url) continue;
      const bytes = await fetchBytes(url);
      if (bytes) return bytes;
    } catch {
      // try the next weight
    }
  }
  return null;
}

async function loadFonts(pdf: PDFDocument, fontBase: string | null, theme: DeckTheme): Promise<Fonts> {
  pdf.registerFontkit(fontkit);
  // fontkit's subsetter drops glyphs from some Google Fonts builds, so brand fonts are embedded whole.
  const embed = async (bytes: Uint8Array | null, subset = true) => (bytes ? await pdf.embedFont(bytes, { subset }).catch(() => null) : null);
  const whole = (bytes: Uint8Array | null) => embed(bytes, false);
  const own = async (name: string) => (fontBase ? embed(await fetchBytes(`${fontBase}/fonts/${name}.ttf`)) : null);

  const [ownDisplay, ownBody, ownMedium, ownHand] = await Promise.all([own("Outfit-SemiBold"), own("Geist-Regular"), own("Geist-Medium"), own("Caveat-SemiBold")]);

  let display = ownDisplay;
  let body = ownBody;
  let medium = ownMedium;
  if (theme.style === "brand") {
    const [bd, bb, bm] = await Promise.all([
      theme.heading_font ? googleFont(theme.heading_font, [600, 700, 500, 400]).then(whole) : null,
      theme.body_font ? googleFont(theme.body_font, [400]).then(whole) : null,
      theme.body_font ? googleFont(theme.body_font, [500, 600, 400]).then(whole) : null,
    ]);
    display = bd ?? display;
    body = bb ?? body;
    medium = bm ?? medium;
  }

  if (display && body && medium) return { display, body, medium, hand: ownHand ?? body, custom: true };
  const [hd, hb, hm] = await Promise.all([
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  return { display: hd, body: hb, medium: hm, hand: hb, custom: false };
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
  x: Ctx,
  str: string,
  o: { x: number; top: number; size: number; font: PDFFont; color: Color; maxWidth: number; lineHeight?: number; maxLines?: number; align?: "left" | "right" },
) {
  const lh = o.lineHeight ?? 1.3;
  const lines = wrap(safe(str, x.fonts), o.font, o.size, o.maxWidth).slice(0, o.maxLines ?? 99);
  lines.forEach((line, i) => {
    const w = o.align === "right" ? o.font.widthOfTextAtSize(line, o.size) : 0;
    x.page.drawText(line, { x: o.align === "right" ? o.x - w : o.x, y: H - o.top - o.size * (0.85 + i * lh), size: o.size, font: o.font, color: o.color });
  });
  return o.top + lines.length * o.size * lh;
}

/** Draws an image inside a box, keeping its aspect ratio. Returns the drawn size. */
function image(x: Ctx, img: PDFImage, box: { x: number; top: number; w: number; h: number }, align: "left" | "right" = "left") {
  const scale = Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const left = align === "right" ? box.x + box.w - w : box.x;
  x.page.drawImage(img, { x: left, y: H - box.top - h, width: w, height: h });
  return { w, h };
}

function background(x: Ctx, color: Color, graph: boolean) {
  x.page.drawRectangle({ x: 0, y: 0, width: W, height: H, color });
  if (!graph) return;
  for (let gx = 0; gx <= W; gx += 24) {
    x.page.drawLine({ start: { x: gx, y: 0 }, end: { x: gx, y: H }, thickness: 0.5, color: gx % 120 === 0 ? x.c.gridMajor : x.c.grid });
  }
  for (let gy = 0; gy <= H; gy += 24) {
    x.page.drawLine({ start: { x: 0, y: gy }, end: { x: W, y: gy }, thickness: 0.5, color: gy % 120 === 0 ? x.c.gridMajor : x.c.grid });
  }
}

/** Draws roughjs drawables (SVG coordinates, y down from the page top). */
function strokes(x: Ctx, drawables: unknown[]) {
  const gen = rough.generator();
  for (const d of drawables) {
    // deno-lint-ignore no-explicit-any
    for (const p of gen.toPaths(d as any)) {
      const filled = p.fill && p.fill !== "none";
      x.page.drawSvgPath(p.d, {
        x: 0,
        y: H,
        ...(filled ? { color: hex(p.fill!), borderWidth: 0 } : { borderColor: hex(p.stroke), borderWidth: p.strokeWidth }),
      });
    }
  }
}

function tile(x: Ctx, left: number, top: number, size = 7) {
  x.page.drawRectangle({ x: left, y: H - top - size, width: size, height: size, color: x.c.accent });
}

function sourcesLine(slide: Slide, sources: Map<number, Source>) {
  const ns = [...new Set(slide.facts.map((f) => f.n))].sort((a, b) => a - b);
  return ns
    .map((n) => {
      const s = sources.get(n);
      return s ? `[${n}] ${[s.publisher, s.year].filter(Boolean).join(", ")}` : null;
    })
    .filter(Boolean)
    .join("   ");
}

function footer(x: Ctx, company: string, n: number, total: number, note: string) {
  const { page, fonts, c } = x;
  page.drawLine({ start: { x: 48, y: 40 }, end: { x: W - 48, y: 40 }, thickness: 0.6, color: c.line });
  let left = 48;
  const mark = x.t.logo_on_paper ? null : x.img.favicon;
  if (mark) {
    page.drawImage(mark, { x: left, y: 21, width: 12, height: 12 });
    left += 18;
  }
  if (x.t.logo_on_paper && x.img.logo) {
    left += image(x, x.img.logo, { x: left, top: H - 34, w: 90, h: 13 }).w + 14;
  } else {
    page.drawText(safe(company, fonts), { x: left, y: 24, size: 9, font: fonts.medium, color: c.muted });
    left += fonts.medium.widthOfTextAtSize(safe(company, fonts), 9) + 16;
  }
  if (note) {
    const room = W - 48 - 60 - left;
    const lines = wrap(safe(note, fonts), fonts.body, 8, room);
    page.drawText(lines[0] ?? "", { x: left, y: 24, size: 8, font: fonts.body, color: c.label });
  }
  const right = `${n} / ${total}`;
  page.drawText(right, { x: W - 48 - fonts.body.widthOfTextAtSize(right, 9), y: 24, size: 9, font: fonts.body, color: c.label });
}

/** "$k" -> "$120k", "%" -> "40%", "customers" -> "40 customers". */
function formatValue(v: number, unit: string) {
  const u = unit.trim();
  const m = u.match(/^([$£€])(.*)$/);
  if (m) return `${m[1]}${v}${m[2]}`;
  if (u === "%" || u === "k" || u === "m") return `${v}${u}`;
  return u ? `${v} ${u}` : `${v}`;
}

function chart(x: Ctx, ch: Chart, box: { x: number; top: number; w: number; h: number }, seed: number) {
  const { page, fonts, c, t, sketch } = x;
  const n = Math.min(ch.labels.length, ch.values.length);
  if (ch.kind === "none" || n === 0) return;
  const values = ch.values.slice(0, n);
  const max = Math.max(...values, 1);
  const g = rough.generator();
  const x0 = box.x + 8;
  const y0 = box.top + box.h - 26; // baseline
  const plotH = box.h - 70;
  const plotW = box.w - 16;
  const roughness = sketch ? 0.9 : 0;
  const base = { seed, roughness, bowing: sketch ? 1 : 0, stroke: t.ink, strokeWidth: sketch ? 1.2 : 1 };
  const quiet = sketch ? "#9a8d88" : t.line;

  text(x, ch.title, { x: box.x, top: box.top, size: 12, font: fonts.medium, color: c.muted, maxWidth: box.w });

  const drawables: unknown[] = [g.line(x0, y0, x0 + plotW, y0, base)];
  const step = plotW / n;

  if (ch.kind === "bar") {
    values.forEach((v, i) => {
      const bh = Math.max(2, (v / max) * plotH);
      const bw = Math.min(46, step * 0.56);
      const bx = x0 + step * i + (step - bw) / 2;
      const last = i === n - 1;
      drawables.push(
        g.rectangle(bx, y0 - bh, bw, bh, {
          seed: seed + i + 1,
          roughness,
          bowing: sketch ? 1 : 0,
          stroke: last ? t.accent : sketch ? "#6e6360" : quiet,
          strokeWidth: sketch ? 1 : 0.1,
          fill: last ? t.accent : quiet,
          fillStyle: sketch ? "hachure" : "solid",
          hachureGap: 4,
          fillWeight: 0.8,
        }),
      );
    });
  } else {
    const pts = values.map((v, i) => [x0 + step * i + step / 2, y0 - (v / max) * plotH] as [number, number]);
    drawables.push(g.linearPath(pts, { seed: seed + 3, roughness: sketch ? 0.8 : 0, stroke: t.accent, strokeWidth: 2 }));
    pts.forEach(([px, py], i) => drawables.push(g.circle(px, py, 7, { seed: seed + 10 + i, roughness, stroke: t.ink, strokeWidth: 1, fill: t.ink, fillStyle: "solid" })));
  }
  strokes(x, drawables);

  values.forEach((v, i) => {
    const cx = x0 + step * i + step / 2;
    const lab = safe(ch.labels[i] ?? "", fonts).slice(0, 10);
    page.drawText(lab, { x: cx - fonts.body.widthOfTextAtSize(lab, 9) / 2, y: H - y0 - 16, size: 9, font: fonts.body, color: c.label });
    const vy = ch.kind === "bar" ? y0 - Math.max(2, (v / max) * plotH) - 14 : y0 - (v / max) * plotH - 16;
    const val = formatValue(v, ch.unit);
    page.drawText(val, { x: cx - fonts.medium.widthOfTextAtSize(val, 9.5) / 2, y: H - vy, size: 9.5, font: fonts.medium, color: c.ink });
  });
}

function rowsTable(x: Ctx, rows: Slide["rows"], box: { x: number; top: number; w: number }) {
  const { page, fonts, c } = x;
  let top = box.top;
  rows.slice(0, 5).forEach((r) => {
    page.drawLine({ start: { x: box.x, y: H - top }, end: { x: box.x + box.w, y: H - top }, thickness: 0.6, color: c.line });
    const labelBottom = text(x, r.label, { x: box.x, top: top + 16, size: 18, font: fonts.display, color: c.display, maxWidth: box.w * 0.3 });
    const detailBottom = text(x, r.detail, { x: box.x + box.w * 0.34, top: top + 18, size: 15, font: fonts.body, color: c.body, maxWidth: box.w * 0.66, maxLines: 2 });
    top = Math.max(labelBottom, detailBottom) + 16;
  });
  page.drawLine({ start: { x: box.x, y: H - top }, end: { x: box.x + box.w, y: H - top }, thickness: 0.6, color: c.line });
}

function bullets(x: Ctx, items: string[], box: { x: number; top: number; w: number }) {
  let top = box.top;
  items.slice(0, 4).forEach((b) => {
    tile(x, box.x, top + 6, 6);
    top = text(x, b, { x: box.x + 18, top, size: 15, font: x.fonts.body, color: x.c.body, maxWidth: box.w - 18 }) + 10;
  });
  return top;
}

/** The homepage screenshot in a simple browser frame. */
function screenshot(x: Ctx, box: { x: number; top: number; w: number }) {
  const img = x.img.screenshot;
  if (!img) return 0;
  const { page, c } = x;
  const bar = 18;
  const h = (box.w * img.height) / img.width;
  page.drawRectangle({ x: box.x + 5, y: H - box.top - bar - h - 5, width: box.w, height: bar + h, color: c.line });
  page.drawRectangle({ x: box.x, y: H - box.top - bar - h, width: box.w, height: bar + h, color: rgb(1, 1, 1), borderColor: c.line, borderWidth: 0.8 });
  [0, 1, 2].forEach((i) => page.drawCircle({ x: box.x + 11 + i * 9, y: H - box.top - bar / 2, size: 2.6, color: c.line }));
  page.drawImage(img, { x: box.x, y: H - box.top - bar - h, width: box.w, height: h });
  return bar + h;
}

/** Up to three researched figures as large numbers with their labels and source numbers. */
function factCards(x: Ctx, facts: Fact[], box: { x: number; top: number; w: number }, layout: "row" | "stack") {
  const { fonts, c } = x;
  const list = facts.slice(0, layout === "row" ? 3 : 2);
  if (!list.length) return box.top;
  if (layout === "row") {
    const gap = 28;
    const colW = (box.w - gap * (list.length - 1)) / list.length;
    let bottom = box.top;
    list.forEach((f, i) => {
      const left = box.x + i * (colW + gap);
      x.page.drawRectangle({ x: left, y: H - box.top - 3, width: 28, height: 3, color: c.accent });
      const size = f.value.length <= 7 ? 46 : f.value.length <= 11 ? 36 : 28;
      let t = text(x, f.value, { x: left, top: box.top + 18, size, font: fonts.display, color: c.display, maxWidth: colW, lineHeight: 1, maxLines: 1 });
      t = text(x, f.label, { x: left, top: t + 10, size: 14, font: fonts.body, color: c.body, maxWidth: colW, maxLines: 3 });
      t = text(x, `[${f.n}]`, { x: left, top: t + 6, size: 9, font: fonts.medium, color: c.label, maxWidth: colW });
      bottom = Math.max(bottom, t);
    });
    return bottom;
  }
  let t = box.top;
  list.forEach((f) => {
    x.page.drawRectangle({ x: box.x, y: H - t - 3, width: 28, height: 3, color: c.accent });
    const size = f.value.length <= 7 ? 54 : f.value.length <= 11 ? 40 : 30;
    t = text(x, f.value, { x: box.x, top: t + 16, size, font: fonts.display, color: c.display, maxWidth: box.w, lineHeight: 1, maxLines: 1 });
    t = text(x, `${f.label} [${f.n}]`, { x: box.x, top: t + 8, size: 14, font: fonts.body, color: c.muted, maxWidth: box.w, maxLines: 2 }) + 22;
  });
  return t;
}

function cover(x: Ctx, deck: Deck, s: Slide, month: string, website?: string | null) {
  const { page, fonts, c, t, img, sketch } = x;
  background(x, c.coverBg, sketch);
  if (!sketch) page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: c.accent });

  const shot = img.screenshot && !sketch;
  const textW = shot ? 430 : 780;
  let top = 84;
  const logo = t.logo_on_cover ? img.logo : null;
  if (logo) {
    top += image(x, logo, { x: 64, top, w: 240, h: 44 }).h + 44;
  } else {
    tile(x, 64, top + 12, 12);
    top += 60;
  }
  // When the logo already spells the name, lead with the tagline instead of repeating it.
  const lead = logo && deck.tagline ? deck.tagline : deck.company;
  const leadSize = lead.length > 34 ? 40 : logo ? 46 : 60;
  top = text(x, lead, { x: 64, top, size: leadSize, font: fonts.display, color: c.coverInk, maxWidth: textW, lineHeight: 1.08, maxLines: 3 });
  if (!logo && deck.tagline) top = text(x, deck.tagline, { x: 64, top: top + 10, size: 22, font: fonts.body, color: c.coverMuted, maxWidth: textW, maxLines: 2 });
  if (s.headline) top = text(x, s.headline, { x: 64, top: top + 18, size: 16, font: fonts.medium, color: c.coverInk, maxWidth: textW, maxLines: 2 });
  if (sketch) {
    strokes(x, [rough.generator().curve([[64, top + 40], [220, top + 34], [380, top + 42]], { seed: 7, roughness: 1, stroke: t.accent, strokeWidth: 2.4 })]);
  }

  if (shot && img.screenshot) {
    const w = 400;
    const h = (w * img.screenshot.height) / img.screenshot.width;
    const sx = W - 48 - w;
    const sy = Math.max(96, (H - h) / 2 - 10);
    page.drawRectangle({ x: sx + 6, y: H - sy - h - 6, width: w, height: h, color: c.accent, opacity: 0.25 });
    page.drawImage(img.screenshot, { x: sx, y: H - sy - h, width: w, height: h });
    page.drawRectangle({ x: sx, y: H - sy - h, width: w, height: h, borderColor: c.line, borderWidth: 0.6 });
  }

  const label = sketch ? `pitch deck, ${month.toLowerCase()}` : `Pitch deck, ${month}`;
  page.drawText(safe(label, fonts), { x: 64, y: 52, size: sketch && fonts.custom ? 22 : 12, font: sketch ? fonts.hand : fonts.medium, color: c.coverMuted });
  if (website) {
    const w = safe(website.replace(/^https?:\/\//, "").replace(/\/$/, ""), fonts);
    page.drawText(w, { x: W - 64 - fonts.medium.widthOfTextAtSize(w, 12), y: 52, size: 12, font: fonts.medium, color: c.coverInk });
  }
}

function sourcesSlide(x: Ctx, deck: Deck, sources: Source[], n: number, total: number) {
  const { fonts, c } = x;
  background(x, c.paper, false);
  const top = text(x, "Sources", { x: 48, top: 40, size: 12, font: fonts.medium, color: c.accent, maxWidth: 400 });
  let t = text(x, "Where the industry figures come from", { x: 48, top: top + 8, size: 30, font: fonts.display, color: c.display, maxWidth: 820, maxLines: 1 }) + 22;
  const size = sources.length > 5 ? 11 : 12;
  for (const s of sources) {
    if (t > H - 80) break;
    text(x, `${s.n}`, { x: 48, top: t, size, font: fonts.medium, color: c.accent, maxWidth: 24 });
    let b = text(x, `${s.value}: ${s.claim}`, { x: 76, top: t, size, font: fonts.body, color: c.body, maxWidth: 836, maxLines: 2 });
    b = text(x, [s.publisher, s.source_title, s.year].filter(Boolean).join(", "), { x: 76, top: b + 1, size: size - 2, font: fonts.medium, color: c.muted, maxWidth: 836, maxLines: 1 });
    b = text(x, s.url, { x: 76, top: b, size: size - 3, font: fonts.body, color: c.label, maxWidth: 836, maxLines: 1 });
    t = b + 10;
  }
  footer(x, deck.company, n, total, "");
}

export async function renderDeckPdf(deck: Deck, opts: { fontBase: string | null; website?: string | null; email?: string | null }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${deck.company} pitch deck`);
  pdf.setAuthor(deck.company);
  pdf.setCreator("Centrale");
  const t = deck.theme ?? CENTRALE_THEME;
  const sketch = t.style === "centrale";
  const [fonts, logo, favicon, shot] = await Promise.all([
    loadFonts(pdf, opts.fontBase, t),
    embedImage(pdf, t.logo_url),
    embedImage(pdf, t.favicon_url),
    embedImage(pdf, t.screenshot_url),
  ]);
  const c: Palette = {
    paper: hex(t.paper),
    ink: hex(t.ink),
    display: hex(t.display),
    body: hex(t.body),
    muted: hex(t.muted),
    label: hex(t.label),
    line: hex(t.line),
    accent: hex(t.accent),
    coverBg: hex(t.cover_bg),
    coverInk: hex(t.cover_ink),
    coverMuted: hex(t.cover_muted),
    grid: hex("#efe7da"),
    gridMajor: hex("#e6dccd"),
  };
  const img: Images = { logo, favicon, screenshot: shot };
  const sources = new Map((deck.sources ?? []).map((s) => [s.n, s]));
  const total = deck.slides.length + (deck.sources?.length ? 1 : 0);
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  deck.slides.forEach((s, i) => {
    const page = pdf.addPage([W, H]);
    const x: Ctx = { page, fonts, c, t, img, sketch };

    if (s.type === "cover") {
      cover(x, deck, s, month, opts.website);
      return;
    }

    background(x, c.paper, sketch && s.type === "ask");
    const top = text(x, s.kicker, { x: 48, top: 40, size: 12, font: fonts.medium, color: c.accent, maxWidth: 400 });
    const headBottom = text(x, s.headline, { x: 48, top: top + 8, size: 30, font: fonts.display, color: c.display, maxWidth: 820, lineHeight: 1.12, maxLines: 2 });
    const contentTop = headBottom + 26;
    const facts = s.facts ?? [];
    const hasChart = s.chart?.kind && s.chart.kind !== "none" && s.chart.values.length > 0;
    const wide = s.rows.length > 0;
    const showShot = s.type === "solution" && !hasChart && Boolean(img.screenshot);

    if (s.type === "market" && facts.length) {
      let t2 = contentTop;
      if (s.body) t2 = text(x, s.body, { x: 48, top: t2, size: 16, font: fonts.body, color: c.body, maxWidth: 820, maxLines: 2 }) + 30;
      const after = factCards(x, facts, { x: 48, top: t2, w: 864 }, "row");
      if (s.bullets.length && after < H - 140) bullets(x, s.bullets.slice(0, 2), { x: 48, top: after + 24, w: 864 });
    } else if (wide) {
      let t2 = contentTop;
      if (s.body) t2 = text(x, s.body, { x: 48, top: t2, size: 15, font: fonts.body, color: c.body, maxWidth: 820, maxLines: 2 }) + 16;
      rowsTable(x, s.rows, { x: 48, top: t2, w: 864 });
    } else {
      const side = hasChart || showShot || facts.length > 0 || Boolean(s.stat_value);
      const leftW = side ? 420 : 820;
      let t2 = contentTop;
      if (s.body) t2 = text(x, s.body, { x: 48, top: t2, size: 16, font: fonts.body, color: c.body, maxWidth: leftW, maxLines: 4 }) + 18;
      bullets(x, s.bullets, { x: 48, top: t2, w: leftW });

      if (hasChart) {
        chart(x, s.chart, { x: 510, top: contentTop - 6, w: 402, h: 300 }, 40 + i * 7);
      } else if (showShot) {
        screenshot(x, { x: 506, top: contentTop, w: 400 });
      } else if (facts.length) {
        factCards(x, facts, { x: 520, top: contentTop + 4, w: 392 }, "stack");
      } else if (s.stat_value) {
        text(x, s.stat_value, { x: 520, top: contentTop + 20, size: 72, font: fonts.display, color: c.display, maxWidth: 400, lineHeight: 1 });
        text(x, s.stat_label, { x: 522, top: contentTop + 110, size: 16, font: fonts.body, color: c.muted, maxWidth: 380 });
        if (sketch) strokes(x, [rough.generator().line(522, contentTop + 100, 700, contentTop + 97, { seed: 9 + i, roughness: 1, stroke: t.accent, strokeWidth: 2 })]);
        else page.drawRectangle({ x: 522, y: H - contentTop - 108, width: 64, height: 3, color: c.accent });
      }
    }

    if (s.type === "ask" && (opts.email || opts.website)) {
      const contact = [opts.email, opts.website?.replace(/^https?:\/\//, "")].filter(Boolean).join("   ");
      page.drawText(safe(contact, fonts), { x: 48, y: 62, size: 13, font: fonts.medium, color: c.ink });
    }
    footer(x, deck.company, i + 1, total, sourcesLine(s, sources));
  });

  if (deck.sources?.length) {
    sourcesSlide({ page: pdf.addPage([W, H]), fonts, c, t, img, sketch }, deck, deck.sources, total, total);
  }

  return pdf.save();
}
