// Brand capture: colours, fonts, logo, favicon and a homepage screenshot, taken from the same Firecrawl
// scrape that reads the founder's homepage (branding and screenshot formats cost no extra credits).
// Images are copied into the public `brand` bucket because Firecrawl's URLs expire.
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { admin, secret, SUPABASE_URL } from "./core.ts";
import { recordSpend } from "./spend.ts";

export interface Brand {
  color_scheme: "light" | "dark";
  colors: { primary: string | null; secondary: string | null; accent: string | null; background: string | null; text: string | null };
  fonts: { heading: string | null; body: string | null };
  /** PNG in storage, cropped to the artwork. */
  logo_url: string | null;
  /** Average brightness of the logo's opaque pixels, 0 (black) to 1 (white). */
  logo_luminance: number | null;
  logo_size: { width: number; height: number } | null;
  favicon_url: string | null;
  screenshot_url: string | null;
  source_url: string;
  captured_at: string;
}

// deno-lint-ignore no-explicit-any
export type FirecrawlBranding = Record<string, any>;

/** Formats to request from Firecrawl so one scrape returns content and brand together. */
export const BRAND_FORMATS = [
  "branding",
  { type: "screenshot", fullPage: false, quality: 82, viewport: { width: 1440, height: 900 } },
];

const SYSTEM_FONTS = /^(-apple-system|blinkmacsystemfont|system-ui|segoe ui|roboto|helvetica|helvetica neue|arial|sans-serif|serif|monospace|ui-sans-serif|ui-serif|ui-monospace|oxygen|ubuntu|cantarell|fira sans|droid sans|open sans|apple color emoji|segoe ui emoji|segoe ui symbol|noto color emoji|sf pro display|sf pro text|times new roman|georgia|courier new|inherit|initial)$/i;

let wasmReady: Promise<void> | null = null;
function resvg() {
  wasmReady ??= initWasm(fetch("https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm"));
  return wasmReady;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function hexOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (HEX.test(s)) return s.length === 4 ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase() : s.toLowerCase();
  const m = s.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
  return null;
}

/** "Inter Variable" -> "Inter"; drops system stacks. */
function cleanFont(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const f = name.split(",")[0].replace(/["']/g, "").replace(/\s+(variable|var|vf|display|text)$/i, "").trim();
  if (!f || SYSTEM_FONTS.test(f) || f.startsWith("__") || f.length > 40) return null;
  return f;
}

function pickFonts(b: FirecrawlBranding) {
  const fams = b.typography?.fontFamilies ?? {};
  const listed: string[] = (b.fonts ?? []).map((f: { family?: string }) => f?.family).filter(Boolean);
  const candidates = [fams.heading, fams.primary, ...listed].map(cleanFont).filter((f): f is string => Boolean(f));
  const heading = candidates[0] ?? null;
  const body = [fams.primary, fams.body, ...listed].map(cleanFont).find((f) => f) ?? heading;
  return { heading, body };
}

function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return "image/webp";
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  return null;
}

async function fetchBytes(url: string, timeoutMs = 15000): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "Mozilla/5.0 Centrale brand capture" } });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length > 0 && buf.length < 12_000_000 ? buf : null;
  } catch {
    return null;
  }
}

function pngSize(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

function jpegSize(bytes: Uint8Array) {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) + bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xc3) return { height: (bytes[i + 5] << 8) + bytes[i + 6], width: (bytes[i + 7] << 8) + bytes[i + 8] };
    i += 2 + len;
  }
  return null;
}

function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Renders any logo (SVG source, or a PNG/JPEG wrapped in SVG) to a cropped PNG and measures its brightness. */
async function rasterise(svg: string, height = 240) {
  await resvg();
  const r = new Resvg(svg, { fitTo: { mode: "height", value: height } });
  const bbox = r.getBBox();
  if (bbox && bbox.width > 0 && bbox.height > 0) r.cropByBBox(bbox);
  const img = r.render();
  const px = img.pixels;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 16) {
    if (px[i + 3] > 128) {
      sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      n++;
    }
  }
  const png = img.asPng();
  const out = { png, width: img.width, height: img.height, luminance: n ? sum / n / 255 : null };
  img.free();
  r.free();
  return out;
}

