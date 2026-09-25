"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Building2, Check, Copy, CreditCard, House, Inbox as InboxIcon, LogOut, Menu, Settings, Users } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/landing/logo";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { brandConfetti } from "@/components/ui/kit";
import { callFunction, createClient } from "@/lib/supabase/client";
import type { OutreachMessage, ThreadSummary } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { useApp } from "./context";
import { SetupInboxButton } from "./setup-inbox";

const NAV = [
  { href: "/dashboard", label: "Home", icon: House },
  { href: "/dashboard/investors", label: "Investors", icon: Users },
  { href: "/dashboard/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/dashboard/profile", label: "Startup profile", icon: Building2 },
];
const NAV_2 = [
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

const TITLES: Record<string, string> = {
  "/dashboard": "Home",
  "/dashboard/investors": "Investors",
  "/dashboard/inbox": "Inbox",
  "/dashboard/profile": "Startup profile",
  "/dashboard/settings": "Settings",
  "/dashboard/billing": "Billing",
};

function Favicon({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken)
    return (
      <span className={cn("flex items-center justify-center rounded-[6px] bg-burgundy text-[12px] font-semibold text-ivory", className)}>
        {initials(name) || "C"}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt=""
      onError={() => setBroken(true)}
      className={cn("rounded-[6px] border border-line bg-panel object-contain p-[3px]", className)}
    />
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof House;
  badge?: number;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const active = href === "/dashboard" ? path === href : path.startsWith(href);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group relative flex h-8 items-center gap-2.5 rounded-[6px] px-2.5 text-[13.5px] transition-colors",
        active
          ? "border border-[#e2d7c9] bg-panel text-ink shadow-[0_1px_0_rgba(57,28,37,0.04)]"
          : "border border-transparent text-muted hover:bg-black/[0.03] hover:text-ink",
      )}
    >
      <Icon className={cn("h-[15px] w-[15px]", active ? "text-vermilion" : "text-label group-hover:text-muted")} strokeWidth={1.8} />
      {label}
      {!!badge && (
        <span className="ml-auto rounded-[4px] bg-vermilion px-1.5 text-[11px] font-semibold leading-[18px] text-ivory">{badge}</span>
      )}
    </Link>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, startup, unread } = useApp();
  const router = useRouter();
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email;

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-3 pt-4">
        <Link
          href="/dashboard/profile"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-[8px] p-1.5 hover:bg-black/[0.03]"
        >
          <Favicon src={startup.favicon_url} name={startup.name ?? "C"} className="h-8 w-8" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[14px] font-semibold text-ink">{startup.name ?? startup.domain}</span>
            <span className="block truncate text-[12px] text-label">{startup.domain}</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((n) => (
          <NavLink key={n.href} {...n} badge={n.href === "/dashboard/inbox" ? unread : undefined} onNavigate={onNavigate} />
        ))}
        <div className="my-3 h-px bg-line" />
        {NAV_2.map((n) => (
          <NavLink key={n.href} {...n} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="px-3 pb-3">
        <div className="mb-3 px-2.5">
          <Wordmark className="h-[14px] w-auto opacity-80" />
        </div>
        <div className="flex items-center gap-2.5 rounded-[8px] border border-line bg-panel p-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#efe3e6] text-[12px] font-semibold text-burgundy">
            {initials(name)}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-medium text-ink">{name}</span>
            <span className="block truncate text-[11.5px] text-label">{profile.email}</span>
          </span>
          <button
            onClick={async () => {
              await createClient().auth.signOut();
              router.push("/");
              router.refresh();
            }}
            className="rounded-[6px] p-1.5 text-label hover:bg-black/[0.04] hover:text-ink"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}

function InboxChip() {
  const { inbox } = useApp();
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  if (!inbox)
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-[12.5px] text-label sm:inline">No sending inbox yet</span>
        <SetupInboxButton onError={(m) => toast({ title: "Inbox not created", body: m, tone: "error" })} />
      </div>
    );
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(inbox.address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
      className="group flex h-8 max-w-full items-center gap-2 rounded-[6px] border border-line bg-panel px-2.5 text-[12.5px] text-ink shadow-[0_1px_0_rgba(57,28,37,0.03)] hover:border-[#d5c8ba]"
      title="Your sending inbox. Click to copy."
    >
      <span className="pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-green" />
      <span className="truncate">{inbox.address}</span>
      {copied ? <Check className="h-3.5 w-3.5 text-green" /> : <Copy className="h-3.5 w-3.5 text-label group-hover:text-muted" />}
    </button>
  );
}

/** Listens for investor replies: confetti, a toast and a fresh unread count. */
function ReplyWatcher() {
  const { profile, setUnread } = useApp();
  const toast = useToast();

  useEffect(() => {
    const refresh = () =>
      callFunction<{ threads: ThreadSummary[] }>("inbox", { action: "threads" })
        .then((r) => setUnread(r.threads.filter((t) => !t.isRead).length))
        .catch(() => {});
    void refresh();

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Realtime applies RLS with the socket's token, so attach the session before joining.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) void supabase.realtime.setAuth(data.session.access_token);
      channel = subscribe();
    });

    const subscribe = () =>
      supabase
        .channel(`replies:${profile.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "outreach_messages",
            filter: `owner_id=eq.${profile.id}`,
          },
          async (payload) => {
            const m = payload.new as OutreachMessage;
            if (m.direction !== "inbound") return;
            void refresh();
            let who = m.from_addr ?? "Someone";
            if (m.investor_id) {
              const { data } = await supabase.from("investors").select("full_name,firm").eq("id", m.investor_id).single();
              if (data) who = `${data.full_name} from ${data.firm}`;
              void brandConfetti();
            }
            toast({ title: `${who} replied`, body: m.subject ?? undefined });
          },
        )
        .subscribe();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [profile.id, setUnread, toast]);

  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const title = TITLES[path] ?? "Centrale";

  return (
    <ToastProvider>
      <ReplyWatcher />
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[244px] shrink-0 border-r border-line bg-[#f1eadf]/60 lg:block">
          <Sidebar />
        </aside>

        <AnimatePresence>
          {menu && (
            <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-[#2c141c]/20" onClick={() => setMenu(false)} />
              <motion.aside
                initial={{ x: -30 }}
                animate={{ x: 0 }}
                exit={{ x: -30 }}
                className="absolute inset-y-0 left-0 w-[260px] border-r border-line bg-paper"
              >
                <Sidebar onNavigate={() => setMenu(false)} />
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex min-w-0 flex-1 flex-col bg-[#fbf8f3]">
          <header className="sticky top-0 z-30 flex h-[56px] items-center gap-3 border-b border-line bg-[#fbf8f3]/90 px-4 backdrop-blur md:px-6">
            <button
              className="-ml-1 rounded-[6px] p-1.5 text-muted hover:bg-black/[0.04] lg:hidden"
              onClick={() => setMenu(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <BrandMark className="h-4 w-4 lg:hidden" />
            <h1 className="font-sans text-[15px] font-semibold tracking-[-0.015em]">{title}</h1>
            <div className="ml-auto min-w-0">
              <InboxChip />
            </div>
          </header>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
