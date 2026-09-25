"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FileText, RefreshCw, Upload } from "lucide-react";
import { useApp } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card, CardHeader, Pill, Settle } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { ValueIcon } from "@/components/onboarding/icons";
import { BrandMark } from "@/components/landing/logo";
import { Hand } from "@/components/sketch/hand";
import { callFunction, createClient } from "@/lib/supabase/client";
import { HEADCOUNT, INVESTOR_TYPES, REVENUE, SECTORS, STAGES, VALUES } from "@/lib/taxonomy";
import type { Startup } from "@/lib/types";
import { cn, DECK_EXTENSIONS, DECK_MAX_BYTES, timeAgo } from "@/lib/utils";

const EDITABLE = [
  "name", "one_liner", "summary", "mission", "goal", "sectors", "headcount", "values", "stage",
  "investor_types", "revenue_band", "raise_amount", "location", "traction", "wants_generated_deck",
] as const;
type Editable = Pick<Startup, (typeof EDITABLE)[number]>;

function pick(s: Startup): Editable {
  return Object.fromEntries(EDITABLE.map((k) => [k, s[k]])) as Editable;
}

function ChipSet({ options, value, onChange, icons }: { options: Record<string, string>; value: string[]; onChange: (v: string[]) => void; icons?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(options).map(([k, l]) => {
        const on = value.includes(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-[6px] border px-2.5 text-[13px] transition-colors",
              on ? "border-[#b9a79c] bg-[#f4ede3] text-ink" : "border-line bg-panel text-muted hover:border-[#d5c8ba] hover:text-ink",
            )}
          >
            {icons && (
              <span className="-ml-1 scale-[0.6]">
                <ValueIcon value={k} active={on} />
              </span>
            )}
            {l}
          </button>
        );
      })}
    </div>
  );
}

