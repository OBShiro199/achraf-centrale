"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Inbox, Profile, Startup } from "@/lib/types";

interface AppState {
  profile: Profile;
  startup: Startup;
  inbox: Inbox | null;
  signedUpAt: string;
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
  initial: { profile: Profile; startup: Startup; inbox: Inbox | null; signedUpAt: string };
  children: ReactNode;
}) {
  const [profile, setProfile] = useState(initial.profile);
  const [startup, setStartup] = useState(initial.startup);
  const [unread, setUnread] = useState(0);
  return (
    <Ctx.Provider value={{ profile, startup, inbox: initial.inbox, signedUpAt: initial.signedUpAt, setProfile, setStartup, unread, setUnread }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
