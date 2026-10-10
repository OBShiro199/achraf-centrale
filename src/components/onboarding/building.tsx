"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Draw, ScribbleBurst, ScribbleCross, ScribbleTick } from "@/components/sketch/draw";
import { Hand } from "@/components/sketch/hand";
import { callFunction, createClient } from "@/lib/supabase/client";
import type { Inbox, Startup } from "@/lib/types";
import { BrandMark } from "@/components/landing/logo";

type TaskState = "pending" | "running" | "done" | "error" | "background";
type TaskKey = "read" | "profile" | "inbox" | "investors" | "match" | "deck";

const ease = [0.22, 0.61, 0.21, 1] as const;
/** Nice-to-haves: if these fail the founder still gets to the dashboard. */
const OPTIONAL: TaskKey[] = ["inbox", "investors", "deck"];
/** How long to hold the finish for the deck once everything else is done; after that it carries on in the background. */
const DECK_GRACE_MS = 6000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** count_investors stops at 10,001, which means 10,000+. */
const fitCount = (n: number) => (n > 10000 ? "10,000+" : n.toLocaleString("en-GB"));

function StateIcon({ state }: { state: TaskState }) {
  if (state === "done") return <ScribbleTick className="h-5 w-5" immediate />;
  if (state === "error") return <ScribbleCross className="h-4 w-4" immediate />;
  if (state === "background") return <span className="pulse-dot block h-2 w-2 rounded-full bg-vermilion" />;
  if (state === "running")
    return (
      <motion.svg viewBox="0 0 20 20" className="h-5 w-5" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}>
        <g filter="url(#graphite)">
          <path d="M10 2.5 C 14.5 2.5 17.5 5.8 17.5 10 C 17.5 13 15.6 15.6 13 16.8" fill="none" stroke="#391c25" strokeWidth={1.8} strokeLinecap="round" />
        </g>
      </motion.svg>
    );
  return <span className="block h-2.5 w-2.5 rounded-full border border-faint" />;
}

/** A pencil sketch that keeps redrawing itself while the work runs. */
function SketchLoop({ done }: { done: boolean }) {
  const dots = [
    [70, 150],
    [105, 128],
    [140, 132],
    [168, 104],
    [196, 96],
    [226, 70],
    [250, 58],
    [272, 44],
  ];
  return (
    <svg viewBox="0 0 320 190" className="w-full max-w-[380px] overflow-visible" aria-hidden>
      <g filter="url(#graphite)">
        <Draw d="M30 170 L 305 170" color="#3a2a2e" width={1.3} immediate duration={0.8} />
        <Draw d="M30 170 L 30 12" color="#3a2a2e" width={1.3} immediate duration={0.8} delay={0.1} />
        {!done ? (
          <motion.path
            d="M36 164 C 90 150, 130 140, 170 104 S 250 52, 296 34"
            fill="none"
            stroke="#6e6360"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeDasharray="2 6"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1], opacity: [1, 1, 0] }}
            transition={{ duration: 3, times: [0, 0.8, 1], repeat: Infinity, ease: "easeInOut" }}
          />
        ) : (
          <Draw d="M36 164 C 90 150, 130 140, 170 104 S 250 52, 296 34" color="#6e6360" width={1.6} dash="2 6" immediate duration={0.6} />
        )}
      </g>
      {dots.map(([x, y], i) => (
        <motion.circle
          key={i}
          cx={x}
          cy={y}
          r={i >= 5 ? 5 : 4}
          fill={i >= 5 && done ? "#391c25" : "#f6f1e8"}
          stroke={i >= 5 && done ? "#391c25" : "#6f5f62"}
          strokeWidth={1.3}
          filter="url(#graphite)"
          style={{ transformOrigin: `${x}px ${y}px` }}
          initial={{ scale: 0, opacity: 0 }}
          animate={done ? { scale: 1, opacity: 1 } : { scale: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
          transition={done ? { duration: 0.3, delay: i * 0.04 } : { duration: 3, times: [0, 0.15, 0.85, 1], delay: i * 0.22, repeat: Infinity, repeatDelay: 0.4 }}
        />
      ))}
      {done && (
        <g filter="url(#graphite)">
          <Draw d="M214 52 C 232 22, 300 18, 300 44 C 300 70, 250 88, 222 82 C 196 76, 200 50, 226 38 C 246 30, 270 30, 284 34" color="#d94a38" width={2} immediate duration={0.9} delay={0.3} />
        </g>
      )}
    </svg>
  );
}

