// Shared labels for the Unibox, the dialer and the pipeline.

export type Channel = "email" | "linkedin" | "whatsapp" | "phone";
export type Outcome = "interested" | "meeting" | "call_back" | "not_now" | "not_interested" | "voicemail" | "no_answer";

export const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", linkedin: "LinkedIn", whatsapp: "WhatsApp", phone: "Call" };

export const OUTCOME_LABEL: Record<Outcome, string> = {
  interested: "Interested",
  meeting: "Meeting",
  call_back: "Call back",
  not_now: "Not now",
  not_interested: "Not interested",
  voicemail: "Voicemail",
  no_answer: "No answer",
};

export const OUTCOME_TONE: Record<Outcome, "green" | "amber" | "red" | "neutral"> = {
  interested: "green",
  meeting: "green",
  call_back: "amber",
  not_now: "neutral",
  not_interested: "red",
  voicemail: "neutral",
  no_answer: "neutral",
};

export interface Conversation {
  id: string;
  investor_id: number | null;
  channel: Channel;
  external_id: string;
  title: string | null;
  contact_name: string | null;
  contact_handle: string | null;
  last_message_at: string;
  last_preview: string | null;
  last_direction: "inbound" | "outbound" | null;
  unread: boolean;
  outcome: Outcome | null;
  outcome_source: "ai" | "founder" | null;
  outcome_reason: string | null;
  investor?: { full_name: string; firm: string } | null;
}
