"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, PencilLine, RefreshCw } from "lucide-react";
import { useApp } from "@/components/app/context";
import { DeckAnswers } from "@/components/deck/answers";
import { DeckViewer } from "@/components/deck/viewer";
import { BrandMark } from "@/components/landing/logo";
import { ScribbleCross } from "@/components/sketch/draw";
import { Hand } from "@/components/sketch/hand";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Drawer, Settle, Skeleton } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { answeredCount, cleanDeckInputs, generatedDeckFilename, signedDeckUrl, type DeckInputs } from "@/lib/deck";
import { callFunction, createClient } from "@/lib/supabase/client";
import type { Startup } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

const POLL_MS = 4000;
/** Research plus writing normally takes one to three minutes; past this we offer to start again. */
const SLOW_MS = 6 * 60 * 1000;

const STAGES: Record<string, string> = {
  research: "Researching your industry for sourced figures",
  brand: "Reading your brand from your website",
  writing: "Writing your slides",
  rendering: "Rendering the PDF in your brand",
};
const stageText = (s: Startup) => STAGES[s.deck_stage ?? "research"] ?? "Drafting your deck";

interface Allowance {
  used: number;
  total: number;
  next_free_at: string | null;
}

async function fetchStartup(id: string) {
  const { data } = await createClient().from("startups").select("*").eq("id", id).single<Startup>();
  return data;
}

