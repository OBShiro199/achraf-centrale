"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Mic, MicOff, PhoneOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { callFunction } from "@/lib/supabase/client";
import { cn, duration, formatPhone } from "@/lib/utils";
import { OUTCOME_LABEL, type Outcome } from "@/lib/unibox";

type Phase = "starting" | "ringing" | "live" | "ended" | "failed";

interface ActiveCall {
  callId: string;
  name: string;
  firm: string;
  to: string;
  phase: Phase;
  answeredAt: number | null;
  error?: string;
}

// The SDK's call object; typed loosely so the SDK loads only in the browser, on first use.
type RtcCall = { state: string; hangup: () => void; muteAudio: () => void; unmuteAudio: () => void; cause?: string };
type RtcClient = {
  connect: () => Promise<void> | void;
  disconnect: () => void;
  newCall: (o: Record<string, unknown>) => RtcCall;
  on: (event: string, cb: (arg: unknown) => void) => void;
  remoteElement?: string;
};

const DialerContext = createContext<{ dial: (investorId: number) => void; busy: boolean } | null>(null);

export function useDialer() {
  const ctx = useContext(DialerContext);
  if (!ctx) throw new Error("useDialer outside DialerProvider");
  return ctx;
}

const TAGS: Outcome[] = ["interested", "meeting", "call_back", "not_now", "not_interested", "voicemail", "no_answer"];

/**
 * The browser phone. One call at a time: the founder presses Call on an investor, Centrale records the intent,
 * then the browser dials through Telnyx and the server connects the investor from the founder's own US number,
 * telling them the call may be recorded. When it ends the founder can tag the outcome; Claude tags it from the
 * transcript as well, and never overrides the founder's choice.
 */
