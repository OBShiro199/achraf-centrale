"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { DashboardStats, Inbox, Profile, Startup } from "@/lib/types";

interface AppState {
  profile: Profile;
  startup: Startup;
  inbox: Inbox | null;
  signedUpAt: string;
  /** Stats as of page load, from the server. Pages refresh their own copy after actions. */
  initialStats: DashboardStats | null;
  setProfile: (p: Profile) => void;
  setStartup: (s: Startup) => void;
  unread: number;
  setUnread: (n: number) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({
  initial,
  children,
}: {
  initial: { profile: Profile; startup: Startup; inbox: Inbox | null; signedUpAt: string; stats: DashboardStats | null };
  children: ReactNode;
}) {
  const [profile, setProfile] = useState(initial.profile);
  const [startup, setStartup] = useState(initial.startup);
  const [unread, setUnread] = useState(0);
  return (
    <Ctx.Provider value={{ profile, startup, inbox: initial.inbox, signedUpAt: initial.signedUpAt, initialStats: initial.stats, setProfile, setStartup, unread, setUnread }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
