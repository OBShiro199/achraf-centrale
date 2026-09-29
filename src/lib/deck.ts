import { createClient } from "@/lib/supabase/client";
import type { DeckQuestionKey, Startup } from "@/lib/types";

export type DeckInputs = Partial<Record<DeckQuestionKey, string>>;

/** The five things a seed investor asks first. Answers land in `startups.deck_inputs` and feed generate-deck. */
export const DECK_QUESTIONS: { key: DeckQuestionKey; label: string; hint: string; placeholder: string }[] = [
  {
    key: "revenue_history",
    label: "Monthly revenue for the last six months",
    hint: 'Oldest first, as plain numbers like "4, 6, 9, 12, 15, 21 ($k)" so we can chart them. Write 0 for months with none.',
    placeholder: "4, 6, 9, 12, 15, 21 ($k)",
  },
  {
    key: "traction",
    label: "What traction do you have?",
    hint: "Customers, users, pilots, growth rate and retention. Numbers beat adjectives.",
    placeholder: "38 paying customers, 3 enterprise pilots, 22% month on month growth, 94% of customers renew",
  },
  {
    key: "raise",
    label: "What are you raising, and what will it fund?",
    hint: 'Amount, instrument, and use of funds as a percentage split, e.g. "Hiring 50%, product 30%, sales 20%".',
    placeholder: "$1.5m on a post-money SAFE. Hiring 50%, product 30%, sales 20%",
  },
  {
    key: "team",
    label: "Who is on the team?",
    hint: "Names, roles and one relevant fact about each person. One person per line.",
    placeholder: "Amira Haddad, CEO, ran payments operations at Stripe for four years\nTom Reyes, CTO, built the risk engine at Monzo",
  },
  {
    key: "competition",
    label: "Who else solves this, and why do customers pick you?",
    hint: "Name the alternatives, including spreadsheets or doing nothing, and the reason you win.",
    placeholder: "Larger teams use Brex or Ramp, most use spreadsheets. Customers pick us because setup takes a day, not a month",
  },
];

/** Trims answers and drops empty ones so the function sees "not given" rather than blank strings. */
export function cleanDeckInputs(inputs: DeckInputs): DeckInputs {
  const out: DeckInputs = {};
  for (const q of DECK_QUESTIONS) {
    const v = inputs[q.key]?.trim();
    if (v) out[q.key] = v;
  }
  return out;
}

export function answeredCount(inputs: DeckInputs | null | undefined) {
  return DECK_QUESTIONS.filter((q) => inputs?.[q.key]?.trim()).length;
}

/** A short-lived signed URL for a file in the private `decks` bucket. Pass `download` to force a save with that filename. */
export async function signedDeckUrl(path: string, download?: string) {
  const { data, error } = await createClient()
    .storage.from("decks")
    .createSignedUrl(path, 60, download ? { download: download.replace(/[\\/:*?"<>|]+/g, " ").trim() } : undefined);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not open the file");
  return data.signedUrl;
}

/** Filename for the generated PDF, e.g. "Acme pitch deck.pdf". */
export function generatedDeckFilename(startup: Pick<Startup, "name" | "deck_slides">) {
  return `${startup.deck_slides?.company || startup.name || "Startup"} pitch deck.pdf`;
}
