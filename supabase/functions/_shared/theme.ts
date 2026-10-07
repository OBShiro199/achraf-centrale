// Turns a captured brand into the deck's colours and assets, keeping text readable whatever the site uses.
// The result is stored on the deck so the PDF and the in-app viewer draw the same thing.
import type { Brand } from "./brand.ts";

export interface DeckTheme {
  style: "brand" | "centrale";
  paper: string;
  ink: string;
  display: string;
  body: string;
  muted: string;
  label: string;
  line: string;
  accent: string;
  on_accent: string;
  cover_bg: string;
  cover_ink: string;
  cover_muted: string;
  logo_url: string | null;
  logo_on_cover: boolean;
  logo_on_paper: boolean;
  favicon_url: string | null;
  screenshot_url: string | null;
  heading_font: string | null;
  body_font: string | null;
}

/** Centrale's own sketchbook palette, used when a founder has no brand captured. */
export const CENTRALE_THEME: DeckTheme = {
  style: "centrale",
  paper: "#f6f1e8",
  ink: "#391c25",
  display: "#2c141c",
  body: "#3a2a2e",
  muted: "#6f5f62",
  label: "#9a8d88",
  line: "#e7dfd2",
  accent: "#d94a38",
  on_accent: "#ffffff",
  cover_bg: "#f6f1e8",
  cover_ink: "#2c141c",
  cover_muted: "#6f5f62",
  logo_url: null,
  logo_on_cover: false,
  logo_on_paper: false,
  favicon_url: null,
  screenshot_url: null,
  heading_font: null,
  body_font: null,
};

type RGB = [number, number, number];
const toRgb = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
/** Mix a towards b by t (0 keeps a, 1 gives b). */
export const mix = (a: string, b: string, t: number) => {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};
const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const luminance = (h: string) => {
  const [r, g, b] = toRgb(h);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
function saturation(h: string) {
  const [r, g, b] = toRgb(h).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** The most brand-like colour: saturated, neither near white nor near black. */
function pickAccent(b: Brand): string | null {
  const c = b.colors;
  const candidates = [c.primary, c.accent, c.secondary].filter((x): x is string => Boolean(x));
  const good = candidates.find((x) => saturation(x) > 0.28 && luminance(x) > 0.03 && luminance(x) < 0.7);
  return good ?? candidates.find((x) => saturation(x) > 0.18 && luminance(x) < 0.8) ?? null;
}

export function themeFromBrand(brand: Brand | null | undefined): DeckTheme {
  if (!brand) return CENTRALE_THEME;
  const accentRaw = pickAccent(brand);
  if (!accentRaw && !brand.logo_url) return { ...CENTRALE_THEME, favicon_url: brand.favicon_url, screenshot_url: brand.screenshot_url };

  const white = "#ffffff";
  // The accent must read on white paper; darken it until it does.
  let accent = accentRaw ?? "#3b4252";
  for (let i = 0; i < 8 && contrast(accent, white) < 3; i++) accent = mix(accent, "#000000", 0.15);

  const text = brand.colors.text;
  const ink = text && luminance(text) < 0.05 ? text : mix(accent, "#0b0c10", 0.9);
  const paper = mix(white, accent, 0.025);

  // A light logo needs a dark cover; a dark or colourful logo sits on paper.
  const lightLogo = brand.logo_luminance != null && brand.logo_luminance > 0.62;
  const darkSite = brand.color_scheme === "dark";
  const bg = brand.colors.background;
  const darkCover = lightLogo || (!brand.logo_url && darkSite);
  const coverBg = darkCover ? (bg && luminance(bg) < 0.04 ? bg : mix(accent, "#05060a", 0.78)) : paper;

  return {
    style: "brand",
    paper,
    ink,
    display: ink,
    body: mix(ink, paper, 0.12),
    muted: mix(ink, paper, 0.42),
    label: mix(ink, paper, 0.58),
    line: mix(ink, paper, 0.87),
    accent,
    on_accent: contrast(accent, white) >= 3 ? white : ink,
    cover_bg: coverBg,
    cover_ink: darkCover ? white : ink,
    cover_muted: darkCover ? mix(white, coverBg, 0.35) : mix(ink, paper, 0.42),
    logo_url: brand.logo_url,
    logo_on_cover: Boolean(brand.logo_url),
    logo_on_paper: Boolean(brand.logo_url) && !lightLogo,
    favicon_url: brand.favicon_url,
    screenshot_url: brand.screenshot_url,
    heading_font: brand.fonts.heading,
    body_font: brand.fonts.body,
  };
}
