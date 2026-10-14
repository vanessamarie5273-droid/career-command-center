// Vanessa's professional profile — the basis of every match and recommendation.
// Only facts she provided. Do not add achievements here that she has not stated.

export const PROFILE = {
  summary:
    "Senior enterprise technology sales executive with ~9 years at SAP. Strategic enterprise sales across U.S. public sector, healthcare, regulated industries and commercial markets. Built and led SAP's North America Digital Hub with global leadership; developed and mentored 50+ sales development professionals. Established go-to-market strategy, TAM, ICP, sales development methodology, territory plans and revenue performance frameworks. $12.8M cumulative closed revenue, $28M+ self-sourced pipeline, 128% average attainment. Complex enterprise software, executive engagement (CFO, CIO, CEO, procurement), financial transformation, cloud, AI, cross-functional deal execution. Background in healthcare and clinical operations.",
  yearsExperience: 9,
  homeBase: "Scottsdale / Phoenix, AZ",
  facts: [
    "~9 years at SAP in enterprise technology sales",
    "Built and led SAP's North America Digital Hub in partnership with global leadership",
    "Developed and mentored 50+ sales development professionals",
    "$12.8M cumulative closed revenue across career roles",
    "$28M+ self-sourced pipeline",
    "128% average sales attainment",
    "Established GTM strategy, TAM, ICP, sales development methodology, territory plans and revenue performance frameworks",
    "Engages CFOs, CIOs, CEOs and procurement leadership",
    "Background in healthcare and clinical operations",
  ],
  targetRoles: [
    "Strategic Account Executive",
    "Enterprise Account Executive",
    "Strategic Enterprise Sales",
    "Account Director",
    "Regional Sales Director",
    "Director of Business Development",
    "Director of Sales Development",
    "Head of Sales Development",
    "Sales Development Leadership",
    "Enterprise Growth / Go-to-Market Leadership",
  ],
  // Domain keywords drawn from her stated experience; used for alignment scoring.
  strengths: {
    "public sector": ["public sector", "state and local", "sled", "government", "federal civilian", "agency", "agencies", "municipal", "education"],
    healthcare: ["healthcare", "health system", "hospital", "clinical", "provider", "payer", "health plan", "life sciences", "pharma", "biotech"],
    regulated: ["regulated", "compliance", "financial services", "banking", "insurance", "hipaa", "fedramp"],
    erp_finance: ["erp", "finance", "financial", "cfo", "office of the cfo", "accounting", "fp&a", "procurement", "spend", "close", "planning", "sap", "oracle", "workday"],
    cloud_ai: ["cloud", "saas", "ai", "artificial intelligence", "machine learning", "data", "analytics", "platform", "automation", "agents", "genai", "llm"],
    executive: ["c-suite", "c-level", "executive", "cxo", "cio", "cfo", "ceo", "board"],
    complex_sales: ["enterprise", "strategic", "complex", "multi-threaded", "seven-figure", "7-figure", "large deal", "global accounts", "fortune 500", "fortune 1000", "named accounts", "meddic", "meddpicc", "value selling"],
    sdr_leadership: ["sales development", "sdr", "bdr", "pipeline generation", "outbound", "coaching", "mentor", "hiring", "enablement", "playbook"],
    gtm: ["go-to-market", "gtm", "icp", "tam", "territory", "segmentation", "revenue operations", "methodology"],
  } as Record<string, string[]>,
};

export const SOUTHWEST_STATES = ["AZ", "NM", "NV", "UT", "CO", "TX", "CA", "OK"];
export const AZ_METRO = ["phoenix", "scottsdale", "tempe", "mesa", "chandler", "gilbert", "glendale", "peoria", "arizona", ", az"];
