// The founder's unified inbox, read live from OpenMail.
// Actions: threads | thread | reply | mark_read
import { admin, HttpError, json, readJson, requireUser, serve } from "../_shared/core.ts";
import { openmail, OpenMailError, type OMMessage, type OMSendResult, type OMThread } from "../_shared/openmail.ts";
import { toTrackedHtml } from "../_shared/mail.ts";

interface Body {
  action?: "threads" | "thread" | "reply" | "mark_read";
  thread_id?: string;
  body?: string;
}

serve(async (req) => {
  const user = await requireUser(req);
  const input = await readJson<Body>(req);

  const { data: inbox } = await admin
    .from("inboxes")
    .select("*")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!inbox) return json({ inbox: null, threads: [] });

  const inboxPath = `/v1/inboxes/${inbox.openmail_inbox_id}`;

  // Threads are only reachable through the founder's own inbox.
  async function loadThread(threadId: string) {
    const thread = await openmail<{ threadId: string; inboxId: string; subject: string; isRead: boolean; data: OMMessage[] }>(
      `/v1/threads/${encodeURIComponent(threadId)}/messages`,
    );
    if (thread.inboxId !== inbox.openmail_inbox_id) throw new HttpError(404, "Thread not found");
    return thread;
  }

  switch (input.action ?? "threads") {
    case "threads": {
      const { data: threads } = await openmail<{ data: OMThread[] }>(`${inboxPath}/threads?limit=50`);
      const ids = threads.map((t) => t.id);
      const { data: rows } = ids.length
        ? await admin
          .from("outreach_messages")
          .select("openmail_thread_id, direction, from_addr, investor:investors(id, full_name, firm)")
          .eq("owner_id", user.id)
          .in("openmail_thread_id", ids)
          .order("sent_at", { ascending: false })
        : { data: [] };
      const byThread = new Map<string, unknown>();
      const senderByThread = new Map<string, string>();
      for (const r of rows ?? []) {
        if (r.investor && !byThread.has(r.openmail_thread_id)) byThread.set(r.openmail_thread_id, r.investor);
        // Non-investor threads fall back to whoever last wrote in.
        if (r.direction === "inbound" && r.from_addr && !senderByThread.has(r.openmail_thread_id)) {
          senderByThread.set(r.openmail_thread_id, r.from_addr);
        }
      }
      return json({
        inbox: { address: inbox.address, display_name: inbox.display_name },
        threads: threads.map((t) => ({ ...t, investor: byThread.get(t.id) ?? null, sender: senderByThread.get(t.id) ?? null })),
      });
    }

    case "thread": {
      if (!input.thread_id) throw new HttpError(400, "Missing thread");
      const thread = await loadThread(input.thread_id);
      const { data: link } = await admin
        .from("outreach_messages")
        .select("investor:investors(id, full_name, firm, email)")
        .eq("owner_id", user.id)
        .eq("openmail_thread_id", input.thread_id)
        .not("investor_id", "is", null)
        .limit(1)
        .maybeSingle();
      return json({
        thread: {
          id: thread.threadId,
          subject: thread.subject,
          isRead: thread.isRead,
          investor: link?.investor ?? null,
          // Text only: rendering our own outbound HTML would fire the open pixel.
          messages: thread.data.map((m) => ({
            id: m.id,
            direction: m.direction,
            from: m.fromAddr,
            to: m.toAddr,
            subject: m.subject,
            text: m.bodyText,
            status: m.status,
            createdAt: m.createdAt,
          })),
        },
      });
    }

    case "reply": {
      if (!input.thread_id || !input.body?.trim()) throw new HttpError(400, "Write a reply first");
      const thread = await loadThread(input.thread_id);
      const lastInbound = [...thread.data].reverse().find((m) => m.direction === "inbound");
      const to = (lastInbound?.fromAddr ?? thread.data[0]?.toAddr ?? "").replace(/^.*<(.+)>.*$/, "$1");
      if (!to) throw new HttpError(400, "No one to reply to in this thread");

      const { data: link } = await admin
        .from("outreach_messages")
        .select("investor_id")
        .eq("owner_id", user.id)
        .eq("openmail_thread_id", input.thread_id)
        .not("investor_id", "is", null)
        .limit(1)
        .maybeSingle();

      const outreachId = crypto.randomUUID();
      let result: OMSendResult;
      try {
        result = await openmail<OMSendResult>(`${inboxPath}/send`, {
          body: { to, threadId: input.thread_id, body: toTrackedHtml(input.body, outreachId) },
          idempotencyKey: outreachId,
        });
      } catch (err) {
        if (err instanceof OpenMailError && err.status === 429) throw new HttpError(429, "Sending limit reached, try again shortly");
        throw err;
      }
      await admin.from("outreach_messages").insert({
        id: outreachId,
        owner_id: user.id,
        investor_id: link?.investor_id ?? null,
        inbox_id: inbox.id,
        direction: "outbound",
        openmail_message_id: result.messageId,
        openmail_thread_id: result.threadId,
        from_addr: inbox.address,
        to_addr: to,
        subject: `Re: ${thread.subject}`,
        body: input.body.trim(),
        status: result.status,
      });
      return json({ ok: true });
    }

    case "mark_read": {
      if (!input.thread_id) throw new HttpError(400, "Missing thread");
      await loadThread(input.thread_id);
      await openmail(`/v1/threads/${encodeURIComponent(input.thread_id)}`, { method: "PATCH", body: { isRead: true } });
      return json({ ok: true });
    }

    default:
      throw new HttpError(400, "Unknown action");
  }
});