async function logoToPng(src: string | null, base: string) {
  if (!src) return null;
  try {
    let bytes: Uint8Array | null = null;
    let svgText: string | null = null;
    if (src.startsWith("data:")) {
      const [meta, data] = src.slice(5).split(",", 2);
      if (/;base64/i.test(meta)) bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      else svgText = decodeURIComponent(data);
    } else {
      bytes = await fetchBytes(new URL(src, base).toString());
    }
    if (bytes) {
      const type = sniff(bytes);
      if (type === "image/svg+xml") svgText = new TextDecoder().decode(bytes);
      else if (type === "image/png" || type === "image/jpeg") {
        const size = type === "image/png" ? pngSize(bytes) : jpegSize(bytes);
        if (!size?.width || !size.height) return null;
        svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><image href="data:${type};base64,${b64(bytes)}" width="${size.width}" height="${size.height}"/></svg>`;
      } else return null;
    }
    if (!svgText || !/<svg/i.test(svgText)) return null;
    // Logos drawn with currentColor have no colour of their own; give them dark ink.
    svgText = svgText.replace(/currentColor/g, "#111111");
    const out = await rasterise(svgText);
    return out.width >= 8 && out.height >= 8 ? out : null;
  } catch (err) {
    console.warn("logo rasterise failed", err);
    return null;
  }
}

async function store(path: string, bytes: Uint8Array, contentType: string) {
  const { error } = await admin.storage.from("brand").upload(path, bytes, { contentType, upsert: true, cacheControl: "3600" });
  if (error) {
    console.warn("brand upload failed", path, error.message);
    return null;
  }
  // Cache-bust so a refreshed brand shows straight away.
  return `${SUPABASE_URL}/storage/v1/object/public/brand/${path}?v=${Date.now()}`;
}

/** Saves the brand Firecrawl returned for a founder's homepage. Never throws: brand is a nice-to-have. */
export async function captureBrand(
  ownerId: string,
  domain: string,
  data: { branding?: FirecrawlBranding; screenshot?: string; metadata?: Record<string, unknown> },
): Promise<Brand | null> {
  try {
    const b = data.branding ?? {};
    const base = `https://${domain}`;
    const colors = b.colors ?? {};

    const [logo, favicon, shot] = await Promise.all([
      logoToPng(b.images?.logo ?? b.logo ?? null, base),
      fetchBytes(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`),
      data.screenshot ? fetchBytes(data.screenshot, 20000) : Promise.resolve(null),
    ]);

    const [logoUrl, faviconUrl, shotUrl] = await Promise.all([
      logo ? store(`${ownerId}/logo.png`, logo.png, "image/png") : null,
      favicon && sniff(favicon) === "image/png" ? store(`${ownerId}/favicon.png`, favicon, "image/png") : null,
      shot && sniff(shot) ? store(`${ownerId}/screenshot.${sniff(shot) === "image/png" ? "png" : "jpg"}`, shot, sniff(shot)!) : null,
    ]);

    const brand: Brand = {
      color_scheme: b.colorScheme === "dark" ? "dark" : "light",
      colors: {
        primary: hexOrNull(colors.primary),
        secondary: hexOrNull(colors.secondary),
        accent: hexOrNull(colors.accent) ?? hexOrNull(colors.link),
        background: hexOrNull(colors.background),
        text: hexOrNull(colors.textPrimary),
      },
      fonts: pickFonts(b),
      logo_url: logoUrl,
      logo_luminance: logo?.luminance ?? null,
      logo_size: logo ? { width: logo.width, height: logo.height } : null,
      favicon_url: faviconUrl,
      screenshot_url: shotUrl,
      source_url: base,
      captured_at: new Date().toISOString(),
    };
    await admin.from("startups").update({ brand, brand_status: "done" }).eq("owner_id", ownerId);
    return brand;
  } catch (err) {
    console.warn("brand capture failed", err);
    await admin.from("startups").update({ brand_status: "error" }).eq("owner_id", ownerId);
    return null;
  }
}

/** Scrapes the homepage for brand only (used when a founder refreshes their brand). One Firecrawl credit. */
export async function refreshBrand(ownerId: string, domain: string) {
  await admin.from("startups").update({ brand_status: "running" }).eq("owner_id", ownerId);
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${await secret("FIRECRAWL_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: `https://${domain}`, formats: BRAND_FORMATS, timeout: 45000 }),
  });
  const body = await res.json().catch(() => ({}));
  await recordSpend({ owner: ownerId, feature: "brand_scrape" }, { firecrawl_credits: body?.data?.metadata?.creditsUsed ?? 1 });
  if (!res.ok || !body.success || !body.data) {
    await admin.from("startups").update({ brand_status: "error" }).eq("owner_id", ownerId);
    return null;
  }
  return captureBrand(ownerId, domain, body.data);
}
