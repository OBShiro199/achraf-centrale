"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, FormError } from "@/components/ui/field";
import { Modal, brandConfetti } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { BrandMark } from "@/components/landing/logo";
import { Hand } from "@/components/sketch/hand";
import { callFunction } from "@/lib/supabase/client";
import type { Investor } from "@/lib/types";
import { useApp } from "./context";

export function ComposeModal({
  investor,
  onClose,
  onSent,
  firstEmail,
}: {
  investor: Investor | null;
  onClose: () => void;
  onSent?: (investorId: string) => void;
  firstEmail?: boolean;
}) {
  const { inbox } = useApp();
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string>("");

  async function draft(id: string) {
    setDrafting(true);
    setError(null);
    try {
      const d = await callFunction<{ subject: string; body: string }>("draft-email", { investor_id: id });
      setSubject(d.subject);
      setBody(d.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not draft this email");
    } finally {
      setDrafting(false);
    }
  }

  useEffect(() => {
    if (!investor) return;
    key.current = crypto.randomUUID();
    setSubject("");
    setBody("");
    void draft(investor.id);
  }, [investor]);

  async function send() {
    if (!investor) return;
    setSending(true);
    setError(null);
    try {
      await callFunction("send-email", { investor_id: investor.id, subject, body, idempotency_key: key.current });
      toast({ title: `Sent to ${investor.full_name}`, body: `From ${inbox?.address}. We will tell you when they reply.` });
      if (firstEmail) void brandConfetti(0.7);
      onSent?.(investor.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={!!investor} onClose={onClose} title={investor ? `Email ${investor.full_name}` : ""} width={660}>
      {investor && (
        <div>
          <div className="space-y-2 border-b border-line-2 px-5 py-3 text-[13px]">
            <div className="flex gap-3">
              <span className="w-12 text-label">From</span>
              <span className="text-ink">{inbox?.address ?? "Your inbox is still being set up"}</span>
            </div>
            <div className="flex gap-3">
              <span className="w-12 text-label">To</span>
              <span className="text-ink">
                {investor.full_name} <span className="text-label">&lt;{investor.email}&gt;</span>
              </span>
            </div>
          </div>

          {drafting ? (
            <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
              <BrandMark className="h-8 w-8" pulse />
              <p className="text-[14px] text-ink">Drafting from your profile and {investor.full_name.split(" ")[0]}&apos;s thesis</p>
              <Hand className="text-[19px]" tilt={-2}>
                usually under ten seconds
              </Hand>
            </div>
          ) : (
            <div className="space-y-3 px-5 py-4">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="font-medium" />
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="min-h-[260px] text-[14px]" />
              <FormError>{error}</FormError>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-line-2 px-5 py-3.5">
            <Button variant="ghost" size="sm" onClick={() => void draft(investor.id)} disabled={drafting || sending}>
              <RefreshCw className="h-3.5 w-3.5" /> Redraft
            </Button>
            <div className="flex items-center gap-3">
              <span className="hidden text-[12px] text-label sm:inline">Drafted by Claude. Read before sending.</span>
              <Button variant="primary" onClick={() => void send()} disabled={drafting || sending || !subject.trim() || !body.trim() || !inbox}>
                <Send className="h-3.5 w-3.5" /> {sending ? "Sending" : "Send"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
