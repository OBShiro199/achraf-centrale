import { createClient } from "@/lib/supabase/client";

export const STAGES = [
  { key: "to_contact", label: "To contact" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "meeting", label: "Meeting" },
  { key: "diligence", label: "Diligence" },
  { key: "term_sheet", label: "Term sheet" },
  { key: "committed", label: "Committed" },
  { key: "passed", label: "Passed" },
] as const;

export type Stage = (typeof STAGES)[number]["key"];

export const stageLabel = (s: Stage) => STAGES.find((x) => x.key === s)?.label ?? s;

export interface PipelineCard {
  investor_id: number;
  full_name: string;
  title: string | null;
  firm: string | null;
  has_email: boolean;
  stage: Stage;
  note: string | null;
  next_step: string | null;
  next_step_on: string | null;
  last_sent_at: string | null;
  last_reply_at: string | null;
  thread_id: string | null;
  updated_at: string | null;
}

export async function loadBoard(): Promise<PipelineCard[]> {
  const { data, error } = await createClient().rpc("pipeline_board");
  if (error) throw error;
  return (data ?? []) as PipelineCard[];
}

export type CardPatch = Partial<Pick<PipelineCard, "stage" | "note" | "next_step" | "next_step_on">>;

export async function saveCard(investorId: number, patch: CardPatch) {
  const { error } = await createClient()
    .from("pipeline")
    .upsert({ investor_id: investorId, ...patch }, { onConflict: "owner_id,investor_id" });
  if (error) throw error;
}

/** Adds investors at "To contact", leaving anyone already on the board where they are. */
export async function addToPipeline(investorIds: number[]) {
  if (!investorIds.length) return;
  const { error } = await createClient()
    .from("pipeline")
    .upsert(investorIds.map((investor_id) => ({ investor_id })), { onConflict: "owner_id,investor_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeFromPipeline(investorId: number) {
  const { error } = await createClient().from("pipeline").delete().eq("investor_id", investorId);
  if (error) throw error;
}