export function Building({ domain, needsScrape, wantsDeck = false }: { domain: string; needsScrape: boolean; wantsDeck?: boolean }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Record<TaskKey, TaskState>>({
    read: "pending",
    profile: "pending",
    inbox: "pending",
    investors: "pending",
    match: "pending",
    deck: wantsDeck ? "pending" : "done",
  });
  const [error, setError] = useState<string | null>(null);
  const [startup, setStartup] = useState<Startup | null>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [fits, setFits] = useState<{ total: number | null; strong: number | null } | null>(null);
  const started = useRef(false);
  const deckRun = useRef<Promise<void> | null>(null);

  const set = (k: TaskKey, s: TaskState) => setTasks((t) => ({ ...t, [k]: s }));

  /** Fires generate-deck once. It takes 30 to 90 seconds and the deck page shows its live status, so nothing waits on it for long. */
  const startDeck = useCallback(() => {
    if (!wantsDeck || deckRun.current) return;
    set("deck", "running");
    // The deck is researched and written in the background; this only starts it.
    deckRun.current = callFunction("generate-deck", {})
      .then(() => set("deck", "background"))
      .catch(() => {
        // Non-fatal: the founder can retry from the deck page, or from Try again here.
        set("deck", "error");
        deckRun.current = null;
      });
  }, [wantsDeck]);

  const run = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    try {
      set("read", "running");
      if (needsScrape) await callFunction("scrape-site", { domain });
      set("read", "done");

      set("profile", "running");
      set("inbox", "running");
      // Every founder gets an inbox during onboarding; sending from it starts with the plan.
      const [profileRes, inboxRes] = await Promise.allSettled([
        callFunction<{ startup: Startup }>("build-profile"),
        callFunction<{ inbox: Inbox }>("provision-inbox"),
      ]);
      if (profileRes.status === "fulfilled") {
        setStartup(profileRes.value.startup);
        set("profile", "done");
        // The deck reads the profile we just wrote, so it starts here and runs alongside matching.
        startDeck();
      } else set("profile", "error");
      if (inboxRes.status === "fulfilled") {
        setInbox(inboxRes.value.inbox as Inbox | null);
        set("inbox", "done");
      } else set("inbox", "error");

      set("investors", "running");
      try {
        await callFunction<{ ok: boolean; count: number }>("match-investors", {});
        set("investors", "done");
      } catch {
        set("investors", "error");
      }

      set("match", "running");
      // Counts stop at 10,001 (shown as 10,000+) and come back null if they took too long.
      const count = (filters: Record<string, unknown>) =>
        supabase.rpc("count_investors", { p_filters: filters }).then(({ data }) => (data as number | null) ?? null);
      const [total, strong] = await Promise.all([count({}), count({ minScore: 60 })]);
      setFits({ total, strong });
      set("match", "done");

      // The inbox can be retried from the dashboard, so only the profile blocks finishing.
      if (profileRes.status === "rejected") throw profileRes.reason;

      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("startups").update({ onboarding_completed_at: new Date().toISOString() }).eq("owner_id", userData.user!.id);

      // Give a quick deck a moment to land, then let it finish in the background.
      if (deckRun.current) {
        await Promise.race([deckRun.current, sleep(DECK_GRACE_MS)]);
        setTasks((t) => (t.deck === "running" ? { ...t, deck: "background" } : t));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [domain, needsScrape, startDeck]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, [run]);

  const allDone = (Object.entries(tasks) as [TaskKey, TaskState][]).every(([k, s]) =>
    OPTIONAL.includes(k) ? s === "done" || s === "error" || s === "background" : s === "done",
  );

  async function continueAnyway() {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    await supabase.from("startups").update({ onboarding_completed_at: new Date().toISOString() }).eq("owner_id", data.user!.id);
    router.push("/dashboard");
  }

  const rows: { key: TaskKey; label: string }[] = [
    { key: "read", label: `Reading ${domain}` },
    { key: "profile", label: "Writing your startup profile" },
    { key: "inbox", label: "Setting up your inbox" },
    { key: "investors", label: "Matching you with investors" },
    { key: "match", label: "Scoring investors against your profile" },
    ...(wantsDeck ? [{ key: "deck" as const, label: "Drafting your pitch deck" }] : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-center text-center">
      <SketchLoop done={allDone} />

      <AnimatePresence mode="wait">
        {!allDone ? (
          <motion.div key="working" exit={{ opacity: 0, y: -8 }} className="w-full">
            <h1 className="mt-8 text-[30px] tracking-[-0.04em]">Building your startup profile</h1>
            <p className="mt-2 text-[15px] text-muted">Under a minute. Leave this tab open.</p>
            <ul className="mx-auto mt-8 w-full max-w-[380px] text-left">
              {rows.map((r) => (
                <li key={r.key} className="flex items-center gap-3 border-b border-line py-3 text-[14.5px]">
                  <span className="flex h-5 w-5 items-center justify-center">
                    <StateIcon state={tasks[r.key]} />
                  </span>
                  <span className={tasks[r.key] === "pending" ? "text-faint" : "text-ink"}>{r.label}</span>
                </li>
              ))}
            </ul>
            {error && (
              <div className="mx-auto mt-6 max-w-[380px] text-left">
                <p className="text-[13.5px] text-pencil">{error}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => void run()}>
                    Try again
                  </Button>
                  <Button size="sm" variant="ghost" onClick={continueAnyway}>
                    Continue to the dashboard
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease }}
            className="w-full"
          >
            <BrandMark className="mx-auto mt-6 h-9 w-9" assemble delay={0.2} />
            <h1 className="mt-4 text-[30px] tracking-[-0.04em]">Your profile is ready</h1>
            <div className="mx-auto mt-7 w-full max-w-[460px] rounded-[10px] border border-line bg-panel p-5 text-left shadow-[0_18px_40px_-30px_rgba(57,28,37,0.3)]">
              <div className="flex items-center gap-3">
                {startup?.favicon_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={startup.favicon_url} alt="" className="h-8 w-8 rounded-[6px] border border-line bg-panel-2 object-contain p-1" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-ink">{startup?.name ?? domain}</p>
                  <p className="truncate text-[12.5px] text-label">{startup?.domain ?? domain}</p>
                </div>
              </div>
              {startup?.one_liner && <p className="mt-3 text-[14.5px] leading-relaxed text-body">{startup.one_liner}</p>}
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                <div>
                  <p className="text-[12px] text-label">Your inbox</p>
                  {inbox ? (
                    <p className="relative mt-0.5 truncate text-[13.5px] font-medium text-ink">
                      {inbox.address}
                      <ScribbleBurst className="absolute -top-4 right-2 h-4 w-8" immediate delay={0.6} />
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[13.5px] text-muted">Finishing on the dashboard</p>
                  )}
                </div>
                <div>
                  <p className="text-[12px] text-label">Investors scored</p>
                  <p className="mt-0.5 text-[13.5px] font-medium text-ink">
                    {fits && fits.total != null
                      ? `${fitCount(fits.total)} scored${fits.strong != null ? `, ${fitCount(fits.strong)} strong fits` : ""}`
                      : "Scored and ready"}
                  </p>
                </div>
                {wantsDeck && (
                  <div className="col-span-2 flex items-center gap-2.5 border-t border-line pt-3">
                    <span className="flex h-5 w-5 items-center justify-center">
                      <StateIcon state={tasks.deck} />
                    </span>
                    <p className="min-w-0 flex-1 text-[13px] text-muted">
                      {tasks.deck === "done"
                        ? "Your pitch deck is drafted."
                        : tasks.deck === "error"
                          ? "We could not draft your deck this time. Try again from the deck page."
                          : "Your pitch deck is still being drafted. About a minute."}
                    </p>
                    <Link href="/dashboard/deck" className="shrink-0 text-[13px] font-medium text-ink underline decoration-faint underline-offset-4 hover:decoration-ink">
                      {tasks.deck === "done" ? "Read it" : "Pitch deck"}
                    </Link>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Button variant="primary" size="lg" onClick={() => router.push("/dashboard")}>
                Open your dashboard
              </Button>
              <Hand className="text-[20px]" tilt={-2}>
                next: send your first email
              </Hand>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
