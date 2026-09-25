// Keep in sync with supabase/functions/_shared/taxonomy.ts
export const SECTORS: Record<string, string> = {
  b2b_saas: "B2B software",
  ai_ml: "AI and machine learning",
  fintech: "Fintech",
  climate: "Climate and energy",
  health: "Health",
  consumer: "Consumer",
  ecommerce: "E-commerce and DTC",
  hardware: "Hardware and physical products",
  marketplace: "Marketplaces",
  devtools: "Developer tools",
  gtm_sales: "Sales and GTM tools",
  edtech: "Education",
  proptech: "Property",
  food_agri: "Food and agriculture",
  logistics: "Logistics and supply chain",
};

export const STAGES: Record<string, string> = {
  pre_seed: "Pre-seed",
  seed: "Seed",
  angel: "Angel round",
  series_a: "Series A",
  series_b: "Series B+",
};

export const HEADCOUNT: Record<string, string> = {
  solo: "Solo founder",
  "2_5": "2 to 5",
  "6_10": "6 to 10",
  "11_25": "11 to 25",
  "26_50": "26 to 50",
  "50_plus": "More than 50",
};

export const REVENUE: Record<string, string> = {
  pre_revenue: "Pre-revenue",
  "0_10k": "$0 to $10k a month",
  "11_20k": "$11k to $20k a month",
  "21_30k": "$21k to $30k a month",
  "31_50k": "$31k to $50k a month",
  "51_100k": "$51k to $100k a month",
  "100k_plus": "More than $100k a month",
};

export const VALUES: Record<string, string> = {
  eco_friendly: "Eco-friendly",
  social_impact: "Social impact",
  charity: "Charity and non-profit",
  diversity: "Diverse founding team",
  open_source: "Open source",
  health_wellbeing: "Health and wellbeing",
  education: "Education access",
  ethical_ai: "Responsible AI",
  local_community: "Local community",
  b_corp: "B Corp",
};

export const INVESTOR_TYPES: Record<string, string> = {
  vc: "VC",
  angel: "Angel",
  family_office: "Family office",
  accelerator: "Accelerator",
  cvc: "Corporate VC",
};

export const label = (map: Record<string, string>, key?: string | null) => (key ? map[key] ?? key : "");
