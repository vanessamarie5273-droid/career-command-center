// Vanessa's professional profile — the basis of every match and recommendation.
// Only facts she provided. Do not add achievements here that she has not stated.

export const PROFILE = {
  summary:
    "Senior Enterprise Account Executive with 9+ years at SAP driving new business and install-base expansion across SLED, Healthcare, Life Sciences and Nonprofit. Closed $8.5M in new and expansion revenue and earned SAP Winners Circle 2025. Launched SAP's North America Digital Hub sales development team with global leadership: $15.6M closed revenue and $80.6M pipeline from 576 qualified opportunities, with a 25% increase in pipeline creation and a 30% increase in conversion. Cloud ERP, HCM, Procurement, Supply Chain, Data and Analytics, Business AI. C-suite engagement, public procurement and RFPs, multi-stakeholder deals. Background in nursing (BSN).",
  yearsExperience: 9,
  homeBase: "Scottsdale / Phoenix, AZ",
  // Mirrors her 2026 resume. Generated material is fact-checked against the resume itself, not this list.
  facts: [
    "9+ years at SAP in enterprise technology sales (SLED, Healthcare, Life Sciences, Nonprofit)",
    "Closed $8.5M in new and expansion revenue; SAP Winners Circle 2025",
    "Led a cross-functional rescue of an at-risk implementation that retained the customer and expanded the account with a $1.58M TCV licensing upsell",
    "Launched SAP's North America Digital Hub sales development team with global leadership",
    "Led the Digital Hub team to $15.6M in closed revenue and $80.6M in pipeline from 576 qualified opportunities",
    "25% increase in pipeline creation and 30% increase in conversion to closed revenue",
    "Self-sourced and closed $1.2M in net-new revenue as a Senior Sales Development Executive",
    "Engages C-suite sponsors and navigates public procurement, RFPs and multi-stakeholder buying committees",
    "Bachelor of Science in Nursing (BSN), University of Arizona",
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
