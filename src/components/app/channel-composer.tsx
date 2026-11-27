"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { callFunction } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Provider = "linkedin" | "whatsapp";
const LABEL: Record<Provider, string> = { linkedin: "LinkedIn", whatsapp: "WhatsApp" };
const INVITE_MAX = 200;

/**
 * A LinkedIn note or WhatsApp message to one investor, drafted by Claude from the founder's profile.
 * LinkedIn goes as a message to a connection, or as an invite note (200 characters, the limit for free LinkedIn accounts) to anyone else.
 */
export function ChannelComposer({
  investor,
  channel: initial,
  onClose,
  onSent,
}: {
  investor: { id: number; full_name: string; has_linkedin?: boolean; has_phone?: boolean } | null;
  channel: Provider;
  onClose: () => void;
  onSent?: (conversationId: string) => void;
}) {
  const toast = useToast();
  const [channel, setChannel] = useState<Provider>(initial);
  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);

  async function draft(id: number, ch: Provider) {
    const mine = ++run.current;
    setDrafting(true);
    setError(null);
    try {
      const r = await callFunction<{ text: string }>("channels", { action: "draft", investor_id: id, channel: ch });
      if (mine === run.current) setText(r.text);
    } catch (e) {
      if (mine === run.current) setError(e instanceof Error ? e.message : "Could not draft");
    } finally {
      if (mine === run.current) setDrafting(false);
    }
  }

  const investorKey = investor?.id ?? null;
  useEffect(() => {
    if (investorKey == null) return;
    setChannel(initial);
    setText("");
    void draft(investorKey, initial);
  }, [investorKey, initial]);

  function switchTo(ch: Provider) {
    if (!investor || ch === channel) return;
    setChannel(ch);
    setText("");
    void draft(investor.id, ch);
  }

  async function send() {
    if (!investor || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      const r = await callFunction<{ conversation_id: string; kind: "message" | "invite" }>("channels", { action: "send", investor_id: investor.id, channel, text });
      toast({
        title: r.kind === "invite" ? "Invite sent" : `Sent on ${LABEL[channel]}`,
        body: r.kind === "invite" ? `${investor.full_name.split(" ")[0]} sees your note with the invite. Replies land in your Inbox.` : "Replies land in your Inbox.",
      });
      onSent?.(r.conversation_id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  const over = channel === "linkedin" && text.length > INVITE_MAX;
  const missing = investor && ((channel === "linkedin" && investor.has_linkedin === false) || (channel === "whatsapp" && investor.has_phone === false));

  return (
    <Modal open={investor != null} onClose={onClose} title={investor ? `Message ${investor.full_name}` : ""} width={560}>
      {investor && (
        <div className="space-y-3 p-5">
          <div className="inline-flex rounded-[8px] border border-line bg-panel-2 p-0.5" role="tablist">
            {(["linkedin", "whatsapp"] as const).map((ch) => (
              <button
                key={ch}
                role="tab"
                aria-selected={ch === channel}
                onClick={() => switchTo(ch)}
                className={cn("rounded-[6px] px-3 py-1 text-[13px]", ch === channel ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink")}
              >
                {LABEL[ch]}
              </button>
            ))}
          </div>
          {missing ? (
            <p className="text-[13.5px] text-muted">
              We do not have {channel === "linkedin" ? "a LinkedIn profile" : "a mobile number"} for {investor.full_name}. Try {channel === "linkedin" ? "WhatsApp or email" : "LinkedIn or email"}.
            </p>
          ) : (
            <>
              <Textarea
                value={drafting ? "" : text}
                onChange={(e) => setText(e.target.value)}
                placeholder={drafting ? "Claude is drafting" : channel === "linkedin" ? "A short note" : "Your message"}
                className="min-h-[140px]"
                disabled={drafting}
              />
              <div className="flex items-center justify-between text-[12px] text-label">
                <span>
                  {channel === "linkedin"
                    ? "Goes as a message if you are connected, otherwise as an invite note."
                    : "Sends from your own WhatsApp. Keep it short and personal."}
                </span>
                {channel === "linkedin" && <span className={cn("tabular", over && "text-pencil")}>{text.length}/{INVITE_MAX}</span>}
              </div>
            </>
          )}
          <FormError>{error}</FormError>
          {error?.includes("Settings") && (
            <Link href="/dashboard/settings#channels" className="text-[13px] text-ink underline decoration-faint underline-offset-2">
              Open Channels in Settings
            </Link>
          )}
          <div className="flex items-center justify-between border-t border-line-2 pt-3">
            <Button variant="ghost" size="sm" onClick={() => void draft(investor.id, channel)} disabled={drafting || sending || Boolean(missing)}>
              <RefreshCw className="h-3.5 w-3.5" /> Redraft
            </Button>
            <Button variant="primary" onClick={() => void send()} disabled={drafting || sending || !text.trim() || Boolean(missing)}>
              <Send className="h-3.5 w-3.5" /> {sending ? "Sending" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