/** A blank slide with a pencil loader, while the first draft is being written. */
function Drafting({ stage }: { stage: string }) {
  return (
    <div className="graph-paper-faint relative aspect-video w-full overflow-hidden rounded-[8px] border border-line bg-panel">
      <div className="absolute inset-0 grid grid-cols-[1fr_38%] gap-[6%] px-[6%] pb-[9%] pt-[6%]">
        <div className="flex flex-col">
          <Skeleton className="h-[3.5%] w-[22%] min-h-2" />
          <Skeleton className="mt-[3%] h-[9%] w-[88%] min-h-4" />
          <Skeleton className="mt-[2%] h-[9%] w-[60%] min-h-4" />
          <div className="mt-[8%] space-y-[4%]">
            {[82, 70, 76].map((w) => (
              <div key={w} className="flex items-center gap-[3%]">
                <span className="block h-1.5 w-1.5 shrink-0 bg-vermilion/60" />
                <Skeleton className="h-2.5 min-h-2" style={{ width: `${w}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-[8%] border-b border-faint pb-px">
          {[28, 40, 52, 66, 82].map((h, i) => (
            <Skeleton key={h} className="flex-1 rounded-b-none" style={{ height: `${h}%`, animationDelay: `${i * 120}ms` }} />
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 border-t border-line bg-panel/80 px-4 py-2.5 backdrop-blur-[2px]">
        <BrandMark className="h-4 w-4" pulse />
        <p className="truncate text-[13px] text-muted">{stage}. One to three minutes, and you can leave this page.</p>
      </div>
    </div>
  );
}

export default function DeckPage() {
  const { startup, setStartup, profile } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<DeckInputs>(() => startup.deck_inputs ?? {});
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<"generated" | "uploaded" | null>(null);
  const [slow, setSlow] = useState(false);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadMeta = useCallback(async () => {
    const supabase = createClient();
    const [{ data: a }, { data: costs }] = await Promise.all([supabase.rpc("deck_allowance"), supabase.rpc("deck_run_costs", { p_limit: 1 })]);
    if (a) setAllowance(a as Allowance);
    // Only staff get costs back; founders get null.
    const latest = (costs as { usd: number; status: string }[] | null)?.find((c) => c.status === "done");
    setLastCost(latest ? Number(latest.usd) : null);
  }, []);
  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const deck = startup.deck_slides && startup.deck_slides.slides?.length ? startup.deck_slides : null;
  const running = startup.deck_status === "running";
  const failed = startup.deck_status === "error";
  const answered = answeredCount(startup.deck_inputs);

  // The row in context was loaded with the layout, so a draft may have finished since. Refresh once.
  useEffect(() => {
    let live = true;
    fetchStartup(startup.id).then((fresh) => {
      if (live && fresh) {
        setStartup(fresh);
        if (!fresh.deck_slides) setAnswers(fresh.deck_inputs ?? {});
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while a draft is running, here or from onboarding.
  useEffect(() => {
    if (!running) return;
    let live = true;
    const poll = setInterval(async () => {
      const fresh = await fetchStartup(startup.id);
      if (!live || !fresh) return;
      setStartup(fresh);
      if (fresh.deck_status === "done") {
        toast({ title: "Your deck is ready", body: "Read it through, then download the PDF." });
        void loadMeta();
      } else if (fresh.deck_status === "error") {
        void loadMeta();
      }
    }, POLL_MS);
    const late = setTimeout(() => live && setSlow(true), SLOW_MS);
    return () => {
      live = false;
      clearInterval(poll);
      clearTimeout(late);
    };
  }, [running, startup.id, setStartup, toast, loadMeta]);

  const generate = useCallback(
    async (base: Startup) => {
      setSlow(false);
      try {
        // Starts the run and returns straight away; polling picks up each stage and the finished deck.
        await callFunction("generate-deck", { action: "start" });
        setStartup({ ...base, deck_status: "running", deck_error: null, deck_stage: "research", deck_started_at: new Date().toISOString() });
      } catch (e) {
        toast({ title: "Could not draft the deck", body: e instanceof Error ? e.message : undefined, tone: "error" });
        const fresh = await fetchStartup(base.id);
        if (fresh) setStartup(fresh);
      }
      void loadMeta();
    },
    [setStartup, toast, loadMeta],
  );

  async function saveAnswers(redraft: boolean) {
    setSaving(true);
    const { data, error } = await createClient()
      .from("startups")
      .update({ deck_inputs: cleanDeckInputs(answers) })
      .eq("id", startup.id)
      .select()
      .single<Startup>();
    setSaving(false);
    if (error || !data) return toast({ title: "Could not save your answers", body: error?.message, tone: "error" });
    setStartup(data);
    setOpen(false);
    if (redraft) void generate(data);
    else toast({ title: "Answers saved", body: deck ? "Regenerate the deck to use them." : undefined });
  }

  async function refreshBrand() {
    setRefreshing(true);
    try {
      await callFunction("generate-deck", { action: "brand" });
      const fresh = await fetchStartup(startup.id);
      if (fresh) setStartup(fresh);
      toast({ title: "Brand refreshed", body: deck ? "Regenerate the deck to use it." : undefined });
    } catch (e) {
      toast({ title: "Could not refresh your brand", body: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setRefreshing(false);
    }
  }

  const outOfRuns = allowance != null && allowance.used >= allowance.total;
  const runsNote = allowance
    ? allowance.total === 0
      ? "Deck generation starts with your trial"
      : `${allowance.used} of ${allowance.total} deck generations used in the last 30 days`
    : null;

  function editAnswers() {
    setAnswers(startup.deck_inputs ?? {});
    setOpen(true);
  }

  async function download(kind: "generated" | "uploaded") {
    const path = kind === "generated" ? startup.generated_deck_path : startup.deck_path;
    if (!path) return;
    setDownloading(kind);
    try {
      const name = kind === "generated" ? generatedDeckFilename(startup) : (startup.deck_filename ?? undefined);
      window.location.href = await signedDeckUrl(path, name);
    } catch (e) {
      toast({ title: "Could not download the file", body: e instanceof Error ? e.message : undefined, tone: "error" });
    } finally {
      setDownloading(null);
    }
  }

  const month = startup.generated_deck_at
    ? new Date(startup.generated_deck_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toLowerCase()
    : "";

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-8 pb-20 md:px-8">
      <Settle className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[26px] tracking-[-0.04em]">Pitch deck</h2>
          <p className="text-[13.5px] text-muted">
            {deck
              ? `Drafted by Claude from your website${answered ? ` and ${answered} of 5 answers` : " and profile"}${startup.generated_deck_at ? `, ${timeAgo(startup.generated_deck_at)}` : ""}.`
              : "Slides in your brand, drafted from your website, your profile, five answers and sourced industry research."}
          </p>
          {(runsNote || lastCost != null) && (
            <p className="mt-0.5 text-[12px] text-label">
              {runsNote}
              {lastCost != null && <span className="ml-2 rounded-[4px] bg-panel-3 px-1.5 py-0.5 font-medium text-muted">Staff: last deck cost ${lastCost.toFixed(2)}</span>}
            </p>
          )}
        </div>
        {deck && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={editAnswers}>
              <PencilLine className="h-3.5 w-3.5" /> Edit answers
            </Button>
            <Button size="sm" onClick={() => void generate(startup)} disabled={running || outOfRuns}>
              {running ? <BrandMark className="h-3.5 w-3.5" pulse /> : <RefreshCw className="h-3.5 w-3.5" />}
              {running ? "Regenerating" : "Regenerate"}
            </Button>
            {startup.generated_deck_path && (
              <Button size="sm" variant="primary" onClick={() => void download("generated")} disabled={downloading === "generated"}>
                <Download className="h-3.5 w-3.5" /> {downloading === "generated" ? "Preparing" : "Download PDF"}
              </Button>
            )}
          </div>
        )}
      </Settle>

      {(failed || (running && (deck || slow))) && (
        <Settle className="mt-5">
          {failed ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-pencil/25 bg-pencil-soft/50 px-4 py-3">
              <ScribbleCross className="h-4 w-4 shrink-0" immediate />
              <p className="min-w-0 flex-1 text-[13.5px] text-pencil">
                The last draft did not finish{startup.deck_error ? `: ${startup.deck_error}` : "."}
              </p>
              <Button size="sm" onClick={() => void generate(startup)}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-line bg-panel px-4 py-3">
              <BrandMark className="h-4 w-4 shrink-0" pulse />
              <p className="min-w-0 flex-1 text-[13.5px] text-muted">
                {slow ? "This is taking longer than usual. You can start the draft again." : `${stageText(startup)}. The new version replaces this one when it is ready.`}
              </p>
              {slow && (
                <Button size="sm" onClick={() => void generate(startup)}>
                  Start again
                </Button>
              )}
            </div>
          )}
        </Settle>
      )}

      <div className="mt-6 space-y-6">
        {deck ? (
          <Settle delay={60}>
            <DeckViewer
              key={startup.generated_deck_at ?? "deck"}
              deck={deck}
              month={month}
              website={startup.website_url}
              contact={[profile.email, startup.website_url?.replace(/^https?:\/\//, "")].filter(Boolean).join(" · ")}
            />
          </Settle>
        ) : running ? (
          <Settle delay={60}>
            <Drafting stage={stageText(startup)} />
          </Settle>
        ) : (
          <Settle delay={60}>
            <Card className="overflow-hidden">
              <div className="grid gap-8 p-5 md:grid-cols-[260px_1fr] md:p-7">
                <div>
                  <p className="text-[15px] font-medium text-ink">No drafted deck yet</p>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                    Answer what you can. Claude researches your industry for sourced figures, then writes the slides in your brand from your answers, your
                    profile and your website. It charts the numbers you give and never invents metrics.
                  </p>
                  <div className="mt-5 flex flex-col items-start gap-3">
                    <Button variant="primary" onClick={() => void saveAnswers(true)} disabled={saving || outOfRuns}>
                      {saving ? "Saving" : "Draft my deck"}
                    </Button>
                    <Hand className="text-[19px]" tone="pencil" tilt={-3}>
                      one to three minutes
                    </Hand>
                  </div>
                </div>
                <DeckAnswers value={answers} onChange={setAnswers} />
              </div>
            </Card>
          </Settle>
        )}

        <Settle delay={90}>
          <BrandCard startup={startup} refreshing={refreshing} onRefresh={() => void refreshBrand()} />
        </Settle>

        {(startup.generated_deck_path || startup.deck_path) && (
          <Settle delay={120}>
            <Card>
              <CardHeader title="Files" sub="Private to you. Each download link expires after a minute." />
              <div className="divide-y divide-line-2">
                {startup.generated_deck_path && (
                  <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-line bg-panel-2">
                      <BrandMark className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{generatedDeckFilename(startup)}</p>
                      <p className="text-[12.5px] text-label">
                        Drafted by Centrale{deck ? `, ${deck.slides.length} slides` : ""}
                        {startup.generated_deck_at ? `, ${timeAgo(startup.generated_deck_at)}` : ""}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => void download("generated")} disabled={downloading === "generated"}>
                      <Download className="h-3.5 w-3.5" /> {downloading === "generated" ? "Preparing" : "Download PDF"}
                    </Button>
                  </div>
                )}
                {startup.deck_path && (
                  <div className="flex flex-wrap items-center gap-4 px-5 py-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-line bg-panel-2">
                      <FileText className="h-5 w-5 text-vermilion" strokeWidth={1.6} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-ink">{startup.deck_filename ?? "Your deck"}</p>
                      <p className="text-[12.5px] text-label">Your upload{startup.deck_uploaded_at ? `, ${timeAgo(startup.deck_uploaded_at)}` : ""}</p>
                    </div>
                    <Button size="sm" onClick={() => void download("uploaded")} disabled={downloading === "uploaded"}>
                      <Download className="h-3.5 w-3.5" /> {downloading === "uploaded" ? "Preparing" : "Download"}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </Settle>
        )}
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} width={560}>
        <div className="px-5 pb-6 pt-5 md:px-6">
          <h3 className="font-sans text-[16px] font-semibold tracking-[-0.02em]">Your deck answers</h3>
          <p className="mt-1 max-w-[420px] text-[13px] leading-relaxed text-muted">
            Claude only uses what you write here, your profile and your website. Numbers you give become the charts.
          </p>
          <DeckAnswers value={answers} onChange={setAnswers} className="mt-5" />
        </div>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-panel/95 px-5 py-3 backdrop-blur md:px-6">
          <Button size="sm" variant="ghost" onClick={() => void saveAnswers(false)} disabled={saving}>
            {saving ? "Saving" : "Save answers"}
          </Button>
          <Button size="sm" variant="primary" onClick={() => void saveAnswers(true)} disabled={saving || running}>
            Save and regenerate
          </Button>
        </div>
      </Drawer>
    </div>
  );
}

/** What the deck is styled with: captured from the founder's homepage, refreshable for one scrape. */
function BrandCard({ startup, refreshing, onRefresh }: { startup: Startup; refreshing: boolean; onRefresh: () => void }) {
  const b = startup.brand;
  const swatches = b ? ([b.colors.primary, b.colors.accent, b.colors.secondary, b.colors.background, b.colors.text].filter(Boolean) as string[]) : [];
  return (
    <Card>
      <CardHeader
        title="Your brand"
        sub={b ? `Taken from ${b.source_url.replace(/^https?:\/\//, "")} ${timeAgo(b.captured_at)}. Your deck uses these colours, fonts and images.` : "We read your colours, fonts, logo and a screenshot from your homepage to style your deck."}
        action={
          <Button size="sm" variant="ghost" onClick={onRefresh} disabled={refreshing || !startup.domain}>
            <RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> {refreshing ? "Reading your site" : "Refresh brand"}
          </Button>
        }
      />
      {b ? (
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              {b.logo_url && (
                <span className="flex h-12 items-center rounded-[6px] border border-line px-3" style={{ background: (b.logo_luminance ?? 0) > 0.62 ? "var(--color-night)" : undefined }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.logo_url} alt="Logo" className="h-7 max-w-[180px] object-contain" />
                </span>
              )}
              {b.favicon_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.favicon_url} alt="Favicon" className="h-8 w-8 rounded-[6px] border border-line bg-panel p-1" />
              )}
            </div>
            {swatches.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {swatches.map((c) => (
                  <span key={c} className="flex items-center gap-1.5 rounded-[6px] border border-line bg-panel px-2 py-1 font-mono text-[11.5px] text-muted">
                    <span className="h-3.5 w-3.5 rounded-[3px] border border-line" style={{ background: c }} />
                    {c}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[12.5px] text-muted">
              Fonts: {[b.fonts.heading, b.fonts.body].filter(Boolean).filter((f, i, a) => a.indexOf(f) === i).join(" and ") || "not detected, we use our own"}
            </p>
          </div>
          {b.screenshot_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.screenshot_url} alt="Your homepage" className="w-full rounded-[6px] border border-line" />
          )}
        </div>
      ) : (
        <p className="px-5 py-4 text-[13px] text-muted">
          {startup.brand_status === "running" ? "Reading your brand now." : "No brand captured yet. It is captured automatically when your deck is drafted, or press Refresh brand."}
        </p>
      )}
    </Card>
  );
}