export default function ProfilePage() {
  const { startup, setStartup } = useApp();
  const toast = useToast();
  const [form, setForm] = useState<Editable>(() => pick(startup));
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(pick(startup)), [form, startup]);
  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.from("startups").update(form).eq("id", startup.id).select().single<Startup>();
    setSaving(false);
    if (error) return toast({ title: "Could not save", body: error.message, tone: "error" });
    setStartup(data);
    setForm(pick(data));
    toast({ title: "Profile saved", body: "Fit scores update straight away." });
  }

  async function rebuild() {
    if (dirty && !confirm("Rewriting replaces the summary, mission and goal with a fresh draft. Unsaved edits will be lost. Continue?")) return;
    setRebuilding(true);
    try {
      if (startup.domain) await callFunction("scrape-site", { domain: startup.domain });
      const r = await callFunction<{ startup: Startup }>("build-profile");
      setStartup(r.startup);
      setForm(pick(r.startup));
      toast({ title: "Profile rewritten", body: "Read it through and edit anything that is off." });
    } catch (e) {
      toast({ title: "Could not rewrite", body: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setRebuilding(false);
    }
  }

  async function uploadDeck(file: File | undefined) {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!DECK_EXTENSIONS.includes(ext)) return toast({ title: "Use a PDF, PPTX, PPT, KEY or DOCX file", tone: "error" });
    if (file.size > DECK_MAX_BYTES) return toast({ title: "That file is over 50 MB", tone: "error" });
    setUploading(true);
    const supabase = createClient();
    const path = `${startup.owner_id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await supabase.storage.from("decks").upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
    if (error) {
      setUploading(false);
      return toast({ title: "Upload failed", body: error.message, tone: "error" });
    }
    const { data } = await supabase
      .from("startups")
      .update({ deck_path: path, deck_filename: file.name, deck_mime: file.type || null, deck_uploaded_at: new Date().toISOString(), wants_generated_deck: false })
      .eq("id", startup.id)
      .select()
      .single<Startup>();
    setUploading(false);
    if (data) {
      setStartup(data);
      setForm(pick(data));
    }
    toast({ title: "Deck uploaded", body: ext === ".pdf" ? "Use Rewrite to fold it into your profile." : "Stored as your source of truth." });
  }

  async function downloadDeck() {
    if (!startup.deck_path) return;
    const { data } = await createClient().storage.from("decks").createSignedUrl(startup.deck_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="mx-auto max-w-[980px] px-4 py-8 pb-28 md:px-8">
      <Settle className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {startup.favicon_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={startup.favicon_url} alt="" className="h-11 w-11 rounded-[8px] border border-line bg-panel object-contain p-1.5" />
          )}
          <div>
            <h2 className="text-[26px] tracking-[-0.04em]">{startup.name}</h2>
            <p className="text-[13.5px] text-muted">
              <a href={startup.website_url ?? "#"} target="_blank" rel="noreferrer" className="hover:text-ink">
                {startup.domain}
              </a>
              {startup.analysed_at && <span className="text-label">, profile written {timeAgo(startup.analysed_at)}</span>}
            </p>
          </div>
        </div>
        <Button onClick={() => void rebuild()} disabled={rebuilding}>
          {rebuilding ? <BrandMark className="h-3.5 w-3.5" pulse /> : <RefreshCw className="h-3.5 w-3.5" />}
          {rebuilding ? "Rewriting from your site" : "Rewrite from website"}
        </Button>
      </Settle>

      <div className="mt-6 space-y-5">
        <Settle delay={60}>
          <Card className="overflow-hidden">
            <div className="margin-rule graph-paper-faint px-5 py-5 pl-16">
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] text-label">Written by Claude from your website{startup.deck_filename?.toLowerCase().endsWith(".pdf") ? " and deck" : ""}</p>
                <Hand className="text-[18px]" tone="pencil">
                  edit freely
                </Hand>
              </div>
              <div className="mt-4 space-y-4">
                <Field label="One-liner">
                  <Input value={form.one_liner ?? ""} onChange={(e) => set("one_liner", e.target.value)} />
                </Field>
                <Field label="Who you are">
                  <Textarea value={form.summary ?? ""} onChange={(e) => set("summary", e.target.value)} rows={5} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Mission">
                    <Textarea value={form.mission ?? ""} onChange={(e) => set("mission", e.target.value)} rows={3} className="min-h-[84px]" />
                  </Field>
                  <Field label="What this raise is for">
                    <Textarea value={form.goal ?? ""} onChange={(e) => set("goal", e.target.value)} rows={3} className="min-h-[84px]" />
                  </Field>
                </div>
                {startup.keywords.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[13px] font-medium text-ink">Keywords investors will match on</p>
                    <div className="flex flex-wrap gap-1.5">
                      {startup.keywords.map((k) => (
                        <Pill key={k}>{k}</Pill>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </Settle>

        <Settle delay={120}>
          <Card>
            <CardHeader title="Company" />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Company name">
                <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <Field label="Headquarters">
                <Input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="City, country" />
              </Field>
              <Field label="Team size">
                <Select value={form.headcount ?? ""} onChange={(e) => set("headcount", e.target.value)}>
                  {Object.entries(HEADCOUNT).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <div />
              <div className="md:col-span-2">
                <p className="mb-1.5 text-[13px] font-medium text-ink">Sectors</p>
                <ChipSet options={SECTORS} value={form.sectors} onChange={(v) => set("sectors", v)} />
              </div>
              <div className="md:col-span-2">
                <p className="mb-1.5 text-[13px] font-medium text-ink">Values</p>
                <ChipSet options={VALUES} value={form.values} onChange={(v) => set("values", v)} icons />
              </div>
            </div>
          </Card>
        </Settle>

        <Settle delay={180}>
          <Card>
            <CardHeader title="Fundraise" sub="These drive your fit scores." />
            <div className="grid gap-4 p-5 md:grid-cols-3">
              <Field label="Round">
                <Select value={form.stage ?? ""} onChange={(e) => set("stage", e.target.value)}>
                  {Object.entries(STAGES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Raising">
                <Input value={form.raise_amount ?? ""} onChange={(e) => set("raise_amount", e.target.value)} placeholder="$1.5m" />
              </Field>
              <Field label="Monthly revenue">
                <Select value={form.revenue_band ?? ""} onChange={(e) => set("revenue_band", e.target.value)}>
                  {Object.entries(REVENUE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="md:col-span-3">
                <p className="mb-1.5 text-[13px] font-medium text-ink">Investor types you want</p>
                <ChipSet options={INVESTOR_TYPES} value={form.investor_types} onChange={(v) => set("investor_types", v)} />
              </div>
              <Field label="Traction" className="md:col-span-3" hint="One fact per line. Claude uses these in first emails.">
                <Textarea value={form.traction ?? ""} onChange={(e) => set("traction", e.target.value)} rows={4} />
              </Field>
            </div>
          </Card>
        </Settle>

        <Settle delay={240}>
          <Card>
            <CardHeader title="Pitch deck" sub="PDF, PPTX, PPT, KEY or DOCX, up to 50 MB" />
            <div className="flex flex-wrap items-center gap-4 p-5">
              <input ref={fileRef} type="file" accept={DECK_EXTENSIONS.join(",")} className="hidden" onChange={(e) => void uploadDeck(e.target.files?.[0])} />
              {startup.deck_path ? (
                <>
                  <span className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-line bg-panel-2">
                    <FileText className="h-5 w-5 text-vermilion" strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{startup.deck_filename}</p>
                    <p className="text-[12.5px] text-label">Uploaded {startup.deck_uploaded_at ? timeAgo(startup.deck_uploaded_at) : ""}</p>
                  </div>
                  <Button size="sm" onClick={() => void downloadDeck()}>
                    <Download className="h-3.5 w-3.5" /> Open
                  </Button>
                </>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">{form.wants_generated_deck ? "We will draft a deck for you" : "No deck yet"}</p>
                  <p className="text-[12.5px] text-label">
                    {form.wants_generated_deck ? "Built from your website and answers. You can still upload your own." : "Upload one, or ask us to draft it."}
                  </p>
                </div>
              )}
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading" : startup.deck_path ? "Replace" : "Upload"}
              </Button>
              {!startup.deck_path && (
                <label className="flex items-center gap-2 text-[13px] text-muted">
                  <input type="checkbox" checked={form.wants_generated_deck} onChange={(e) => set("wants_generated_deck", e.target.checked)} className="accent-[#391c25]" />
                  Draft one for me
                </label>
              )}
            </div>
          </Card>
        </Settle>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur transition-transform duration-300 lg:left-[244px]",
          dirty ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="mx-auto flex max-w-[980px] items-center justify-between px-4 py-3 md:px-8">
          <p className="text-[13px] text-muted">You have unsaved changes.</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setForm(pick(startup))}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
