"use client";

import { useEffect, useState } from "react";
import { Building2, Check, Copy, Eye, Globe, Lock, Mail, MapPin, Phone, Plus, Sparkles, Star } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Avatar, Pill, Skeleton } from "@/components/ui/kit";
import { investorDetail, isUpgradeError, reasonLabel, revealInvestor, type Contact, type DirectoryRow, type InvestorDetail } from "@/lib/directory";
import { INVESTOR_TYPES, label, ROLES } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { LinkedInMark } from "./brand-icons";
import { useApp } from "./context";
import { locationLabel, sizeLabel } from "./investor-table";

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

function Chips({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-[13px] text-faint">Not stated</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((s) => (
        <span key={s} className="rounded-[4px] border border-line-2 bg-panel-2 px-1.5 py-px text-[12px] text-muted">
          {s}
        </span>
      ))}
    </div>
  );
}

const tel = (n: string) => n.replace(/[^\d+]/g, "");
const masked = (v: string) => v.includes("•");
const bareUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const href = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
const splitEmails = (s: string | null) =>
  (s ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));

const SPECIALTIES_SHOWN = 24;

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
  const { ent } = useApp();
  const trial = ent != null && !ent.paid;
  const [detail, setDetail] = useState<InvestorDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<Error | null>(null);
  const [allSpecialties, setAllSpecialties] = useState(false);
  const [moreAbout, setMoreAbout] = useState(false);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setAllSpecialties(false);
    setMoreAbout(false);
    setDetailError(null);
    setRevealError(null);
    investorDetail(row.id).then(
      (d) => live && setDetail(d),
      (err: unknown) => live && setDetailError(err instanceof Error ? err.message : "Could not load this investor"),
    );
    return () => {
      live = false;
    };
  }, [row.id]);

  const open = row.unlocked || Boolean(detail?.unlocked);
  // Masked until revealed: the detail's contact when loaded, the row's masked values before that.
  const c: Contact = detail?.contact ?? { email: row.email, other_emails: null, phone: row.phone, linkedin_url: row.linkedin_url };
  const email = c.email ?? (row.has_email ? row.email : null);
  const phone = c.phone ?? (row.has_phone ? row.phone : null);
  const others = open ? splitEmails(c.other_emails).filter((e) => e !== email) : [];
  const canReveal = !open && (row.has_email || row.has_phone || row.has_linkedin);

  const stages = detail?.stages ?? row.stages;
  const focus = detail?.focus ?? row.focus;
  const industry = detail?.industry ?? row.industry;
  const size = sizeLabel(detail?.size ?? row.size);
  const founded = detail?.founded ?? row.founded;
  const website = detail?.firm_website ?? row.firm_website;
  const firmLinkedin = detail?.firm_linkedin ?? row.firm_linkedin;
  const headline = row.headline ?? detail?.headline ?? null;
  const location = locationLabel(row);
  const about = detail?.about ?? null;
  const specialties = detail?.specialties ?? [];

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

  const hidden = [row.has_email && "email", row.has_phone && "phone", row.has_linkedin && "LinkedIn"].filter(Boolean) as string[];

  return (
    <div className="pb-10">
      <div className="graph-paper-faint border-b border-line px-6 pb-5 pt-6">
        <div className="flex items-center gap-3">
          <Avatar name={row.full_name} className="h-11 w-11 text-[14px]" />
          <div className="min-w-0">
            <h3 className="truncate text-[20px] tracking-[-0.03em]">{row.full_name}</h3>
            <p className="truncate text-[13px] text-muted">{row.title ? `${row.title} at ${row.firm}` : row.firm}</p>
          </div>
        </div>
        {headline && <p className="mt-3 text-[13.5px] leading-relaxed text-body">{headline}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-1">
          <Pill tone="burgundy">{label(ROLES, row.role)}</Pill>
          {row.investor_type && <Pill>{label(INVESTOR_TYPES, row.investor_type)}</Pill>}
          {location && (
            <span className="ml-1 inline-flex items-center gap-1 text-[12.5px] text-muted">
              <MapPin className="h-3.5 w-3.5 text-label" /> {location}
            </span>
          )}
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
              <Sparkles className="h-3.5 w-3.5" /> Claude pick{row.pick_rank != null ? ` #${row.pick_rank}` : ""}
              {row.pick_fit ? <span className="font-normal text-label">, fit {row.pick_fit} of 5</span> : null}
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-body">{row.pick_why}</p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <span title={row.has_email ? undefined : "No email on file"}>
            <Button variant="primary" size="sm" onClick={onEmail} disabled={!row.has_email}>
              <Mail className="h-3.5 w-3.5" /> Draft intro email
            </Button>
          </span>
          <Button size="sm" onClick={onSave}>
            <Star className={cn("h-3.5 w-3.5", row.saved && "fill-vermilion text-vermilion")} /> {row.saved ? "Saved" : "Save"}
          </Button>
          <Button size="sm" onClick={onSelect}>
            {selected ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} {selected ? "In batch" : "Add to batch"}
          </Button>
        </div>
      </div>

      <div className="space-y-6 px-6 pt-6">
        <section className="space-y-3">
          <div>
            <p className="text-[12px] text-label">Stages</p>
            <div className="mt-1.5">
              <Chips items={stages} />
            </div>
          </div>
          <div>
            <p className="text-[12px] text-label">Sector focus</p>
            <div className="mt-1.5">
              <Chips items={focus} />
            </div>
          </div>
        </section>

        <section className="rounded-[8px] border border-line">
          <p className="flex items-center gap-1.5 border-b border-line-2 px-4 py-2 text-[12px] text-label">
            <Building2 className="h-3.5 w-3.5" /> {row.firm}
          </p>
          <div className="px-4 py-3">
            <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-[13.5px]">
              {[
                ["Industry", industry ?? "Not stated"],
                ["Size", size ?? "Not stated"],
                ["Founded", founded ?? "Not stated"],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[12px] text-label">{k}</dt>
                  <dd className="mt-0.5 truncate text-ink">{v}</dd>
                </div>
              ))}
            </dl>

            {(website || firmLinkedin) && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
                {website && (
                  <a href={href(website)} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1.5 text-ink hover:text-vermilion">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-label" />
                    <span className="truncate">{bareUrl(website)}</span>
                  </a>
                )}
                {firmLinkedin && (
                  <a href={href(firmLinkedin)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ink hover:text-vermilion">
                    <LinkedInMark className="h-3.5 w-3.5 shrink-0 text-label" /> Firm on LinkedIn
                  </a>
                )}
              </div>
            )}

            <div className="mt-3 border-t border-line-2 pt-3">
              <p className="text-[12px] text-label">About</p>
              {detailError ? (
                <p className="mt-1.5 text-[13.5px] text-pencil">{detailError}</p>
              ) : !detail ? (
                <div className="mt-2 space-y-1.5">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-[92%]" />
                  <Skeleton className="h-3 w-[70%]" />
                </div>
              ) : about ? (
                <>
                  <p className={cn("mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-body", !moreAbout && "line-clamp-5")}>{about}</p>
                  {about.length > 320 && (
                    <button onClick={() => setMoreAbout((v) => !v)} className="mt-1 text-[12.5px] text-label hover:text-ink">
                      {moreAbout ? "Show less" : "Show more"}
                    </button>
                  )}
                </>
              ) : (
                <p className="mt-1.5 text-[13.5px] text-faint">No description yet</p>
              )}
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between">
            <p className="text-[12px] text-label">Specialties</p>
            <p className="text-[11.5px] text-faint">Click one to filter by it</p>
          </div>
          {!detail && !detailError ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {[70, 96, 58, 120, 84, 64].map((w, i) => (
                <Skeleton key={i} className="h-[22px]" style={{ width: w }} />
              ))}
            </div>
          ) : specialties.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {(allSpecialties ? specialties : specialties.slice(0, SPECIALTIES_SHOWN)).map((k) => (
                <button
                  key={k}
                  onClick={() => onKeyword(k)}
                  className="rounded-[4px] border border-line bg-panel px-1.5 py-0.5 text-[12px] text-ink transition-colors hover:border-vermilion/50 hover:text-vermilion"
                >
                  {k}
                </button>
              ))}
              {specialties.length > SPECIALTIES_SHOWN && (
                <button onClick={() => setAllSpecialties((v) => !v)} className="px-1.5 text-[12px] text-label hover:text-ink">
                  {allSpecialties ? "Fewer" : `All ${specialties.length}`}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-[13px] text-faint">None listed</p>
          )}
        </section>

        <section className="rounded-[8px] border border-line">
          <p className="border-b border-line-2 px-4 py-2 text-[12px] text-label">Contact</p>
          <div className="divide-y divide-line-2 text-[13.5px]">
            <div className="flex items-center gap-2.5 px-4 py-2.5">
              <Mail className="h-4 w-4 shrink-0 text-label" />
              {!email ? (
                <span className="text-faint">No email on file</span>
              ) : open && !masked(email) ? (
                <>
                  <a href={`mailto:${email}`} className="min-w-0 truncate hover:text-vermilion">
                    {email}
                  </a>
                  <span className="ml-auto">
                    <CopyButton text={email} />
                  </span>
                </>
              ) : (
                <span className="min-w-0 truncate text-muted">{email}</span>
              )}
            </div>

            {others.map((e) => (
              <div key={e} className="flex items-center gap-2.5 px-4 py-2.5">
                <Mail className="h-4 w-4 shrink-0 text-faint" />
                <a href={`mailto:${e}`} className="min-w-0 truncate hover:text-vermilion">
                  {e}
                </a>
                <span className="text-[12px] text-label">Other</span>
                <span className="ml-auto">
                  <CopyButton text={e} />
                </span>
              </div>
            ))}

            {phone && (
              <div className="flex items-center gap-2.5 px-4 py-2.5">
                <Phone className="h-4 w-4 shrink-0 text-label" />
                {open && !masked(phone) ? (
                  <>
                    <a href={`tel:${tel(phone)}`} className="tabular hover:text-vermilion">
                      {phone}
                    </a>
                    <span className="ml-auto">
                      <CopyButton text={phone} />
                    </span>
                  </>
                ) : (
                  // Masked numbers are text only: nothing to call or copy yet.
                  <span className="tabular text-muted">{phone}</span>
                )}
              </div>
            )}

            {open && c.linkedin_url && (
              <a href={href(c.linkedin_url)} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-black/[0.02]">
                <LinkedInMark className="h-4 w-4 shrink-0 text-label" /> LinkedIn profile
              </a>
            )}

            {canReveal && (
              <div className="bg-panel-2 px-4 py-3">
                <p className="flex items-center gap-1.5 text-[12.5px] text-muted">
                  <Lock className="h-3.5 w-3.5" /> Full {hidden.join(", ")} hidden
                </p>
                <p className="mt-1 text-[12px] text-label">
                  {trial
                    ? "Full contact details show when your plan starts, after the 7-day trial."
                    : row.has_email
                      ? "You can email them from Centrale without revealing anything. Revealing uses one credit."
                      : "Revealing uses one credit."}
                </p>
                {trial ? (
                  <ButtonLink href="/dashboard/billing" size="sm" className="mt-2">
                    See your plan
                  </ButtonLink>
                ) : revealError ? (
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
          </div>
        </section>
      </div>
    </div>
  );
}
