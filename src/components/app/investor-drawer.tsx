"use client";

import { useEffect, useState } from "react";
import { Building2, Check, Copy, Eye, Globe, Lock, Mail, MapPin, MessageCircle, Phone, PhoneOff, Plus, Sparkles, Star } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Avatar, Pill, Skeleton } from "@/components/ui/kit";
import { createClient } from "@/lib/supabase/client";
import { formatFunding, isUpgradeError, reasonLabel, revealInvestor, toLimitError, type Contact, type DirectoryRow } from "@/lib/directory";
import { INVESTOR_TYPES, label, ROLES, SECTORS, STAGES, VALUES } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { LinkedInMark, XMark } from "./brand-icons";

interface Detail {
  headline: string | null;
  keywords: string[];
  thesis: string | null;
  firm_description: string | null;
  firm_linkedin: string | null;
  firm_twitter: string | null;
  firm_phone: string | null;
  firm_address: string | null;
  portfolio: string[];
  focus_note: string | null;
  unlocked: boolean;
  contact: Contact | null;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
      className="rounded-[5px] p-1 text-label hover:bg-black/[0.04] hover:text-ink"
      aria-label="Copy"
    >
      {done ? <Check className="h-3.5 w-3.5 text-green" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Chips({ items, map }: { items: string[]; map: Record<string, string> }) {
  if (!items.length) return <span className="text-[13px] text-faint">Not stated</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((s) => (
        <span key={s} className="rounded-[4px] border border-line-2 bg-panel-2 px-1.5 py-px text-[12px] text-muted">
          {label(map, s)}
        </span>
      ))}
    </div>
  );
}

const tel = (n: string) => n.replace(/[^\d+]/g, "");

