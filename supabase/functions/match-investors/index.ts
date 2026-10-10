// Matches a founder with investors from the directory in three steps:
// 1. Claude reads the startup profile and picks the investor-side keywords that fit it, choosing only
//    from the directory's own vocabulary, so every term is one real investors actually list.
// 2. The database scores every investor (sector focus, stage, specialty overlap, type, location, role)
//    and returns the best 60, one person per firm.
// 3. Claude reads those 60 firms and keeps the 25 that genuinely fit, with one sentence each on why.
import { admin, HttpError, json, requireUser, serve, userClient } from "../_shared/core.ts";
import { HOUSE_STYLE, structured, tidy } from "../_shared/claude.ts";
import { INVESTOR_TYPES, label, REVENUE, ROLES, SECTORS, STAGES, VALUES } from "../_shared/taxonomy.ts";

const VOCAB_SIZE = 1500;
const CANDIDATES = 60;
const PICKS = 25;

interface Candidate {
  id: number;
  full_name: string;
  title: string | null;
  headline: string | null;
  role: string;
  firm: string;
  investor_type: string;
  stages: string[];
  focus: string[];
  industry: string | null;
  country: string | null;
  city: string | null;
  size: string | null;
  score: number;
  reasons: string[];
}

serve(async (req) => {
  const user = await requireUser(req);
  const { data: startup } = await admin.from("startups").select("*").eq("owner_id", user.id).single();
  if (!startup) throw new HttpError(404, "Finish onboarding first");

  await admin.from("startups").update({ matches_status: "running" }).eq("owner_id", user.id);

  try {
    const profile = `<startup>
Name: ${startup.name}
One-liner: ${startup.one_liner ?? ""}
Summary: ${startup.summary ?? ""}
Business model: ${startup.business_model ?? ""}
Target customer: ${startup.target_customer ?? ""}
Sectors: ${(startup.sectors ?? []).map((s: string) => label(SECTORS, s)).join(", ")}
Keywords: ${(startup.keywords ?? []).join(", ")}
Location: ${startup.location ?? "not stated"}
Raising: ${label(STAGES, startup.stage)}${startup.raise_amount ? `, ${startup.raise_amount}` : ""}
Revenue: ${label(REVENUE, startup.revenue_band)}
Traction: ${startup.traction ?? "not stated"}
Values: ${(startup.values ?? []).map((v: string) => label(VALUES, v)).join(", ") || "none stated"}
Wants to hear from: ${(startup.investor_types ?? []).map((v: string) => label(INVESTOR_TYPES, v)).join(", ") || "any investor"}
</startup>`;

    // Step 1: pick match keywords from the words investors in the directory actually use.
    const [{ data: facets, error: facetError }, { data: total }] = await Promise.all([
      userClient(req).rpc("lead_facets"),
      userClient(req).rpc("directory_size"),
    ]);
    if (facetError) throw facetError;
    const maxDf = Math.max(50, Math.floor(Number(total ?? 300_000) * 0.2));
    const vocab = (((facets as Record<string, { value: string; n: number }[]>)?.specialty ?? []) as { value: string; n: number }[])
      .filter((k) => k.n >= 5 && k.n <= maxDf)
      .slice(0, VOCAB_SIZE)
      .map((k) => k.value);
    const vocabSet = new Set(vocab);

    const picked = await structured<{ keywords: string[]; country: string }>({
      system: `You match startups with investors. You will get a startup profile and a vocabulary of focus keywords taken from real investor profiles. Choose the 8 to 20 keywords an investor who would back this startup is most likely to list, most specific first. Prefer precise terms (for example "insurtech", "vertical saas", "creator economy") over broad ones ("technology", "innovation"). Only return keywords copied exactly from the vocabulary. Also return the startup's country in its common English name (for example "United Kingdom", "United States", "Germany"), or an empty string if it is not stated. ${HOUSE_STYLE}`,
      content: [{ type: "text", text: `${profile}\n\n<vocabulary>\n${vocab.join("\n")}\n</vocabulary>` }],
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["keywords", "country"],
        properties: {
          keywords: { type: "array", items: { type: "string" } },
          country: { type: "string" },
        },
      },
      effort: "low",
      maxTokens: 3000,
      track: { owner: user.id, feature: "match_keywords" },
    });
    const matchKeywords = [...new Set(picked.keywords.map((k) => k.trim().toLowerCase()))].filter((k) => vocabSet.has(k)).slice(0, 20);
    const country = picked.country.trim() || null;
    await admin.from("startups").update({ match_keywords: matchKeywords, country }).eq("owner_id", user.id);

    // Step 2: the database scores the whole directory with the new keywords.
    const { data: page, error: searchError } = await userClient(req).rpc("search_investors", {
      p_filters: { onePerFirm: true },
      p_sort: "match",
      p_dir: "desc",
      p_limit: CANDIDATES,
      p_offset: 0,
    });
    if (searchError) throw searchError;
    const candidates = ((page as { rows: Candidate[] })?.rows ?? []).filter((c) => c.score > 0);
    if (!candidates.length) {
      await admin.from("investor_matches").delete().eq("owner_id", user.id);
      await admin.from("startups").update({ matches_status: "done", matched_at: new Date().toISOString() }).eq("owner_id", user.id);
      return json({ ok: true, count: 0, keywords: matchKeywords });
    }

    const { data: details } = await admin
      .from("investors_achraf")
      .select("id, specialties, firm_about")
      .in("id", candidates.map((c) => c.id));
    const byId = new Map((details ?? []).map((d) => [Number(d.id), d]));

    // Step 3: Claude reads each firm and keeps the ones that genuinely fit.
    const list = candidates
      .map((c, i) => {
        const d = byId.get(c.id);
        const about = (d?.firm_about ?? "").replace(/\s+/g, " ").slice(0, 420);
        const specialties = String(d?.specialties ?? "").split(";").map((s) => s.trim()).filter(Boolean).slice(0, 25);
        return `<investor n="${i + 1}" id="${c.id}">
${c.full_name}, ${c.title ?? label(ROLES, c.role)} at ${c.firm} (${label(INVESTOR_TYPES, c.investor_type)}, ${[c.city, c.country].filter(Boolean).join(", ") || "location unknown"})
Stages: ${c.stages.join(", ") || "not stated"}
Sector focus: ${c.focus.join(", ") || "not stated"}
Firm industry: ${c.industry ?? "not stated"}
Specialties: ${specialties.join(", ")}
About the firm: ${about || "no description"}
</investor>`;
      })
      .join("\n");

    const ranked = await structured<{ picks: { id: string; fit: number; why: string }[] }>({
      system: `You shortlist investors for a founder. Read the startup and each investor, then keep up to ${PICKS} investors who would plausibly invest in this startup at its current stage, best first. Drop investors whose focus clearly does not fit (for example buyout firms for a pre-seed startup, or a sector the startup is not in). For each pick give fit from 1 (weak) to 5 (strong) and one sentence under 25 words on why, citing something specific from that investor's own data. Never invent portfolio companies, cheque sizes or facts that are not in the data. ${HOUSE_STYLE}`,
      content: [{ type: "text", text: `${profile}\n\n<investors>\n${list}\n</investors>` }],
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["picks"],
        properties: {
          picks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "fit", "why"],
              properties: {
                id: { type: "string" },
                fit: { type: "integer", minimum: 1, maximum: 5 },
                why: { type: "string" },
              },
            },
          },
        },
      },
      effort: "medium",
      maxTokens: 8000,
      track: { owner: user.id, feature: "match_shortlist" },
    });

    const valid = new Set(candidates.map((c) => c.id));
    const seen = new Set<number>();
    const picks = ranked.picks
      .map((p) => ({ ...p, id: Number(p.id) }))
      .filter((p) => valid.has(p.id) && !seen.has(p.id) && seen.add(p.id))
      .slice(0, PICKS)
      .map((p, i) => ({
        owner_id: user.id,
        investor_id: p.id,
        rank: i + 1,
        fit: Math.min(5, Math.max(1, Math.round(p.fit))),
        why: tidy(p.why),
      }));

    await admin.from("investor_matches").delete().eq("owner_id", user.id);
    if (picks.length) {
      const { error } = await admin.from("investor_matches").insert(picks);
      if (error) throw error;
    }
    await admin.from("startups").update({ matches_status: "done", matched_at: new Date().toISOString() }).eq("owner_id", user.id);

    return json({ ok: true, count: picks.length, keywords: matchKeywords });
  } catch (err) {
    await admin.from("startups").update({ matches_status: "error" }).eq("owner_id", user.id);
    throw err;
  }
});
