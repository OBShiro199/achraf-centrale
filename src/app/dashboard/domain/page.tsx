"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, RefreshCw } from "lucide-react";
import { useApp } from "@/components/app/context";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { Card, CardHeader, Pill, Settle, Skeleton } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { callFunction } from "@/lib/supabase/client";
import type { SendingDomain } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

type Rec = SendingDomain["records"][number];
type Status = { domain: SendingDomain | null; inbox: { address: string; domain: string | null } | null };

const POLL_MS = 15_000;
const TWO_PART_SUFFIXES = new Set(["co.uk", "org.uk", "ac.uk", "com.au", "net.au", "co.nz", "co.za", "com.br", "co.in", "co.jp", "com.sg", "com.mx"]);

/** The registered domain a DNS provider manages, e.g. mail.acme.co.uk -> acme.co.uk. */
function zoneOf(domain: string) {
  const parts = domain.split(".");
  const two = parts.slice(-2).join(".");
  return TWO_PART_SUFFIXES.has(two) ? parts.slice(-3).join(".") : two;
}

/** What to type in the provider's Name or Host box: the record name without the zone, or @ for the zone itself. */
function hostFor(name: string, zone: string) {
  const n = name.replace(/\.$/, "").toLowerCase();
  if (n === zone) return "@";
  return n.endsWith(`.${zone}`) ? n.slice(0, -(zone.length + 1)) : n;
}

const STATUS: Record<SendingDomain["status"], { label: string; tone: "neutral" | "green" | "red" | "amber"; note: string }> = {
  pending: { label: "Waiting for DNS", tone: "amber", note: "Add the records below at your DNS provider. We check automatically." },
  verifying: { label: "Checking", tone: "amber", note: "We found some of your records and are checking the rest. This usually takes a few minutes." },
  verified: { label: "Verified", tone: "green", note: "Your domain is ready to send and receive email." },
  failed: { label: "Records missing", tone: "red", note: "Some records are missing or wrong. Fix the ones marked below, then press Check now." },
  under_review: { label: "Under review", tone: "amber", note: "Our mail provider is reviewing this domain before it can be used. This can take up to a day." },
  removed: { label: "Removed", tone: "neutral", note: "" },
};

const PURPOSE: Record<string, string> = {
  mx: "Routes replies to your inbox.",
  dkim: "Proves the email really comes from you.",
  "return-path": "Lets bounces come back, so SPF passes.",
  spf: "Authorises our mail servers. If this host already has a v=spf1 record, add the include to it instead of adding a second one.",
  dmarc: "Tells mailbox providers what to do with mail that fails checks. If you already have a _dmarc record here, keep yours.",
};

function CopyText({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1300);
      }}
      className={cn("group flex min-w-0 items-start gap-1.5 rounded-[4px] text-left font-mono text-[12px] text-ink hover:text-burgundy", className)}
      title="Copy"
    >
      <span className="min-w-0 break-all">{value}</span>
      {copied ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-green" /> : <Copy className="mt-0.5 h-3 w-3 shrink-0 text-faint group-hover:text-muted" />}
    </button>
  );
}

function RecordStatus({ status }: { status?: Rec["status"] }) {
  if (status === "valid") return <Pill tone="green">Found</Pill>;
  if (status === "invalid") return <Pill tone="red">Wrong value</Pill>;
  return <Pill>Not found yet</Pill>;
}

function Records({ domain }: { domain: SendingDomain }) {
  const zone = zoneOf(domain.domain);
  const apexMx = domain.records.some((r) => r.type === "MX" && hostFor(r.name, zone) === "@" && r.purpose === "mx");
  return (
    <Card>
      <CardHeader
        title="DNS records"
        sub={`Add these at the company that manages DNS for ${zone} (for example Cloudflare, GoDaddy, Namecheap or Squarespace). Paste each value exactly.`}
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-[11.5px] text-label">
              <th className="px-5 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Name / Host</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Priority</th>
              <th className="px-5 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {domain.records.map((r, i) => (
              <tr key={`${r.type}-${r.name}-${i}`} className="border-b border-line align-top last:border-0">
                <td className="px-5 py-3 font-semibold text-ink">{r.type}</td>
                <td className="max-w-[200px] px-3 py-3">
                  <CopyText value={hostFor(r.name, zone)} />
                  <p className="mt-1 break-all text-[11px] text-label">{r.name}</p>
                </td>
                <td className="max-w-[320px] px-3 py-3">
                  <CopyText value={r.value} />
                  {r.purpose && PURPOSE[r.purpose] && <p className="mt-1 text-[11.5px] leading-snug text-muted">{PURPOSE[r.purpose]}</p>}
                </td>
                <td className="px-3 py-3 tabular text-body">{r.priority ?? ""}</td>
                <td className="px-5 py-3">
                  <RecordStatus status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-1.5 border-t border-line bg-panel-2 px-5 py-3 text-[12px] text-muted">
        <p>
          Some providers add {zone} to the host for you, so enter only the Name / Host column (for example <span className="font-mono">omail._domainkey</span>). If a
          provider asks for the full name, use the grey line under it.
        </p>
        <p>Cloudflare: set CNAME records to DNS only (grey cloud), not proxied.</p>
        {apexMx && (
          <p className="text-ink">
            The MX record is on {zone} itself, so all email to {zone} would come to Centrale. If you already receive email at {zone}, remove this domain and use a
            subdomain such as mail.{zone} instead.
          </p>
        )}
      </div>
    </Card>
  );
}

