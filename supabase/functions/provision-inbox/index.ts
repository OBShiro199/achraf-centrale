// Gives a founder their own OpenMail inbox (in their own pod) on signup.
// Idempotent: returns the existing inbox if one is already active.
import { admin, HttpError, json, requireUser, serve, SUPABASE_URL } from "../_shared/core.ts";
import { openmail, OpenMailError, type OMInbox } from "../_shared/openmail.ts";

function slug(s: string | null | undefined) {
  return (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function mailboxCandidates(first: string, company: string) {
  const base = [slug(first), slug(company)].filter(Boolean).join("-").slice(0, 24).replace(/-+$/, "") || "founder";
  const padded = base.length >= 3 ? base : `${base}-hq`;
  const rand = () => Math.floor(100 + Math.random() * 900);
  return [padded, `${padded}-${rand()}`, `${padded}-${rand()}`, `founder-${crypto.randomUUID().slice(0, 8)}`];
}

async function ensurePod(userId: string, label: string): Promise<string | undefined> {
  try {
    const pod = await openmail<{ id: string }>("/v1/pods", { body: { clientId: userId, name: label.slice(0, 200) } });
    return pod.id;
  } catch (err) {
    if (err instanceof OpenMailError && err.status === 409) {
      const pod = await openmail<{ id: string }>(`/v1/pods/${encodeURIComponent(userId)}`);
      return pod.id;
    }
    // Pods are an isolation nicety; fall back to the default pod rather than blocking signup.
    console.warn("pod creation failed, using default pod", err);
    return undefined;
  }
}

serve(async (req) => {
  const user = await requireUser(req);

  const { data: existing } = await admin
    .from("inboxes")
    .select("*")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return json({ ok: true, inbox: existing, created: false });

  const [{ data: profile }, { data: startup }] = await Promise.all([
    admin.from("profiles").select("first_name,last_name,email").eq("id", user.id).single(),
    admin.from("startups").select("name,domain").eq("owner_id", user.id).single(),
  ]);

  const first = profile?.first_name ?? user.email?.split("@")[0] ?? "founder";
  const company = startup?.name ?? startup?.domain?.split(".")[0] ?? "";
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || first;
  const podId = await ensurePod(user.id, `${company || displayName} (${user.email})`);

  let inbox: OMInbox | null = null;
  let lastError: unknown;
  for (const mailboxName of mailboxCandidates(first, company)) {
    try {
      inbox = await openmail<OMInbox>("/v1/inboxes", {
        body: {
          mailboxName,
          displayName: company ? `${displayName} at ${company}` : displayName,
          webhookUrl: `${SUPABASE_URL}/functions/v1/openmail-webhook`,
          ...(podId ? { podId } : {}),
        },
      });
      break;
    } catch (err) {
      lastError = err;
      if (err instanceof OpenMailError && /maximum|limit/i.test(err.message)) break;
      if (!(err instanceof OpenMailError && (err.status === 409 || err.status === 400))) throw err;
    }
  }
  if (!inbox) {
    if (lastError instanceof OpenMailError && /maximum|limit/i.test(lastError.message)) {
      throw new HttpError(409, "The email account has reached its inbox limit. Raise the plan limit in OpenMail, then press Set up inbox.");
    }
    throw lastError ?? new Error("Could not create an inbox");
  }

  if (inbox.webhookSecret) {
    await admin.rpc("store_inbox_secret", { p_inbox_id: inbox.id, p_secret: inbox.webhookSecret });
  }

  const { data: row, error } = await admin
    .from("inboxes")
    .insert({
      owner_id: user.id,
      openmail_inbox_id: inbox.id,
      openmail_pod_id: inbox.podId ?? podId ?? null,
      address: inbox.address,
      display_name: inbox.displayName ?? displayName,
    })
    .select()
    .single();
  if (error) throw error;

  return json({ ok: true, inbox: row, created: true });
});
