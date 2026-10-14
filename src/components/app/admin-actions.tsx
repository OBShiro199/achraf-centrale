"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card, CardHeader } from "@/components/ui/kit";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/utils";

const STATUSES = ["active", "trialing", "past_due", "canceled", "expired"];
const ACTIONS: Record<string, string> = {
  set_plan: "Set plan",
  pause_inbox: "Paused inbox",
  resume_inbox: "Resumed inbox",
  block_address: "Blocked address",
  unblock_address: "Unblocked address",
};

interface Action {
  at: string;
  by: string | null;
  action: string;
  target: string;
  detail: { plan?: string; status?: string } | null;
}

/** Staff controls: plan changes, inbox pauses and manual address blocks, with a log of recent actions. */
export function AdminActions({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);
  const [log, setLog] = useState<Action[]>([]);
  const [founder, setFounder] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("active");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const loadLog = useCallback(async () => {
    const { data } = await createClient().rpc("admin_recent_actions");
    setLog((data as Action[] | null) ?? []);
  }, []);

  useEffect(() => {
    void createClient()
      .from("plans")
      .select("id, name")
      .then(({ data }) => {
        setPlans(data ?? []);
        if (data?.length) setPlan((p) => p || data[0].id);
      });
    void loadLog();
  }, [loadLog]);

  async function run(key: string, fn: string, args: Record<string, unknown>, done: string) {
    setBusy(key);
    const { error } = await createClient().rpc(fn, args);
    setBusy(null);
    if (error) return toast({ title: "Not done", body: error.message.replace(/^[a-z_]+: /, ""), tone: "error" });
    toast({ title: done });
    void loadLog();
    onChanged();
  }

  const email = founder.trim();
  const blocked = address.trim();

  return (
    <Card>
      <CardHeader title="Actions" sub="Whop overwrites a manual plan change the next time it sends an update for that founder." />
      <div className="grid gap-6 p-5 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Founder login email">
            <Input value={founder} placeholder="founder@startup.com" onChange={(e) => setFounder(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Plan">
              <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={!email || !plan || !!busy} onClick={() => void run("plan", "admin_set_plan", { p_email: email, p_plan: plan, p_status: status }, `Plan set for ${email}`)}>
              {busy === "plan" ? "Saving" : "Set plan"}
            </Button>
            <Button size="sm" disabled={!email || !!busy} onClick={() => void run("pause", "admin_set_inbox", { p_email: email, p_active: false }, `Inbox paused for ${email}`)}>
              Pause inbox
            </Button>
            <Button size="sm" disabled={!email || !!busy} onClick={() => void run("resume", "admin_set_inbox", { p_email: email, p_active: true }, `Inbox resumed for ${email}`)}>
              Resume inbox
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          <Field label="Investor email to block" hint="Blocks sending to this address for every founder and cancels anything queued to it.">
            <Input value={address} placeholder="partner@fund.com" onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" disabled={!blocked || !!busy} onClick={() => void run("block", "admin_block_address", { p_email: blocked, p_block: true }, `${blocked} blocked`)}>
              Block
            </Button>
            <Button size="sm" disabled={!blocked || !!busy} onClick={() => void run("unblock", "admin_block_address", { p_email: blocked, p_block: false }, `${blocked} unblocked`)}>
              Lift a manual block
            </Button>
          </div>
        </div>
      </div>
      {log.length > 0 && (
        <div className="divide-y divide-line-2 border-t border-line">
          {log.map((a) => (
            <div key={`${a.at}-${a.action}-${a.target}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2 text-[12.5px]">
              <span className="text-body">
                {ACTIONS[a.action] ?? a.action} <span className="font-medium text-ink">{a.target}</span>
                {a.detail?.plan && ` to ${a.detail.plan}, ${a.detail.status}`}
              </span>
              <span className="text-label">
                {a.by ?? "staff"}, {timeAgo(a.at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
