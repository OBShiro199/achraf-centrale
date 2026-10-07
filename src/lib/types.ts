export interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export interface Startup {
  id: string;
  owner_id: string;
  name: string | null;
  domain: string | null;
  website_url: string | null;
  favicon_url: string | null;
  one_liner: string | null;
  summary: string | null;
  mission: string | null;
  goal: string | null;
  sectors: string[];
  keywords: string[];
  business_model: string | null;
  target_customer: string | null;
  headcount: string | null;
  values: string[];
  stage: string | null;
  investor_types: string[];
  revenue_band: string | null;
  raise_amount: string | null;
  location: string | null;
  traction: string | null;
  deck_path: string | null;
  deck_filename: string | null;
  deck_mime: string | null;
  deck_uploaded_at: string | null;
  wants_generated_deck: boolean;
  scrape: { title?: string; description?: string; summary?: string; favicon?: string; error?: string } | null;
  analysis_status: "idle" | "running" | "done" | "error";
  analysis_error: string | null;
  analysed_at: string | null;
  onboarding_completed_at: string | null;
  auto_follow_up: boolean;
  follow_up_days: number;
  /** Answers to the five deck questions, keyed by DECK_QUESTIONS keys. */
  deck_inputs: Partial<Record<DeckQuestionKey, string>> | null;
  deck_slides: Deck | null;
  generated_deck_path: string | null;
  generated_deck_at: string | null;
  deck_status: "idle" | "running" | "done" | "error";
  deck_error: string | null;
  /** Investor-side keywords picked by Claude from the directory's own vocabulary. */
  match_keywords: string[];
  matches_status: "idle" | "running" | "done" | "error";
  matched_at: string | null;
  /** Colours, fonts, logo, favicon and homepage screenshot captured from the founder's website. */
  brand: Brand | null;
  brand_status: "running" | "done" | "error" | null;
  /** Where a running deck generation is: brand, research, writing or rendering. */
  deck_stage: "brand" | "research" | "writing" | "rendering" | null;
  deck_started_at: string | null;
}

export interface Brand {
  color_scheme: "light" | "dark";
  colors: { primary: string | null; secondary: string | null; accent: string | null; background: string | null; text: string | null };
  fonts: { heading: string | null; body: string | null };
  logo_url: string | null;
  logo_luminance: number | null;
  logo_size: { width: number; height: number } | null;
  favicon_url: string | null;
  screenshot_url: string | null;
  source_url: string;
  captured_at: string;
}

export type DeckQuestionKey = "revenue_history" | "traction" | "raise" | "team" | "competition";

export const DECK_SLIDE_TYPES = [
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

export interface DeckChart {
  kind: "bar" | "line" | "none";
  title: string;
  unit: string;
  labels: string[];
  values: number[];
}

export interface DeckSlide {
  type: (typeof DECK_SLIDE_TYPES)[number];
  kicker: string;
  headline: string;
  body: string;
  bullets: string[];
  stat_value: string;
  stat_label: string;
  chart: DeckChart;
  rows: { label: string; detail: string }[];
  /** Researched industry figures; `n` is the source number shown on the slide. */
  facts?: DeckFact[];
}

export interface DeckFact {
  source_id: string;
  n: number;
  value: string;
  label: string;
}

export interface DeckSource {
  n: number;
  value: string;
  claim: string;
  source_title: string;
  publisher: string;
  year: string;
  url: string;
}

/** Colours and assets the deck is drawn with, worked out from the founder's brand. Absent on older decks. */
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
  /** True when the logo sits on the cover; content slides use the favicon if the logo is too light for paper. */
  logo_on_cover: boolean;
  logo_on_paper: boolean;
  favicon_url: string | null;
  screenshot_url: string | null;
  heading_font: string | null;
  body_font: string | null;
}

export interface Deck {
  company: string;
  tagline: string;
  slides: DeckSlide[];
  theme?: DeckTheme;
  sources?: DeckSource[];
  industry?: string;
}

export interface SendingDomain {
  id: string;
  domain: string;
  status: "pending" | "verifying" | "verified" | "failed" | "under_review" | "removed";
  records: { type: "TXT" | "CNAME" | "MX"; name: string; value: string; priority?: number | null; purpose?: string; status?: "missing" | "invalid" | "valid" }[];
  warnings: { code: string; message: string; hosts?: string[] }[];
  message: string | null;
  verified_at: string | null;
  checked_at: string | null;
  created_at: string;
}

export interface ScheduledEmail {
  id: string;
  owner_id: string;
  investor_id: string;
  kind: "first" | "follow_up";
  parent_message_id: string | null;
  thread_id: string | null;
  subject: string;
  body: string;
  status: "queued" | "sending" | "sent" | "cancelled" | "failed";
  send_after: string;
  attempts: number;
  last_error: string | null;
  outreach_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Inbox {
  id: string;
  openmail_inbox_id: string;
  address: string;
  display_name: string | null;
  status: "active" | "suspended" | "retired";
  domain: string | null;
  created_at: string;
}

export interface Investor {
  id: string;
  full_name: string;
  title: string | null;
  firm: string;
  email: string;
  phone: string | null;
  location: string | null;
  investor_type: string;
  stages: string[];
  sectors: string[];
  check_min_usd: number | null;
  check_max_usd: number | null;
  fund_size_usd: number | null;
  portfolio: string[];
  thesis: string | null;
  values: string[];
  focus_note: string | null;
  leads_rounds: boolean;
  min_revenue_band: string | null;
  website_url: string | null;
}

export interface Match {
  investor_id: string;
  score: number;
  reasons: string[];
}

export interface OutreachMessage {
  id: string;
  investor_id: string | null;
  direction: "outbound" | "inbound";
  kind: "first" | "reply" | "follow_up";
  openmail_thread_id: string | null;
  from_addr: string | null;
  to_addr: string | null;
  subject: string | null;
  body: string | null;
  status: string;
  sent_at: string;
  opened_at: string | null;
  open_count: number;
}

export interface DashboardStats {
  emails_sent: number;
  investors_saved: number;
  investors_contacted: number;
  replies: number;
  investors_replied: number;
  opened: number;
  open_rate: number;
}

export interface ThreadSummary {
  id: string;
  subject: string;
  isRead: boolean;
  lastMessageAt: string;
  messageCount: number;
  investor: { id: string; full_name: string; firm: string } | null;
  /** Latest inbound sender, for threads not linked to an investor. */
  sender: string | null;
}

export interface ThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string;
  text: string;
  status: string;
  createdAt: string;
}
