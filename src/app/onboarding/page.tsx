"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/landing/logo";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { Building } from "@/components/onboarding/building";
import { PeopleDots, ValueIcon } from "@/components/onboarding/icons";
import { Tile } from "@/components/onboarding/tile";
import { Worksheet, type Draft } from "@/components/onboarding/worksheet";
import { Draw, ScribbleBox } from "@/components/sketch/draw";
import { Hand } from "@/components/sketch/hand";
import { callFunction, createClient } from "@/lib/supabase/client";
import { HEADCOUNT, INVESTOR_TYPES, REVENUE, STAGES, VALUES } from "@/lib/taxonomy";
import type { Profile, Startup } from "@/lib/types";
import { cn, DECK_EXTENSIONS, DECK_MAX_BYTES, faviconFor } from "@/lib/utils";

const ease = [0.22, 0.61, 0.21, 1] as const;
const STEPS = ["name", "domain", "team", "values", "stage", "revenue", "deck", "build"] as const;
type Step = (typeof STEPS)[number];

const STAGE_NOTES: Record<string, string> = {
  pre_seed: "Idea to first product. Cheques from $50k.",
  seed: "Early traction. Rounds of $500k to $3m.",
  angel: "Individual cheques from operators and founders.",
  series_a: "Repeatable revenue. Rounds of $5m to $15m.",
  series_b: "Scaling what already works.",
};
const HEAD_DOTS: Record<string, number> = { solo: 1, "2_5": 3, "6_10": 5, "11_25": 7, "26_50": 9, "50_plus": 11 };
const REV_BAR: Record<string, number> = { pre_revenue: 0, "0_10k": 10, "11_20k": 20, "21_30k": 30, "31_50k": 46, "51_100k": 72, "100k_plus": 100 };

