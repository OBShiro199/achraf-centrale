"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Globe, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Pill, Skeleton } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { callFunction } from "@/lib/supabase/client";
import { cn, formatPhone } from "@/lib/utils";
import { LinkedInMark } from "./brand-icons";

type Provider = "linkedin" | "whatsapp";

export interface ChannelAccount {
  provider: Provider;
  status: "connecting" | "ok" | "credentials" | "error";
  display_name: string | null;
  status_message: string | null;
}

interface ChannelsStatus {
  configured: boolean;
  accounts: ChannelAccount[];
  usage: Record<string, number>;
  limits: Record<string, number>;
}

interface PhoneStatus {
  configured: boolean;
  number: { e164: string; status: string } | null;
}

interface DomainOption {
  domain: string;
  price_usd: number;
  renewal_usd: number | null;
}

/** LinkedIn, WhatsApp and phone state for the signed-in founder. */
export function useChannels() {
  const [channels, setChannels] = useState<ChannelsStatus | null>(null);
  const [phone, setPhone] = useState<PhoneStatus | null>(null);
  const load = useCallback(async () => {
    const [c, p] = await Promise.allSettled([callFunction<ChannelsStatus>("channels", { action: "status" }), callFunction<PhoneStatus>("phone", { action: "status" })]);
    setChannels(c.status === "fulfilled" ? c.value : { configured: false, accounts: [], usage: {}, limits: {} });
    setPhone(p.status === "fulfilled" ? p.value : { configured: false, number: null });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const account = (p: Provider) => channels?.accounts.find((a) => a.provider === p) ?? null;
  return { channels, phone, account, reload: load };
}

const PROVIDER = {
  linkedin: { label: "LinkedIn", Icon: LinkedInMark, blurb: "Invites with a note, then messages once they accept." },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle, blurb: "Message investors on their mobile from your own WhatsApp." },
} as const;

function statusPill(a: ChannelAccount | null) {
  if (!a) return null;
  if (a.status === "ok") return <Pill tone="green">Connected</Pill>;
  if (a.status === "connecting") return <Pill tone="amber">Syncing</Pill>;
  return <Pill tone="red">Reconnect</Pill>;
}

function ConnectRow({ provider, account, configured, onChange, compact, returnTo }: { provider: Provider; account: ChannelAccount | null; configured: boolean; onChange: () => void; compact?: boolean; returnTo?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);
  const { label, Icon, blurb } = PROVIDER[provider];

  async function connect() {
    setBusy("connect");
    try {
      const { url } = await callFunction<{ url: string }>("channels", { action: "connect", provider, return_to: returnTo });
      window.location.href = url;
    } catch (err) {
      toast({ title: `Could not open ${label}`, body: err instanceof Error ? err.message : undefined, tone: "error" });
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy("disconnect");
    try {
      await callFunction("channels", { action: "disconnect", provider });
      toast({ title: `${label} disconnected` });
      onChange();
    } catch (err) {
      toast({ title: "Could not disconnect", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  const needsReconnect = account && account.status !== "ok" && account.status !== "connecting";
  return (
    <div className={cn("flex items-center gap-3", compact ? "py-2.5" : "px-5 py-4")}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-panel-2">
        <Icon className="h-4 w-4 text-ink" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
          {label} {statusPill(account)}
        </p>
        <p className="truncate text-[12.5px] text-muted">{account?.status_message ?? (account?.display_name || blurb)}</p>
      </div>
      {!configured ? (
        <span className="text-[12px] text-label">Coming soon</span>
      ) : !account || needsReconnect ? (
        <Button size="sm" variant={compact ? "secondary" : "primary"} onClick={() => void connect()} disabled={busy != null}>
          {busy === "connect" ? "Opening" : needsReconnect ? "Reconnect" : "Connect"}
        </Button>
      ) : (
        !compact && (
          <Button size="sm" variant="ghost" onClick={() => void disconnect()} disabled={busy != null}>
            {busy === "disconnect" ? "Disconnecting" : "Disconnect"}
          </Button>
        )
      )}
    </div>
  );
}

function PhoneRow({ phone, onChange, compact }: { phone: PhoneStatus | null; onChange: () => void; compact?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function provision() {
    setBusy(true);
    try {
      await callFunction("phone", { action: "provision" });
      onChange();
    } catch (err) {
      toast({ title: "Could not set up your number", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  const n = phone?.number;
  // A number being ordered is ready within a minute or two: check again until it is.
  useEffect(() => {
    if (n?.status !== "ordering") return;
    const id = setInterval(onChange, 8000);
    return () => clearInterval(id);
  }, [n?.status, onChange]);
  return (
    <div className={cn("flex items-center gap-3", compact ? "py-2.5" : "px-5 py-4")}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-panel-2">
        <Phone className="h-4 w-4 text-ink" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
          US number {n?.status === "active" && <Pill tone="green">Ready</Pill>}
        </p>
        <p className="truncate text-[12.5px] text-muted">
          {n?.status === "active" ? `${formatPhone(n.e164)}. Call investors from their profile; calls are recorded and tagged.` : "Call investors from the browser. Calls are recorded, transcribed and tagged."}
        </p>
      </div>
      {!phone ? (
        <Skeleton className="h-7 w-20" />
      ) : !phone.configured ? (
        <span className="text-[12px] text-label">Coming soon</span>
      ) : !n || n.status !== "active" ? (
        <Button size="sm" onClick={() => void provision()} disabled={busy || n?.status === "ordering"}>
          {busy || n?.status === "ordering" ? "Setting up" : "Get my number"}
        </Button>
      ) : null}
    </div>
  );
}

/** Settings card: every outreach channel in one place. */
export function ChannelsCard() {
  const { channels, phone, account, reload } = useChannels();
  return (
    <Card>
      <span id="channels" className="block scroll-mt-20" />
      <CardHeader title="Channels" sub="Reach investors where they answer. Every reply lands in your Inbox." />
      {!channels ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <div className="divide-y divide-line-2">
          <ConnectRow provider="linkedin" account={account("linkedin")} configured={channels.configured} onChange={reload} />
          <ConnectRow provider="whatsapp" account={account("whatsapp")} configured={channels.configured} onChange={reload} />
          <PhoneRow phone={phone} onChange={reload} />
          <div className="px-5 py-3 text-[12px] leading-relaxed text-label">
            Daily limits keep your own accounts safe: {channels.limits.linkedin_invites ?? 20} LinkedIn invites, {channels.limits.whatsapp_new_chats ?? 15} new WhatsApp chats. LinkedIn
            and WhatsApp can restrict accounts that message many people who do not answer, so write to investors who fit.
          </div>
        </div>
      )}
    </Card>
  );
}

/** Pick and buy a sending domain. Centrale pays for the first year. */
function DomainPicker({ onBought }: { onBought: (domain: string) => void }) {
  const toast = useToast();
  const [options, setOptions] = useState<DomainOption[] | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    callFunction<{ options: DomainOption[] }>("domains", { action: "suggest" })
      .then((r) => setOptions(r.options))
      .catch((err: unknown) => {
        setOptions([]);
        const msg = err instanceof Error ? err.message : "";
        setUnavailable(/not set up/i.test(msg) ? "Domain buying is not switched on yet." : "We could not check domain names just now.");
      });
  }, []);

  async function buy(domain: string) {
    setBuying(domain);
    try {
      await callFunction("domains", { action: "buy", domain });
      toast({ title: `${domain} is yours`, body: "We are setting it up. Your inbox moves onto it once it verifies, usually within the hour." });
      onBought(domain);
    } catch (err) {
      toast({ title: "Could not buy that domain", body: err instanceof Error ? err.message : undefined, tone: "error" });
      setBuying(null);
    }
  }

  if (!options) return <Skeleton className="h-9" />;
  if (unavailable || !options.length) {
    return (
      <p className="text-[12.5px] text-muted">
        {unavailable ?? "No short names are free for your company right now."}{" "}
        <Link href="/dashboard/domain" className="text-ink underline decoration-faint underline-offset-2">
          Connect a domain you own
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.slice(0, 4).map((o) => (
        <button
          key={o.domain}
          type="button"
          onClick={() => void buy(o.domain)}
          disabled={buying != null}
          className="rounded-[8px] border border-line bg-panel px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-ink disabled:opacity-60"
        >
          {buying === o.domain ? "Buying" : o.domain}
        </button>
      ))}
    </div>
  );
}

/**
 * The end of onboarding: a sending domain bought for them, and LinkedIn and WhatsApp a click away, so the trial
 * starts with every channel live.
 */
export function LaunchKit({ className }: { className?: string }) {
  const { channels, account, reload } = useChannels();
  const [bought, setBought] = useState<string | null>(null);
  // Founders who already have a domain (bought or their own) are not offered another.
  const [existing, setExisting] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    callFunction<{ domain: { domain: string } | null }>("domains", { action: "status" })
      .then((r) => setExisting(r.domain?.domain ?? null))
      .catch(() => setExisting(null));
  }, []);
  return (
    <div className={cn("rounded-[10px] border border-line bg-panel p-5 shadow-[0_18px_40px_-30px_rgba(57,28,37,0.3)]", className)}>
      <p className="text-[14px] font-medium text-ink">Switch on your channels</p>
      <p className="mt-0.5 text-[12.5px] text-muted">Optional, and you can do it later in Settings.</p>
      <div className="mt-3 border-t border-line pt-3">
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <Globe className="h-3.5 w-3.5" /> Your own sending domain, on us
        </p>
        <p className="mb-2 mt-0.5 text-[12.5px] text-muted">Investors trust email from a company domain. Pick one and we buy and set it up.</p>
        {bought || existing ? (
          <p className="text-[13px] text-ink">{bought ?? existing} is {bought ? "being set up" : "connected"}.</p>
        ) : existing === null ? (
          <DomainPicker onBought={setBought} />
        ) : (
          <Skeleton className="h-9" />
        )}
      </div>
      {channels?.configured && (
        <div className="mt-3 divide-y divide-line-2 border-t border-line">
          <ConnectRow provider="linkedin" account={account("linkedin")} configured onChange={reload} compact returnTo="/onboarding" />
          <ConnectRow provider="whatsapp" account={account("whatsapp")} configured onChange={reload} compact returnTo="/onboarding" />
        </div>
      )}
    </div>
  );
}