export function DialerProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [notes, setNotes] = useState("");
  const [tag, setTag] = useState<Outcome | null>(null);
  const client = useRef<RtcClient | null>(null);
  const rtcCall = useRef<RtcCall | null>(null);
  /** Set when the founder hangs up before the browser has placed the call, so it is never placed. */
  const cancelled = useRef(false);

  useEffect(() => {
    if (call?.phase !== "live") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [call?.phase]);

  useEffect(() => () => client.current?.disconnect(), []);

  const ensureClient = useCallback(async () => {
    if (client.current) return client.current;
    const [{ TelnyxRTC }, { token }] = await Promise.all([import("@telnyx/webrtc"), callFunction<{ token: string }>("phone", { action: "token" })]);
    const c = new TelnyxRTC({ login_token: token }) as unknown as RtcClient;
    c.remoteElement = "centrale-remote-audio";
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        c.disconnect();
        reject(new Error("Could not reach the phone service. Check your connection."));
      }, 12000);
      c.on("telnyx.ready", () => {
        clearTimeout(timer);
        resolve();
      });
      c.on("telnyx.error", () => {
        clearTimeout(timer);
        reject(new Error("The phone service refused to connect."));
      });
      c.connect();
    });
    c.on("telnyx.notification", (n) => {
      const note = n as { type?: string; call?: RtcCall };
      if (note.type !== "callUpdate" || !note.call || note.call !== rtcCall.current) return;
      const state = note.call.state;
      setCall((cur) => {
        if (!cur || cur.phase === "ended" || cur.phase === "failed") return cur;
        if (state === "active") return { ...cur, phase: "live", answeredAt: cur.answeredAt ?? Date.now() };
        if (state === "hangup" || state === "destroy") {
          if (cur.answeredAt) return { ...cur, phase: "ended" };
          const cause = String(note.call?.cause ?? "").toUpperCase();
          const why = cause.includes("BUSY") ? "The line was busy." : cause.includes("REJECT") || cause.includes("DECLINE") ? "The call was declined." : "They did not pick up.";
          return { ...cur, phase: "ended", error: why };
        }
        if (state === "ringing" || state === "trying" || state === "early") return { ...cur, phase: "ringing" };
        return cur;
      });
    });
    client.current = c;
    return c;
  }, []);

  const dial = useCallback(
    async (investorId: number) => {
      if (call && call.phase !== "ended" && call.phase !== "failed") {
        toast({ title: "You are already on a call", tone: "error" });
        return;
      }
      setMuted(false);
      setNotes("");
      setTag(null);
      cancelled.current = false;
      rtcCall.current = null;
      let callId: string | null = null;
      try {
        // Microphone first, so a refused prompt never records a call or rings anyone.
        await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop()));
        const start = await callFunction<{ call_id: string; to: string; from: string; name: string; firm: string }>("phone", { action: "start", investor_id: investorId });
        callId = start.call_id;
        setCall({ callId: start.call_id, name: start.name, firm: start.firm, to: start.to, phase: "starting", answeredAt: null });
        const c = await ensureClient();
        if (cancelled.current) throw new Error("cancelled");
        rtcCall.current = c.newCall({ destinationNumber: start.to, callerNumber: start.from, audio: true, video: false });
      } catch (err) {
        if (callId) void callFunction("phone", { action: "abandon", call_id: callId }).catch(() => {});
        if (err instanceof Error && err.message === "cancelled") return;
        const msg = err instanceof Error ? (err.name === "NotAllowedError" ? "Allow microphone access to call from the browser." : err.message) : "Could not start the call";
        setCall((cur) => (cur ? { ...cur, phase: "failed", error: msg } : null));
        if (!callId) toast({ title: "Could not call", body: msg, tone: "error" });
      }
    },
    [call, ensureClient, toast],
  );

  function hangup() {
    cancelled.current = true;
    rtcCall.current?.hangup();
    setCall((cur) => (cur ? { ...cur, phase: "ended", error: cur.answeredAt ? undefined : "You hung up before they answered." } : cur));
  }

  function toggleMute() {
    if (!rtcCall.current) return;
    if (muted) rtcCall.current.unmuteAudio();
    else rtcCall.current.muteAudio();
    setMuted(!muted);
  }

  async function saveTag() {
    if (!call || !tag) {
      setCall(null);
      return;
    }
    try {
      await callFunction("phone", { action: "tag", call_id: call.callId, outcome: tag, notes });
      toast({ title: "Call saved", body: `${call.name} tagged ${OUTCOME_LABEL[tag].toLowerCase()}.` });
    } catch (err) {
      toast({ title: "Could not save the tag", body: err instanceof Error ? err.message : undefined, tone: "error" });
    }
    setCall(null);
  }

  const live = call?.phase === "live" && call.answeredAt ? duration((now - call.answeredAt) / 1000) : null;
  const done = call?.phase === "ended" || call?.phase === "failed";

  return (
    <DialerContext.Provider value={{ dial: (id) => void dial(id), busy: Boolean(call && !done) }}>
      {children}
      <audio id="centrale-remote-audio" autoPlay className="hidden" />
      {call && (
        <div role="dialog" aria-label={`Call with ${call.name}`} className="settle fixed bottom-4 right-4 z-50 w-[min(340px,calc(100vw-32px))] rounded-[12px] border border-line bg-panel p-4 shadow-[0_24px_60px_-24px_rgba(57,28,37,0.45)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-ink">{call.name}</p>
              <p className="truncate text-[12.5px] text-muted">
                {call.firm}, {formatPhone(call.to)}
              </p>
            </div>
            {done && (
              <button onClick={() => setCall(null)} className="rounded-[6px] p-1 text-label hover:bg-black/[0.04]" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className={cn("mt-3 text-[13px]", call.phase === "failed" ? "text-pencil" : "text-ink")}>
            {call.phase === "starting" && "Connecting"}
            {call.phase === "ringing" && "Ringing"}
            {call.phase === "live" && <span className="tabular">Live {live}</span>}
            {call.phase === "ended" && (call.error ?? "Call ended. The recording and summary appear in your Inbox in a minute.")}
            {call.phase === "failed" && (call.error ?? "The call could not connect.")}
          </p>
          {!done ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={toggleMute} disabled={call.phase !== "live"}>
                {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />} {muted ? "Unmute" : "Mute"}
              </Button>
              <Button size="sm" variant="primary" className="bg-pencil" onClick={hangup}>
                <PhoneOff className="h-3.5 w-3.5" /> Hang up
              </Button>
            </div>
          ) : call.phase === "ended" ? (
            <div className="mt-3">
              <p className="text-[12px] text-label">How did it go?</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {TAGS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTag(t === tag ? null : t)}
                    className={cn("rounded-full border px-2.5 py-1 text-[12px]", t === tag ? "border-ink bg-ink text-ivory" : "border-line text-ink hover:border-label")}
                  >
                    {OUTCOME_LABEL[t]}
                  </button>
                ))}
              </div>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="mt-2 min-h-[60px] text-[13px]" />
              <Button size="sm" variant="primary" className="mt-2 w-full" onClick={() => void saveTag()}>
                {tag ? "Save" : "Close"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </DialerContext.Provider>
  );
}