function Question({ n, title, lead, children }: { n: number; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13px] text-label">Question {n}</p>
      <h1 className="mt-2 text-[clamp(26px,3vw,34px)] leading-[1.1] tracking-[-0.04em]">{title}</h1>
      {lead && <p className="mt-2 text-[15px] leading-relaxed text-muted">{lead}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("name");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsScrape, setNeedsScrape] = useState(true);
  const scrapeRef = useRef<Promise<unknown> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [deckFile, setDeckFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const [draft, setDraft] = useState<Draft>({
    firstName: "",
    lastName: "",
    domain: "",
    siteName: null,
    siteDescription: null,
    favicon: null,
    scraping: false,
    headcount: null,
    values: [],
    valuesDone: false,
    stage: null,
    investorTypes: [],
    revenue: null,
    deckName: null,
    wantsDeck: false,
  });
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  // Load saved answers and resume where the founder left off.
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return router.replace("/login");
      setUserId(auth.user.id);
      const [{ data: profile }, { data: startup }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", auth.user.id).single<Profile>(),
        supabase.from("startups").select("*").eq("owner_id", auth.user.id).single<Startup>(),
      ]);
      if (startup?.onboarding_completed_at) return router.replace("/dashboard");

      const saved = typeof window !== "undefined" ? (() => { try { return localStorage.getItem(`onboarding:${auth.user!.id}`); } catch { return null; } })() : null;
      const d: Partial<Draft> = {
        firstName: profile?.first_name ?? "",
        lastName: profile?.last_name ?? "",
        domain: startup?.domain ?? "",
        siteName: startup?.name ?? null,
        siteDescription: startup?.scrape?.description ?? null,
        favicon: startup?.favicon_url ?? null,
        headcount: startup?.headcount ?? null,
        values: startup?.values ?? [],
        valuesDone: Boolean(startup?.stage) || STEPS.indexOf((saved as Step) ?? "name") > 3,
        stage: startup?.stage ?? null,
        investorTypes: startup?.investor_types ?? [],
        revenue: startup?.revenue_band ?? null,
        deckName: startup?.deck_filename ?? null,
        wantsDeck: startup?.wants_generated_deck ?? false,
      };
      patch(d);
      setNeedsScrape(!startup?.scrape || Boolean(startup.scrape.error));

      const firstGap: Step = !d.firstName ? "name" : !d.domain ? "domain" : !d.headcount ? "team" : !d.valuesDone ? "values" : !d.stage ? "stage" : !d.revenue ? "revenue" : !(d.deckName || d.wantsDeck) ? "deck" : "build";
      const resume = saved && STEPS.includes(saved as Step) && STEPS.indexOf(saved as Step) <= STEPS.indexOf(firstGap) ? (saved as Step) : firstGap;
      setStep(resume === "build" ? "deck" : resume);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId || step === "build") return;
    try {
      localStorage.setItem(`onboarding:${userId}`, step);
    } catch {}
  }, [step, userId]);

  const updateStartup = useCallback(
    async (values: Record<string, unknown>) => {
      const { error: e } = await supabase.from("startups").update(values).eq("owner_id", userId!);
      if (e) throw e;
    },
    [supabase, userId],
  );

  function startScrape(domain: string) {
    patch({ scraping: true, favicon: faviconFor(domain), siteDescription: null });
    scrapeRef.current = callFunction<{ ok: boolean; name?: string; description?: string; favicon?: string }>("scrape-site", { domain })
      .then((r) => {
        patch({ scraping: false, siteName: r.name ?? null, siteDescription: r.description || null, favicon: r.favicon ?? faviconFor(domain) });
        setNeedsScrape(!r.ok);
      })
      .catch(() => {
        patch({ scraping: false });
        setNeedsScrape(true);
      });
  }

  async function next() {
    setError(null);
    setBusy(true);
    try {
      switch (step) {
        case "name": {
          if (!draft.firstName.trim()) throw new Error("Add your first name");
          const { error: e } = await supabase
            .from("profiles")
            .update({ first_name: draft.firstName.trim(), last_name: draft.lastName.trim() || null })
            .eq("id", userId!);
          if (e) throw e;
          setStep("domain");
          break;
        }
        case "domain": {
          const clean = draft.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
          if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(clean)) throw new Error("Enter a domain like acme.com");
          patch({ domain: clean });
          await updateStartup({ domain: clean, website_url: `https://${clean}` });
          startScrape(clean);
          setStep("team");
          break;
        }
        case "team":
          if (!draft.headcount) throw new Error("Pick a team size");
          await updateStartup({ headcount: draft.headcount });
          setStep("values");
          break;
        case "values":
          await updateStartup({ values: draft.values });
          patch({ valuesDone: true });
          setStep("stage");
          break;
        case "stage":
          if (!draft.stage) throw new Error("Pick the round you are raising");
          await updateStartup({ stage: draft.stage, investor_types: draft.investorTypes });
          setStep("revenue");
          break;
        case "revenue":
          if (!draft.revenue) throw new Error("Pick your monthly revenue");
          await updateStartup({ revenue_band: draft.revenue });
          setStep("deck");
          break;
        case "deck": {
          if (deckFile) {
            const safe = deckFile.name.replace(/[^\w.\-]+/g, "_");
            const path = `${userId}/${Date.now()}-${safe}`;
            const { error: upErr } = await supabase.storage.from("decks").upload(path, deckFile, {
              upsert: true,
              contentType: deckFile.type || "application/octet-stream",
            });
            if (upErr) throw upErr;
            await updateStartup({
              deck_path: path,
              deck_filename: deckFile.name,
              deck_mime: deckFile.type || null,
              deck_uploaded_at: new Date().toISOString(),
              wants_generated_deck: false,
            });
            patch({ deckName: deckFile.name, wantsDeck: false });
          } else if (draft.wantsDeck) {
            await updateStartup({ wants_generated_deck: true });
          } else if (!draft.deckName) {
            throw new Error("Upload your deck or ask us to make one");
          }
          if (scrapeRef.current) await scrapeRef.current;
          setStep("build");
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function back() {
    setError(null);
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  }

  function pickDeck(file: File | undefined | null) {
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!DECK_EXTENSIONS.includes(ext)) return setError("Use a PDF, PPTX, PPT, KEY or DOCX file");
    if (file.size > DECK_MAX_BYTES) return setError("That file is over 50 MB");
    setError(null);
    setDeckFile(file);
    patch({ deckName: file.name, wantsDeck: false });
  }

  // Number keys pick tiles, Enter continues.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (e.key === "Enter" && !e.shiftKey && step !== "build" && !busy) {
        e.preventDefault();
        void next();
        return;
      }
      if (typing) return;
      const n = Number(e.key);
      if (!n) return;
      if (step === "team") {
        const k = Object.keys(HEADCOUNT)[n - 1];
        if (k) patch({ headcount: k });
      } else if (step === "stage") {
        const k = Object.keys(STAGES)[n - 1];
        if (k) patch({ stage: k });
      } else if (step === "revenue") {
        const k = Object.keys(REVENUE)[n - 1];
        if (k) patch({ revenue: k });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const idx = STEPS.indexOf(step);
  const progress = step === "build" ? 1 : idx / (STEPS.length - 1);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="skeleton h-4 w-40" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-paper/80 backdrop-blur">
        <div className="mx-auto flex h-[60px] max-w-[1280px] items-center justify-between gap-6 px-5 md:px-8">
          <Logo href="/" />
          <div className="flex flex-1 items-center justify-end gap-4 md:justify-center">
            <span className="tabular hidden text-[12.5px] text-label sm:inline">
              {step === "build" ? "Last step" : `Step ${idx + 1} of ${STEPS.length - 1}`}
            </span>
            <svg viewBox="0 0 200 10" className="h-2.5 w-[140px] overflow-visible md:w-[220px]" preserveAspectRatio="none" aria-hidden>
              <path d="M2 5 C 50 4, 150 6, 198 5" stroke="#e6ddd0" strokeWidth={2} fill="none" strokeLinecap="round" />
              <g filter="url(#graphite)">
                <motion.path
                  d="M2 5 C 50 4, 150 6, 198 5"
                  stroke="#391c25"
                  strokeWidth={2.4}
                  fill="none"
                  strokeLinecap="round"
                  initial={false}
                  animate={{ pathLength: Math.max(0.02, progress) }}
                  transition={{ duration: 0.7, ease }}
                />
              </g>
            </svg>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/");
            }}
            className="hidden text-[13px] text-label hover:text-ink md:block"
          >
            Save and exit
          </button>
        </div>
      </header>

      <main className={cn("flex-1", step === "build" ? "graph-paper" : "")}>
        {step === "build" ? (
          <div className="flex min-h-[calc(100dvh-61px)] items-center justify-center px-5 py-16">
            <Building domain={draft.domain} needsScrape={needsScrape} />
          </div>
        ) : (
          <div className="mx-auto grid max-w-[1280px] lg:grid-cols-[1fr_1fr]">
            <div className="flex flex-col px-5 py-12 md:px-12 lg:min-h-[calc(100dvh-61px)] lg:py-16">
              <div className="w-full max-w-[520px] flex-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                    transition={{ duration: 0.45, ease }}
                  >
                    {step === "name" && (
                      <Question n={1} title="What should we call you?" lead="Investors see this name on every email.">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input autoFocus placeholder="First name" value={draft.firstName} onChange={(e) => patch({ firstName: e.target.value })} className="h-12 text-[16px]" />
                          <Input placeholder="Last name" value={draft.lastName} onChange={(e) => patch({ lastName: e.target.value })} className="h-12 text-[16px]" />
                        </div>
                      </Question>
                    )}

                    {step === "domain" && (
                      <Question n={2} title="What is your startup's website?" lead="We read it to learn what you do, so you do not have to explain it.">
                        <div className="flex h-12 items-center overflow-hidden rounded-[6px] border border-[#ddd2c5] bg-panel focus-within:border-[#ae9d92] focus-within:ring-[3px] focus-within:ring-black/[0.05]">
                          <span className="border-r border-line bg-panel-2 px-3 text-[15px] leading-[46px] text-label">https://</span>
                          <input
                            autoFocus
                            inputMode="url"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="acme.com"
                            value={draft.domain}
                            onChange={(e) => patch({ domain: e.target.value })}
                            className="h-full flex-1 bg-transparent px-3 text-[16px] text-ink outline-none placeholder:text-faint"
                          />
                        </div>
                      </Question>
                    )}

                    {step === "team" && (
                      <Question n={3} title="How big is your team?" lead="Full-time people, including founders.">
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                          {Object.entries(HEADCOUNT).map(([k, v], i) => (
                            <Tile key={k} selected={draft.headcount === k} onClick={() => patch({ headcount: k })} hotkey={String(i + 1)}>
                              <span className="text-[16px] font-medium tracking-[-0.02em] text-ink">{v}</span>
                              <span className="mt-3">
                                <PeopleDots count={HEAD_DOTS[k]} />
                              </span>
                            </Tile>
                          ))}
                        </div>
                      </Question>
                    )}

                    {step === "values" && (
                      <Question n={4} title="Anything you stand for?" lead="Some investors only back companies with these values. Pick any that fit, or none.">
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                          {Object.entries(VALUES).map(([k, v]) => {
                            const on = draft.values.includes(k);
                            return (
                              <Tile
                                key={k}
                                selected={on}
                                onClick={() => patch({ values: on ? draft.values.filter((x) => x !== k) : [...draft.values, k] })}
                                className="gap-3"
                              >
                                <ValueIcon value={k} active={on} />
                                <span className="text-[14px] leading-tight text-ink">{v}</span>
                              </Tile>
                            );
                          })}
                        </div>
                      </Question>
                    )}

                    {step === "stage" && (
                      <Question n={5} title="Which round are you raising?">
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          {Object.entries(STAGES).map(([k, v], i) => (
                            <Tile key={k} selected={draft.stage === k} onClick={() => patch({ stage: k })} hotkey={String(i + 1)}>
                              <span className="text-[16px] font-medium tracking-[-0.02em] text-ink">{v}</span>
                              <span className="mt-1 pr-6 text-[13px] leading-snug text-muted">{STAGE_NOTES[k]}</span>
                            </Tile>
                          ))}
                        </div>
                        <p className="mb-3 mt-8 text-[13px] font-medium text-ink">
                          Who would you like to hear from? <span className="font-normal text-label">Optional</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(INVESTOR_TYPES).map(([k, v]) => {
                            const on = draft.investorTypes.includes(k);
                            return (
                              <button
                                key={k}
                                type="button"
                                aria-pressed={on}
                                onClick={() => patch({ investorTypes: on ? draft.investorTypes.filter((x) => x !== k) : [...draft.investorTypes, k] })}
                                className={cn(
                                  "h-8 rounded-[6px] border px-3 text-[13.5px] transition-colors",
                                  on ? "border-[#a8968c] bg-[#f4ede3] text-ink" : "border-line bg-panel text-muted hover:border-[#d5c8ba] hover:text-ink",
                                )}
                              >
                                {v === "VC" ? "VCs" : `${v}s`}
                              </button>
                            );
                          })}
                        </div>
                      </Question>
                    )}

                    {step === "revenue" && (
                      <Question n={6} title="What is your monthly revenue?" lead="Roughly is fine. Some investors only look at companies past a threshold.">
                        <div className="space-y-2">
                          {Object.entries(REVENUE).map(([k, v], i) => (
                            <Tile key={k} selected={draft.revenue === k} onClick={() => patch({ revenue: k })} hotkey={String(i + 1)} className="flex-row items-center gap-4 py-3">
                              <span className="w-[190px] shrink-0 text-[14.5px] text-ink">{v}</span>
                              <svg viewBox="0 0 300 12" className="mr-8 h-3 flex-1 overflow-visible" preserveAspectRatio="none" aria-hidden>
                                <g filter="url(#wobble)">
                                  {REV_BAR[k] > 0 ? (
                                    <Draw d={`M3 6 C ${REV_BAR[k] * 0.9} 4.5, ${REV_BAR[k] * 2.1} 7.5, ${REV_BAR[k] * 2.95} 6`} immediate delay={0.05 * i} width={draft.revenue === k ? 6 : 5} color={draft.revenue === k ? "#391c25" : "#d5c8ba"} />
                                  ) : (
                                    <circle cx={5} cy={6} r={3} fill="#d5c8ba" />
                                  )}
                                </g>
                              </svg>
                            </Tile>
                          ))}
                        </div>
                      </Question>
                    )}

                    {step === "deck" && (
                      <Question n={7} title="Do you have a pitch deck?" lead="Upload it and it becomes the source of truth for your profile.">
                        <input
                          ref={fileInput}
                          type="file"
                          accept={DECK_EXTENSIONS.join(",")}
                          className="hidden"
                          onChange={(e) => pickDeck(e.target.files?.[0])}
                        />
                        <button
                          type="button"
                          onClick={() => fileInput.current?.click()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragging(true);
                          }}
                          onDragLeave={() => setDragging(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragging(false);
                            pickDeck(e.dataTransfer.files?.[0]);
                          }}
                          className={cn(
                            "relative flex w-full flex-col items-center justify-center px-6 py-10 text-center transition-colors",
                            dragging ? "bg-[#f1eadf]" : "bg-panel/60 hover:bg-panel",
                          )}
                        >
                          <ScribbleBox className="pointer-events-none absolute inset-0 h-full w-full" immediate color={dragging ? "#391c25" : "#a39791"} />
                          <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
                            <g filter="url(#graphite)">
                              <Draw d="M10 6 L 25 6 L 31 12 L 31 34 L 10 34 Z" immediate width={1.6} color="#6f5f62" />
                              <Draw d="M25 6 L 25 12 L 31 12" immediate width={1.6} color="#6f5f62" delay={0.4} />
                              <Draw d="M20 28 L 20 17 M 15.5 21.5 L 20 17 L 24.5 21.5" immediate width={1.8} color="#d94a38" delay={0.6} />
                            </g>
                          </svg>
                          {draft.deckName && (deckFile || draft.deckName) ? (
                            <>
                              <p className="mt-3 text-[15px] font-medium text-ink">{draft.deckName}</p>
                              <p className="mt-1 text-[13px] text-label">
                                {deckFile ? `${(deckFile.size / 1024 / 1024).toFixed(1)} MB, ready to upload. ` : "Uploaded. "}Click to replace.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="mt-3 text-[15px] font-medium text-ink">Drop your deck here, or click to choose</p>
                              <p className="mt-1 text-[13px] text-label">PDF, PPTX, PPT, KEY or DOCX, up to 50 MB</p>
                            </>
                          )}
                        </button>

                        <div className="my-5 flex items-center gap-3 text-[12.5px] text-label">
                          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                        </div>

                        <Tile
                          selected={draft.wantsDeck && !deckFile}
                          onClick={() => {
                            setDeckFile(null);
                            patch({ wantsDeck: !draft.wantsDeck, deckName: draft.wantsDeck ? draft.deckName : null });
                          }}
                        >
                          <span className="text-[15px] font-medium text-ink">I do not have a deck, make one for me</span>
                          <span className="mt-1 text-[13px] text-muted">We draft 10 to 15 slides from your website and answers. You edit before anyone sees it.</span>
                        </Tile>
                      </Question>
                    )}
                  </motion.div>
                </AnimatePresence>

                <div className="mt-8 space-y-4">
                  <FormError>{error}</FormError>
                  <div className="flex items-center gap-3">
                    {idx > 0 && (
                      <Button variant="ghost" onClick={back} disabled={busy}>
                        Back
                      </Button>
                    )}
                    <Button variant="primary" size="lg" onClick={() => void next()} disabled={busy} className="min-w-[160px]">
                      {busy ? "Saving" : step === "deck" ? "Build my profile" : "Continue"}
                    </Button>
                    <span className="hidden text-[12.5px] text-faint sm:inline">
                      or press <kbd className="rounded-[4px] border border-line bg-panel px-1.5 py-0.5 text-[11px] text-label">Enter</kbd>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <aside className="graph-paper relative hidden items-center justify-center border-t border-line px-10 pb-24 pt-16 md:flex lg:min-h-[calc(100dvh-61px)] lg:border-l lg:border-t-0 lg:pb-16">
              <Worksheet draft={draft} />
              <div className="absolute bottom-10 left-10">
                <Hand className="text-[20px]" tilt={-3}>
                  we fill this in while you answer
                </Hand>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
