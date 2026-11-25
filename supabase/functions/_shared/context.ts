// What Claude knows when it drafts outreach: the founder's startup and the investor, as one block of text.
import { admin, HttpError } from "./core.ts";
import { label, REVENUE, SECTORS, STAGES, VALUES } from "./taxonomy.ts";
import { loadInvestor, type Investor } from "./investor.ts";

export async function outreachContext(ownerId: string, investorIdValue: number): Promise<{ investor: Investor; founder: string; firstName: string; context: string }> {
  const [investor, { data: startup }, { data: profile }] = await Promise.all([
    loadInvestor(investorIdValue),
    admin.from("startups").select("*").eq("owner_id", ownerId).single(),
    admin.from("profiles").select("first_name,last_name").eq("id", ownerId).single(),
  ]);
  if (!startup) throw new HttpError(404, "Finish onboarding first");

  const founder = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "the founder";

  const context = `<startup>
Name: ${startup.name}
Website: ${startup.website_url ?? startup.domain}
One-liner: ${startup.one_liner ?? ""}
Summary: ${startup.summary ?? ""}
Sectors: ${(startup.sectors ?? []).map((s: string) => label(SECTORS, s)).join(", ")}
Raising: ${label(STAGES, startup.stage)} ${startup.raise_amount ? `(${startup.raise_amount})` : ""}
Revenue: ${label(REVENUE, startup.revenue_band)}
Traction: ${startup.traction ?? "not stated"}
Values: ${(startup.values ?? []).map((v: string) => label(VALUES, v)).join(", ") || "none stated"}
Founder: ${founder}
Booking link: ${startup.calendar_url ?? "none"}
</startup>

<investor>
Name: ${investor.full_name}, ${investor.title ?? "investor"} at ${investor.firm}
Headline: ${investor.headline ?? ""}
Location: ${[investor.city, investor.country].filter(Boolean).join(", ")}
Stages they invest at: ${investor.stages.join(", ") || "not stated"}
Sectors they focus on: ${investor.focus.join(", ") || "not stated"}
Firm industry: ${investor.firm_industry ?? ""}
About the firm: ${(investor.firm_about ?? "").replace(/\s+/g, " ").slice(0, 800)}
Firm specialties: ${investor.specialties.slice(0, 25).join(", ")}
</investor>`;

  return { investor, founder, firstName: profile?.first_name ?? founder, context };
}