function SwitchInbox({ domain, onDone }: { domain: SendingDomain; onDone: () => void }) {
  const { profile } = useApp();
  const toast = useToast();
  const [mailbox, setMailbox] = useState(() => (profile.first_name ?? "hello").toLowerCase().replace(/[^a-z0-9]/g, "") || "hello");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const { inbox } = await callFunction<{ inbox: { address: string } }>("domains", { action: "switch", mailbox });
      toast({ title: "Inbox switched", body: `New emails now send from ${inbox.address}. Replies to your old address still arrive.` });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch your inbox");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <p className="text-[14px] font-semibold text-ink">Send from {domain.domain}</p>
      <p className="mt-1 max-w-[620px] text-[13px] text-muted">
        Choose the name before the @. We create your new address on {domain.domain} and new emails send from it. Your old address keeps receiving replies, and its
        threads stay in your inbox.
      </p>
      <div className="mt-4 flex max-w-[520px] items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-[6px] border border-line bg-panel focus-within:border-[#cbbcab]">
          <input
            value={mailbox}
            onChange={(e) => setMailbox(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
            maxLength={30}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[14px] text-ink outline-none"
            aria-label="Mailbox name"
          />
          <span className="truncate pr-3 text-[14px] text-muted">@{domain.domain}</span>
        </div>
        <Button variant="primary" onClick={() => void go()} disabled={busy || mailbox.length < 3}>
          {busy ? "Switching" : "Switch inbox"}
        </Button>
      </div>
      <FormError>{error}</FormError>
    </Card>
  );
}

function AddDomain({ onAdded }: { onAdded: (s: Status) => void }) {
  const { startup } = useApp();
  const root = startup.domain ?? "yourcompany.com";
  const [value, setValue] = useState(`mail.${root}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      onAdded(await callFunction<Status>("domains", { action: "add", domain: value }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that domain");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <p className="text-[14px] font-semibold text-ink">Connect a domain</p>
      <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-muted">
        Investors are more likely to open email from your own domain than from a shared address. We recommend a subdomain such as{" "}
        <span className="font-medium text-ink">mail.{root}</span>: your existing email on {root} keeps working exactly as it does now. You can also use a separate
        domain you own.
      </p>
      <form
        className="mt-4 flex max-w-[520px] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={`mail.${root}`} aria-label="Domain" className="flex-1" />
        <Button variant="primary" type="submit" disabled={busy || value.trim().length < 4}>
          {busy ? "Adding" : "Add domain"}
        </Button>
      </form>
      <FormError>{error}</FormError>
      <ol className="mt-5 grid gap-3 text-[12.5px] text-body sm:grid-cols-4">
        {["Add your domain", "Copy the DNS records to your provider", "We verify them, usually in minutes", "Switch your inbox to the new address"].map((s, i) => (
          <li key={s} className="flex gap-2">
            <span className="tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-burgundy text-[11px] font-semibold text-ivory">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function DomainPage() {
  const { ent } = useApp();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<Status | null>(null);
  const [checking, setChecking] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await callFunction<Status>("domains", { action: "status" }));
    } catch (err) {
      toast({ title: "Could not load your domain", body: err instanceof Error ? err.message : undefined, tone: "error" });
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const domain = state?.domain ?? null;
  const verified = domain?.status === "verified";

  // Keep checking while the page is open and DNS is not verified yet.
  useEffect(() => {
    if (!domain || verified) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [domain, verified, load]);

  async function check() {
    setChecking(true);
    try {
      setState(await callFunction<Status>("domains", { action: "check" }));
    } catch (err) {
      toast({ title: "Could not check now", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setChecking(false);
    }
  }

  async function remove() {
    if (!domain || !window.confirm(`Remove ${domain.domain}? You can add it again later.`)) return;
    setRemoving(true);
    try {
      setState(await callFunction<Status>("domains", { action: "remove" }));
    } catch (err) {
      toast({ title: "Could not remove the domain", body: err instanceof Error ? err.message : undefined, tone: "error" });
    } finally {
      setRemoving(false);
    }
  }

  const valid = useMemo(() => domain?.records.filter((r) => r.status === "valid").length ?? 0, [domain]);
  const onDomain = Boolean(domain && state?.inbox?.domain === domain.domain);

  if (ent && !ent.active) {
    return (
      <div className="mx-auto max-w-[860px] px-4 py-8 md:px-8">
        <Card className="p-6">
          <p className="text-[15px] font-semibold text-ink">Start your free trial to connect a domain</p>
          <p className="mt-1 text-[13px] text-muted">Your inbox and custom domain come with the trial.</p>
          <ButtonLink href="/dashboard/billing" variant="primary" size="sm" className="mt-4">
            Go to billing
          </ButtonLink>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-5 px-4 py-8 md:px-8">
      <Settle className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[26px] tracking-[-0.04em]">Custom domain</h2>
          <p className="mt-1 text-[14px] text-muted">
            {state ? (
              state.inbox ? (
                <>
                  Your inbox sends from <span className="font-medium text-ink">{state.inbox.address}</span>
                </>
              ) : (
                "Your inbox is being set up."
              )
            ) : (
              <Skeleton className="inline-block h-3 w-64 align-middle" />
            )}
          </p>
        </div>
      </Settle>

      {!state ? (
        <Card className="p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-3 w-full max-w-[520px]" />
          <Skeleton className="mt-2 h-9 w-full max-w-[520px]" />
        </Card>
      ) : !domain ? (
        <Settle delay={40}>
          <AddDomain onAdded={setState} />
        </Settle>
      ) : (
        <>
          <Settle delay={40}>
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[17px] font-semibold tracking-[-0.02em] text-ink">{domain.domain}</p>
                    <Pill tone={STATUS[domain.status].tone}>{STATUS[domain.status].label}</Pill>
                  </div>
                  <p className="mt-1 max-w-[620px] text-[13px] text-muted">
                    {onDomain ? `Your inbox sends from ${state.inbox?.address}.` : STATUS[domain.status].note}
                  </p>
                  {!verified && domain.records.length > 0 && (
                    <p className="mt-1 text-[12px] text-label">
                      {valid} of {domain.records.length} records found{domain.checked_at ? `, checked ${timeAgo(domain.checked_at)}` : ""}. DNS changes usually show within
                      minutes but can take up to 48 hours.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {!verified && (
                    <Button size="sm" onClick={() => void check()} disabled={checking}>
                      <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} /> {checking ? "Checking" : "Check now"}
                    </Button>
                  )}
                  {!onDomain && (
                    <Button size="sm" variant="ghost" onClick={() => void remove()} disabled={removing}>
                      {removing ? "Removing" : "Remove"}
                    </Button>
                  )}
                </div>
              </div>
              {domain.warnings.length > 0 && (
                <div className="mt-4 space-y-2">
                  {domain.warnings.map((w) => (
                    <p key={w.code} className="flex gap-2 rounded-[6px] border border-[#ecdcbf] bg-amber-soft/60 px-3 py-2 text-[12.5px] text-ink">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
                      {w.message}
                    </p>
                  ))}
                </div>
              )}
              {domain.message && !verified && <p className="mt-3 text-[12.5px] text-muted">{domain.message}</p>}
            </Card>
          </Settle>

          {verified && !onDomain && (
            <Settle delay={60}>
              <SwitchInbox
                domain={domain}
                onDone={() => {
                  void load();
                  router.refresh();
                }}
              />
            </Settle>
          )}

          {!onDomain && domain.records.length > 0 && (
            <Settle delay={80}>
              <Records domain={domain} />
            </Settle>
          )}
        </>
      )}

      <p className="text-[12.5px] text-label">
        How this works, and what each record does, is in the{" "}
        <a href="/dashboard/docs#custom-domain" className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink">
          docs
        </a>
        .
      </p>
    </div>
  );
}
