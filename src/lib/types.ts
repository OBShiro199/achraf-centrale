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
}

export interface Inbox {
  id: string;
  openmail_inbox_id: string;
  address: string;
  display_name: string | null;
  status: "active" | "suspended" | "retired";
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
