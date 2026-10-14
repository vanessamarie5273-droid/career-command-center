// Rule-based positioning guidance, drawn only from Vanessa's stated experience. Labelled as AI assessment in the UI.
const BY_CATEGORY: Record<string, string[]> = {
  "ERP & Financial Technology": ["Lead with nine years selling SAP into finance organisations and engaging CFOs on financial transformation.", "Your ERP fluency shortens ramp: you already speak the language of the buyer and the incumbent."],
  "Office of the CFO": ["Position as an ex-SAP seller who knows the CFO's agenda, the incumbent ERP landscape and how finance tools get bought.", "Use the $28M+ self-sourced pipeline to show you can create demand for a category still displacing spreadsheets and legacy tools."],
  "Healthcare & Clinical AI": ["Combine your healthcare and clinical operations background with enterprise selling into regulated buyers.", "Health system deals are multi-threaded (CFO, CIO, CMIO, operations); stress your executive engagement across those roles."],
  "Life Sciences Technology": ["Emphasise regulated-industry selling and your healthcare background; life sciences buyers expect compliance fluency."],
  "Government Technology": ["Lead with U.S. public sector experience at SAP: procurement cycles, budget timing and agency executive engagement."],
  "Cybersecurity & AI Governance": ["Frame regulated-industry and public sector experience as an advantage for compliance-driven security buying; be ready to show fast technical ramp."],
  "Enterprise AI & Agents": ["Show you can sell AI as business transformation to CEOs and CFOs, not just to technical buyers.", "Highlight building SAP's North America Digital Hub as evidence you can build a motion from scratch, which early AI go-to-market teams need."],
  "AI Infrastructure & Data": ["Position around enterprise data and cloud transformation; consumption-based models reward the land-and-expand discipline you used at SAP."],
  "Cloud & Enterprise Automation": ["Use your cloud and cross-functional deal execution to show you can run large platform deals with partners and systems integrators."],
  "Energy & Grid Modernization": ["Utility buyers are regulated and public-sector-like; your public sector and regulated-industry cycles transfer directly."],
  "Enterprise Applications & Productivity": ["Lead with complex enterprise application sales and executive engagement; differentiate from transactional SaaS sellers."],
  "Emerging Enterprise Markets": ["Emphasise GTM building: TAM, ICP, territory plans and sales development methodology."],
};

export function positioning(category: string, maturity?: string | null) {
  const lines = [...(BY_CATEGORY[category] ?? [])];
  if (maturity && /emerging|high-growth/i.test(maturity)) lines.push("At an earlier-stage company, your experience building sales development and GTM frameworks can support a leadership or first-in-segment role. Ask how territories and quotas are set, and about equity terms.");
  if (maturity && /established|public/i.test(maturity)) lines.push("At an established company, target strategic or named-account roles where your 128% average attainment and large-deal record carry the most weight.");
  lines.push("Engagement: identify the regional or segment sales leader, connect with a personalised note referencing a specific company priority, then apply with a tailored resume within the same week.");
  return lines;
}
