"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link2, Search, X } from "lucide-react";
import { Settle } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { inputClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface DocsEntry {
  id: string;
  title: string;
  summary: string;
  /** Lowercased title, summary and body text, for search. */
  haystack: string;
  body: ReactNode;
}

// The app header is 56px tall and sticky; sections stop just below it.
const HEADER = 56;

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", `#${id}`);
}

export function DocsView({ sections, updated }: { sections: DocsEntry[]; updated: string }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const searchRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const words = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const shown = useMemo(
    () => (words.length ? sections.filter((s) => words.every((w) => s.haystack.includes(w))) : sections),
    [sections, words],
  );
  const shownKey = shown.map((s) => s.id).join(",");

  // A shared link (/dashboard/docs#custom-domain) highlights its section straight away.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id && sections.some((s) => s.id === id)) setActive(id);
  }, [sections]);

  // Highlight the section in view: the first one crossing the top 40% of the screen.
  useEffect(() => {
    const ids = shownKey ? shownKey.split(",") : [];
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el != null);
    if (!els.length) return;
    const visible = new Set<string>();
    const pick = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const id = atBottom ? ids[ids.length - 1] : ids.find((x) => visible.has(x));
      if (id) setActive(id);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        pick();
      },
      { rootMargin: `-${HEADER + 16}px 0px -60% 0px` },
    );
    els.forEach((el) => io.observe(el));
    // The last sections are short; at the very bottom of the page the last one wins.
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) pick();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [shownKey]);

  // Keep the active chip in view on phones without moving the page.
  useEffect(() => {
    const bar = chipsRef.current;
    const chip = bar?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!bar || !chip) return;
    const left = chip.offsetLeft - 16;
    const right = chip.offsetLeft + chip.offsetWidth - bar.clientWidth + 16;
    if (bar.scrollLeft > left) bar.scrollTo({ left, behavior: "smooth" });
    else if (bar.scrollLeft < right) bar.scrollTo({ left: right, behavior: "smooth" });
  }, [active]);

  // "/" focuses search, as on most docs sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(id: string) {
    setActive(id);
    scrollToSection(id);
  }

  async function copyLink(id: string) {
    const url = `${window.location.origin}/dashboard/docs#${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", body: url });
    } catch {
      toast({ title: "Could not copy the link", body: url, tone: "error" });
    }
  }

  const tocItem = (s: DocsEntry, i: number) => {
    const on = s.id === active;
    return (
      <li key={s.id}>
        <a
          href={`#${s.id}`}
          onClick={(e) => {
            e.preventDefault();
            go(s.id);
          }}
          aria-current={on ? "location" : undefined}
          className={cn(
            "relative flex gap-2.5 rounded-[6px] py-1.5 pl-3 pr-2 text-[13px] leading-snug transition-colors",
            on ? "bg-black/[0.035] font-medium text-ink" : "text-muted hover:bg-black/[0.025] hover:text-ink",
          )}
        >
          <span aria-hidden className={cn("absolute inset-y-1.5 left-0 w-[2px] rounded-full", on ? "bg-vermilion" : "bg-transparent")} />
          <span className="tabular w-4 shrink-0 text-right text-[11.5px] text-faint">{i + 1}</span>
          <span className="min-w-0">{s.title}</span>
        </a>
      </li>
    );
  };

  const numberOf = (id: string) => sections.findIndex((s) => s.id === id) + 1;

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 md:px-8">
      <Settle className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[560px]">
          <h2 className="text-[26px] tracking-[-0.04em]">How Centrale works</h2>
          <p className="mt-1 text-[14px] leading-relaxed text-muted">
            Everything from your trial and your inbox to fit scores, custom domains and your pitch deck. Updated{" "}
            {new Date(`${updated}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.
          </p>
        </div>
        <div className="relative w-full sm:w-[300px]">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-label" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && shown[0]) go(shown[0].id);
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Search the docs"
            aria-label="Search the docs"
            className={cn(inputClass, "h-9 pl-9 pr-9 text-[14px] [&::-webkit-search-cancel-button]:hidden")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[4px] p-1 text-label hover:text-ink"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-[4px] border border-line bg-panel-2 px-1.5 text-[11px] leading-[18px] text-label sm:block">
              /
            </kbd>
          )}
        </div>
      </Settle>

      {/* Phones and tablets: the contents as a row of chips under the app header. */}
      <div className="sticky top-[56px] z-20 -mx-4 mt-5 border-b border-line bg-[#fbf8f3]/95 backdrop-blur md:-mx-8 lg:hidden">
        <div ref={chipsRef} className="quiet-scroll flex gap-1.5 overflow-x-auto px-4 py-2.5 md:px-8" role="navigation" aria-label="Sections">
          {shown.map((s) => (
            <button
              key={s.id}
              type="button"
              data-id={s.id}
              onClick={() => go(s.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-[12.5px] transition-colors",
                s.id === active ? "border-burgundy bg-burgundy text-ivory" : "border-line bg-panel text-muted hover:text-ink",
              )}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-10 lg:mt-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Contents" className="hidden lg:block">
          <div className="quiet-scroll sticky top-[80px] max-h-[calc(100dvh-100px)] overflow-y-auto pb-6">
            <p className="mb-2 pl-3 text-[12px] font-medium text-label">Contents</p>
            <ol className="space-y-px">{shown.map((s) => tocItem(s, numberOf(s.id) - 1))}</ol>
            {words.length > 0 && (
              <p className="mt-3 pl-3 text-[12px] text-label">
                {shown.length} of {sections.length} sections match
              </p>
            )}
          </div>
        </nav>

        <article className="min-w-0 max-w-[760px]">
          {shown.length === 0 && (
            <div className="rounded-[8px] border border-line bg-panel px-6 py-12 text-center">
              <p className="text-[14.5px] font-medium text-ink">Nothing in the docs matches &quot;{query.trim()}&quot;</p>
              <p className="mt-1 text-[13.5px] text-muted">Try one word, such as domain, follow-up or credits.</p>
              <button type="button" onClick={() => setQuery("")} className="mt-4 text-[13px] font-medium text-ink underline decoration-faint underline-offset-[3px]">
                Clear search
              </button>
            </div>
          )}
          {shown.map((s, i) => (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`${s.id}-title`}
              className={cn("scroll-mt-[124px] lg:scroll-mt-[76px]", i > 0 && "mt-12 border-t border-line pt-10")}
            >
              <p className="tabular text-[12.5px] text-label">{String(numberOf(s.id)).padStart(2, "0")}</p>
              <div className="group mt-1 flex items-start gap-2">
                <h2 id={`${s.id}-title`} className="text-[22px] leading-[1.2] tracking-[-0.035em]">
                  {s.title}
                </h2>
                <button
                  type="button"
                  onClick={() => void copyLink(s.id)}
                  className="mt-0.5 rounded-[6px] p-1 text-faint opacity-100 transition-opacity hover:bg-black/[0.04] hover:text-ink focus-visible:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                  aria-label={`Copy link to ${s.title}`}
                >
                  <Link2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1.5 text-[14px] text-muted">{s.summary}</p>
              <div className="mt-5 space-y-4">{s.body}</div>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