export function InvestorDrawerBody({
  row,
  onEmail,
  onSave,
  onKeyword,
  selected,
  onSelect,
  onRevealed,
  revealsLeft,
}: {
  row: DirectoryRow;
  onEmail: () => void;
  onSave: () => void;
  onKeyword: (k: string) => void;
  selected: boolean;
  onSelect: () => void;
  onRevealed: (c: Contact) => void;
  revealsLeft: number | null;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<Error | null>(null);
  const [allKeywords, setAllKeywords] = useState(false);
  const [moreAbout, setMoreAbout] = useState(false);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setAllKeywords(false);
    setMoreAbout(false);
    setDetailError(null);
    setRevealError(null);
    void createClient()
      .rpc("investor_detail", { p_id: row.id })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setDetailError(toLimitError(error).message);
        else setDetail(data as Detail);
      });
    return () => {
      live = false;
    };
  }, [row.id]);

  const about = detail?.firm_description ?? detail?.thesis ?? null;
  const open = row.unlocked || Boolean(detail?.unlocked);
  const c: Contact | null = detail?.contact ?? (row.unlocked ? row : null);

  async function reveal() {
    setRevealing(true);
    setRevealError(null);
    try {
      const contact = await revealInvestor(row.id);
      setDetail((d) => (d ? { ...d, unlocked: true, contact } : d));
      onRevealed(contact);
    } catch (err) {
      setRevealError(err instanceof Error ? err : new Error("Could not reveal"));
    } finally {
      setRevealing(false);
    }
  }
  const keywords = detail?.keywords ?? [];
  const phones: { label: string; value: string; mobile?: boolean }[] = [
    ...(c?.mobile ? [{ label: "Mobile", value: c.mobile, mobile: true }] : []),
    ...(c?.direct_phone ? [{ label: "Direct line", value: c.direct_phone }] : []),
    ...(detail?.firm_phone ? [{ label: "Firm", value: detail.firm_phone }] : []),
  ];
  const hidden = [row.has_mobile && "mobile", row.has_direct && "direct line", row.has_linkedin && "LinkedIn", row.has_twitter && "X"].filter(
    Boolean,
  ) as string[];

  return (
    <div className="pb-10">
      <div className="graph-paper-faint border-b border-line px-6 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <Avatar name={row.full_name} className="h-11 w-11 text-[14px]" />
          <div className="min-w-0">
            <h3 className="truncate text-[20px] tracking-[-0.03em]">{row.full_name}</h3>
            <p className="truncate text-[13px] text-muted">{[row.title, row.firm].filter(Boolean).join(", ")}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          <Pill tone="burgundy">{label(ROLES, row.role)}</Pill>
          <Pill>{label(INVESTOR_TYPES, row.investor_type)}</Pill>
          {row.source === "test" && <Pill tone="amber">Test contact</Pill>}
        </div>

        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[12px] text-label">Fit with your startup</p>
            <p className="display tabular text-[40px] leading-none tracking-[-0.05em] text-display">{row.score}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {row.reasons.map((x) => (
              <Pill key={x} tone="green">
                {reasonLabel(x)}
              </Pill>
            ))}
          </div>
        </div>

        {row.pick_why && (
          <div className="mt-4 rounded-[8px] border border-[#ecdcbf] bg-amber-soft/60 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber">
              <Sparkles className="h-3.5 w-3.5" /> Claude pick #{row.pick_rank}
              {row.pick_fit ? <span className="font-normal text-label">, fit {row.pick_fit} of 5</span> : null}
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-body">{row.pick_why}</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={onEmail}>
            <Mail className="h-3.5 w-3.5" /> Draft intro email
          </Button>
          <Button size="sm" onClick={onSave}>
            <Star className={cn("h-3.5 w-3.5", row.saved && "fill-vermilion text-vermilion")} /> {row.saved ? "Saved" : "Save"}
          </Button>
          <Button size="sm" onClick={onSelect}>
            {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} {selected ? "In batch" : "Add to batch"}
          </Button>
        </div>
      </div>

      <div className="space-y-6 px-6 pt-6">
        <section>
          <p className="text-[12px] text-label">About {row.firm}</p>
          {!detail ? (
            <div className="mt-2 space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[92%]" />
              <Skeleton className="h-3 w-[70%]" />
            </div>
          ) : detailError ? (
            <p className="mt-1.5 text-[13.5px] text-pencil">{detailError}</p>
          ) : about ? (
            <>
              <p className={cn("mt-1.5 whitespace-pre-line border-l-2 border-vermilion/60 pl-3 text-[14px] leading-relaxed text-body", !moreAbout && "line-clamp-5")}>{about}</p>
              {about.length > 320 && (
                <button onClick={() => setMoreAbout((v) => !v)} className="mt-1 pl-3 text-[12.5px] text-label hover:text-ink">
                  {moreAbout ? "Show less" : "Read more"}
                </button>
              )}
            </>
          ) : (
            <p className="mt-1.5 text-[13.5px] text-faint">No description yet</p>
          )}
          {detail?.headline && <p className="mt-2 text-[13px] text-muted">{detail.headline}</p>}
        </section>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[13.5px]">
          {[
            ["Location", row.location ?? "Not stated"],
            ["Firm size", row.firm_employees ? `${row.firm_employees.toLocaleString("en-GB")} people` : "Not stated"],
            ["Firm has raised", formatFunding(row.firm_funding) ?? "Not stated"],
            ["Founded", row.firm_founded ?? "Not stated"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[12px] text-label">{k}</dt>
              <dd className="mt-0.5 text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <section className="space-y-3">
          <div>
            <p className="text-[12px] text-label">Stages</p>
            <div className="mt-1.5">
              <Chips items={row.stages} map={STAGES} />
            </div>
          </div>
          <div>
            <p className="text-[12px] text-label">Sectors</p>
            <div className="mt-1.5">
              <Chips items={row.sectors} map={SECTORS} />
            </div>
          </div>
          {row.values.length > 0 && (
            <div>
              <p className="text-[12px] text-label">Values</p>
              <div className="mt-1.5">
                <Chips items={row.values} map={VALUES} />
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between">
            <p className="text-[12px] text-label">Focus keywords</p>
            <p className="text-[11.5px] text-faint">Click one to filter by it</p>
          </div>
          {!detail ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {[70, 96, 58, 120, 84, 64].map((w, i) => (
                <Skeleton key={i} className="h-[22px]" style={{ width: w }} />
              ))}
            </div>
          ) : keywords.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {(allKeywords ? keywords : keywords.slice(0, 24)).map((k) => (
                <button
                  key={k}
                  onClick={() => onKeyword(k)}
                  className="rounded-[4px] border border-line bg-panel px-1.5 py-0.5 text-[12px] text-ink transition-colors hover:border-vermilion/50 hover:text-vermilion"
                >
                  {k}
                </button>
              ))}
              {keywords.length > 24 && (
                <button onClick={() => setAllKeywords((v) => !v)} className="px-1.5 text-[12px] text-label hover:text-ink">
                  {allKeywords ? "Fewer" : `All ${keywords.length}`}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-[13px] text-faint">None listed</p>
          )}
        </section>

        {detail && detail.portfolio.length > 0 && (
          <section>
            <p className="text-[12px] text-label">Portfolio</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {detail.portfolio.map((p) => (
                <span key={p} className="rounded-[5px] border border-line bg-panel px-2 py-0.5 text-[12.5px] text-ink">
                  {p}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-[8px] border border-line">
          <p className="border-b border-line-2 px-4 py-2 text-[12px] text-label">Contact</p>
          <div className="divide-y divide-line-2 text-[13.5px]">
            <div className="flex items-center gap-2.5 px-4 py-2.5">
              <Mail className="h-4 w-4 shrink-0 text-label" />
              {open && c ? (
                <>
                  <a href={`mailto:${c.email}`} className="min-w-0 truncate hover:text-vermilion">
                    {c.email}
                  </a>
                  <span className="ml-auto">
                    <CopyButton text={c.email} />
                  </span>
                </>
              ) : (
                <span className="min-w-0 truncate text-muted">{row.email}</span>
              )}
            </div>
            {!open && (
              <div className="bg-panel-2 px-4 py-3">
                <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  <Lock className="h-3.5 w-3.5" /> Email{hidden.length ? `, ${hidden.join(", ")}` : ""} hidden
                </p>
                <p className="mt-1 text-[12px] text-label">You can email them from Centrale without revealing anything. Revealing uses one credit.</p>
                {revealError ? (
                  <div className="mt-2">
                    <p className="text-[12.5px] text-pencil">{revealError.message}</p>
                    {isUpgradeError(revealError) && (
                      <ButtonLink href="/dashboard/billing" size="sm" variant="primary" className="mt-2">
                        See plans
                      </ButtonLink>
                    )}
                  </div>
                ) : (
                  <Button size="sm" className="mt-2" onClick={() => void reveal()} disabled={revealing}>
                    <Eye className="h-3.5 w-3.5" /> {revealing ? "Revealing" : "Reveal contact details"}
                    {revealsLeft != null && <span className="text-label">, {revealsLeft} left</span>}
                  </Button>
                )}
              </div>
            )}
            {phones.map((p) => (
              <div key={p.label} className="flex items-center gap-2.5 px-4 py-2.5">
                <Phone className="h-4 w-4 shrink-0 text-label" />
                <a href={`tel:${tel(p.value)}`} className="tabular hover:text-vermilion">
                  {p.value}
                </a>
                <span className="text-[12px] text-label">{p.label}</span>
                <span className="ml-auto flex items-center gap-1">
                  {p.mobile && (
                    <a
                      href={`https://wa.me/${tel(p.value).replace("+", "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-[5px] border border-line px-2 py-0.5 text-[12px] text-green hover:border-green/40"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  )}
                  <CopyButton text={p.value} />
                </span>
              </div>
            ))}
            {row.do_not_call && (
              <div className="flex items-start gap-2.5 bg-pencil-soft/50 px-4 py-2.5 text-[12.5px] text-pencil">
                <PhoneOff className="mt-0.5 h-4 w-4 shrink-0" />
                A mobile number for this person is on a do-not-call list, so it is hidden.
              </div>
            )}
            {c?.linkedin_url && (
              <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-black/[0.02]">
                <LinkedInMark className="h-4 w-4 shrink-0 text-label" /> LinkedIn profile
              </a>
            )}
            {c?.twitter_url && (
              <a href={c.twitter_url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-black/[0.02]">
                <XMark className="h-4 w-4 shrink-0 text-label" /> {c.twitter_url.replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//, "@").replace(/^@@/, "@")}
              </a>
            )}
            {row.website_url && (
              <a href={row.website_url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-black/[0.02]">
                <Globe className="h-4 w-4 shrink-0 text-label" /> {row.website_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            )}
            {detail?.firm_linkedin && (
              <a href={detail.firm_linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-black/[0.02]">
                <Building2 className="h-4 w-4 shrink-0 text-label" /> {row.firm} on LinkedIn
              </a>
            )}
            {detail?.firm_address && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 text-muted">
                <MapPin className="h-4 w-4 shrink-0 text-label" /> {detail.firm_address}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
