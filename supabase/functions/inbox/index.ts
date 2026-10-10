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

  // The active inbox sends; inboxes retired by a domain switch still hold earlier threads, so they are read too.
  const { data: inboxes } = await admin
    .from("inboxes")
    .select("*")
    .eq("owner_id", user.id)
    .in("status", ["active", "retired"])
    .order("created_at", { ascending: false });
  const inbox = (inboxes ?? []).find((i) => i.status === "active");
  if (!inbox) return json({ inbox: null, threads: [] });
  const owned = new Map((inboxes ?? []).map((i) => [i.openmail_inbox_id as string, i]));

  // Threads are only reachable through the founder's own inboxes.
  async function loadThread(threadId: string) {
    const thread = await openmail<{ threadId: string; inboxId: string; subject: string; isRead: boolean; data: OMMessage[] }>(
      `/v1/threads/${encodeURIComponent(threadId)}/messages`,
    );
    const from = owned.get(thread.inboxId);
    if (!from) throw new HttpError(404, "Thread not found");
    return { ...thread, from };
  }

  switch (input.action ?? "threads") {
    case "threads": {
      // Retired inboxes on a previous mail account may be gone; skip them rather than fail.
      const lists = await Promise.all(
        [...owned.values()].map((i) =>
          openmail<{ data: OMThread[] }>(`/v1/inboxes/${i.openmail_inbox_id}/threads?limit=50`)
            .then((r) => r.data)
            .catch((err) => {
              if (i.status === "active") throw err;
              return [] as OMThread[];
            })
        ),
      );
      const threads = lists.flat().sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt)).slice(0, 80);
      const ids = threads.map((t) => t.id);
      const { data: rows } = ids.length
        ? await admin
          .from("outreach_messages")
          .select("openmail_thread_id, direction, from_addr, investor:investors_achraf(id, full_name, firm)")
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
        .select("investor:investors_achraf(id, full_name, firm, email)")
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
        // Reply from the address the thread started on, so the investor sees one conversation.
        result = await openmail<OMSendResult>(`/v1/inboxes/${thread.from.openmail_inbox_id}/send`, {
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
        inbox_id: thread.from.id,
        direction: "outbound",
        kind: "reply",
        openmail_message_id: result.messageId,
        openmail_thread_id: result.threadId,
        from_addr: thread.from.address,
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
