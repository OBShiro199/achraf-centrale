"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { useApp } from "@/components/app/context";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, CardHeader, Pill, Settle } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Startup } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SetupInboxButton } from "@/components/app/setup-inbox";

const FOLLOW_UP_DAYS = [2, 3, 4, 5, 7, 10, 14];

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("h-5 w-9 shrink-0 rounded-full p-[3px] transition-colors", on ? "bg-burgundy" : "bg-faint")}
    >
      <span className={cn("block h-3.5 w-3.5 rounded-full bg-panel transition-transform", on && "translate-x-4")} />
    </button>
  );
}

function FollowUps() {
  const { startup, setStartup } = useApp();
  const toast = useToast();
  const [auto, setAuto] = useState(startup.auto_follow_up);
  const [days, setDays] = useState(startup.follow_up_days);
  const [saving, setSaving] = useState(false);
  const dirty = auto !== startup.auto_follow_up || days !== startup.follow_up_days;
  const options = FOLLOW_UP_DAYS.includes(startup.follow_up_days)
    ? FOLLOW_UP_DAYS
    : [...FOLLOW_UP_DAYS, startup.follow_up_days].sort((a, b) => a - b);

  async function save() {
    setSaving(true);
    const { data, error } = await createClient()
      .from("startups")
      .update({ auto_follow_up: auto, follow_up_days: days })
      .eq("id", startup.id)
      .select()
      .single<Startup>();
    setSaving(false);
    if (error) return toast({ title: "Could not save", body: error.message, tone: "error" });
    setStartup(data);
    toast({ title: "Saved", body: auto ? `Follow-ups go after ${days} days without a reply.` : "Automatic follow-ups are off." });
  }

  return (
    <Card>
      <CardHeader title="Follow-ups" sub="One short nudge to each investor who has not replied to your first email." />
      <div className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13.5px] font-medium text-ink">Send follow-ups automatically</p>
            <p className="mt-0.5 max-w-[480px] text-[12.5px] leading-relaxed text-label">
              Each one waits in the Outbox before it sends, so you can edit or cancel it. A reply from the investor cancels it.
            </p>
          </div>
          <Switch on={auto} onChange={setAuto} label="Send follow-ups automatically" />
        </div>
        <Field label="Wait before following up" hint="Counted from when your first email went out." className="md:max-w-[260px]">
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={!auto}>
            {options.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end border-t border-line-2 px-5 py-3">
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? "Saving" : "Save"}
        </Button>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { profile, setProfile, inbox } = useApp();
  const router = useRouter();
  const toast = useToast();
  const [first, setFirst] = useState(profile.first_name ?? "");
  const [last, setLast] = useState(profile.last_name ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { data, error } = await createClient()
      .from("profiles")
      .update({ first_name: first.trim(), last_name: last.trim() || null })
      .eq("id", profile.id)
      .select()
      .single<Profile>();
    setSaving(false);
    if (error) return toast({ title: "Could not save", body: error.message, tone: "error" });
    setProfile(data);
    toast({ title: "Saved" });
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-5 px-4 py-8 md:px-8">
      <Settle>
        <h2 className="text-[26px] tracking-[-0.04em]">Settings</h2>
      </Settle>

      <Settle delay={60}>
        <Card>
          <CardHeader title="Account" />
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="First name">
              <Input value={first} onChange={(e) => setFirst(e.target.value)} />
            </Field>
            <Field label="Last name">
              <Input value={last} onChange={(e) => setLast(e.target.value)} />
            </Field>
            <Field label="Login email" className="md:col-span-2" hint="Reply notifications go here.">
              <Input value={profile.email} disabled />
            </Field>
          </div>
          <div className="flex justify-end border-t border-line-2 px-5 py-3">
            <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving || !first.trim()}>
              {saving ? "Saving" : "Save"}
            </Button>
          </div>
        </Card>
      </Settle>

      <Settle delay={120}>
        <Card>
          <CardHeader title="Sending inbox" sub="Created for you at signup. Investors see this address." />
          {inbox ? (
            <dl className="grid gap-4 p-5 text-[13.5px] md:grid-cols-2">
              <div>
                <dt className="text-[12px] text-label">Address</dt>
                <dd className="mt-0.5 font-medium text-ink">{inbox.address}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-label">Sender name</dt>
                <dd className="mt-0.5 text-ink">{inbox.display_name}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-label">Status</dt>
                <dd className="mt-1">
                  <Pill tone={inbox.status === "active" ? "green" : "red"}>{inbox.status === "active" ? "Sending" : "Paused"}</Pill>
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-label">Daily first-email limit</dt>
                <dd className="mt-0.5 text-ink">20 while the inbox is under 30 days old</dd>
              </div>
            </dl>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-[13.5px] text-muted">Your sending inbox has not been created yet.</p>
              <SetupInboxButton onError={(m) => toast({ title: "Inbox not created", body: m, tone: "error" })} />
            </div>
          )}
        </Card>
      </Settle>

      <Settle delay={180}>
        <FollowUps />
      </Settle>

      <Settle delay={240}>
        <Card>
          <CardHeader title="Session" />
          <div className="flex items-center justify-between p-5">
            <p className="text-[13.5px] text-muted">Signed in as {profile.email}</p>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                await createClient().auth.signOut();
                router.push("/");
                router.refresh();
              }}
            >
              <LogOut className="h-3.5 w-3.5" /> Log out
            </Button>
          </div>
        </Card>
      </Settle>
    </div>
  );
}
