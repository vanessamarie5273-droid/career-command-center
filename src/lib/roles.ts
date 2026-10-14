// Title classification. Deliberately tolerant of different terminology so strong roles are not missed.

export type RoleFamily =
  | "STRATEGIC_AE" | "ENTERPRISE_AE" | "ACCOUNT_DIRECTOR" | "SALES_DIRECTOR" | "SALES_VP"
  | "BD_LEADER" | "SDR_LEADER" | "GTM_LEADER" | "PARTNER_ALLIANCES" | "SALES_MANAGER"
  | "AE_OTHER" | "SDR_IC" | "NOT_RELEVANT";

export type Seniority = "IC" | "SENIOR_IC" | "MANAGER" | "DIRECTOR" | "HEAD" | "VP" | "EXEC";

const NOT_SALES = /\b(engineer(ing)?|developer|scientist|researcher|designer|counsel|attorney|lawyer|paralegal|accountant|payroll|recruit(er|ing)|talent|people partner|hr\b|support (engineer|specialist)|technician|nurse|physician|clinician|pharmacist|analyst(?! relations)|operations (analyst|specialist)|data entry|intern|internship|apprentice|solutions? (engineer|architect|consultant)|sales engineer|pre-?sales|customer success (manager|associate)|implementation|onboarding|deal desk|revenue operations|sales operations|rev ?ops|enablement (specialist|manager)|marketing (manager|specialist)|product marketing|content|copywriter|writer|editor|social media|event|executive assistant|administrative|office manager|facilities|it (support|specialist)|security (engineer|analyst)|procurement (specialist|manager)|buyer|bookkeeper|controller|tax|treasury|audit)\b/i;

export function classifyTitle(title: string): { family: RoleFamily; seniority: Seniority; adjacent: boolean; stretch: boolean } {
  const t = title.toLowerCase().replace(/[,|()\-–—/]+/g, " ").replace(/\s+/g, " ");
  const seniority: Seniority =
    /\b(chief revenue|cro|chief sales|chief commercial|chief business)\b/.test(t) ? "EXEC"
    : /\b(svp|senior vice president|evp|vp|vice president)\b/.test(t) ? "VP"
    : /\bhead of\b/.test(t) ? "HEAD"
    : /\b(director|rvp|area vice)\b/.test(t) ? "DIRECTOR"
    : /\b(manager|lead|team lead|supervisor)\b/.test(t) ? "MANAGER"
    : /\b(senior|sr|principal|strategic|staff|lead|major|global)\b/.test(t) ? "SENIOR_IC"
    : "IC";

  const sales = /\b(sales|account executive|\bae\b|account director|account manager|business development|bdr|sdr|revenue|go to market|gtm|commercial|partnerships?|alliances|territory|client partner|client director|customer director|enterprise (growth|accounts?)|new business|market development|growth)\b/.test(t);
  if (!sales || (NOT_SALES.test(t) && !/\b(sales|business development|account) (director|leader|vp|vice|head)\b/.test(t) && !/\b(director|head|vp|vice president) (of )?(sales|business development|sales development)\b/.test(t))) {
    return { family: "NOT_RELEVANT", seniority, adjacent: false, stretch: false };
  }

  let family: RoleFamily = "NOT_RELEVANT";
  let adjacent = false;
  if (/\b(sales development|business development representative|\bbdr\b|\bsdr\b|\bxdr\b|market development)\b/.test(t)) {
    family = ["MANAGER", "DIRECTOR", "HEAD", "VP", "EXEC"].includes(seniority) ? "SDR_LEADER" : "SDR_IC";
  } else if (/\b(go to market|gtm|growth|commercial strategy|revenue strategy)\b/.test(t) && ["DIRECTOR", "HEAD", "VP", "EXEC", "MANAGER"].includes(seniority)) {
    family = "GTM_LEADER";
  } else if (/\b(business development)\b/.test(t)) {
    family = ["DIRECTOR", "HEAD", "VP", "EXEC", "MANAGER"].includes(seniority) ? "BD_LEADER" : "AE_OTHER";
    adjacent = family === "AE_OTHER";
  } else if (/\b(partnerships?|alliances|channel)\b/.test(t)) {
    family = "PARTNER_ALLIANCES"; adjacent = true;
  } else if (/\baccount director|client director|client partner|customer director|global account (director|manager|executive)|strategic account manager\b/.test(t)) {
    family = "ACCOUNT_DIRECTOR";
  } else if (/\b(account executive|\bae\b|account manager|sales executive|sales representative|territory (manager|executive)|new business)\b/.test(t)) {
    if (/\b(strategic|major|global|key|named|principal|enterprise strategic|large enterprise|lead)\b/.test(t)) family = "STRATEGIC_AE";
    else if (/\b(enterprise|public sector|sled|state|federal|healthcare|health|government|senior|sr)\b/.test(t)) family = "ENTERPRISE_AE";
    else { family = "AE_OTHER"; adjacent = true; }
    if (/\b(mid ?market|smb|small business|commercial|inside|associate|junior|growth account executive)\b/.test(t) && family !== "STRATEGIC_AE") { family = "AE_OTHER"; adjacent = true; }
    if (/\baccount manager\b/.test(t) && !/strategic|enterprise|global|key/.test(t)) { family = "AE_OTHER"; adjacent = true; }
  } else if (/\b(sales|revenue)\b/.test(t)) {
    if (["VP", "EXEC"].includes(seniority)) family = "SALES_VP";
    else if (["DIRECTOR", "HEAD"].includes(seniority)) family = "SALES_DIRECTOR";
    else if (seniority === "MANAGER") family = "SALES_MANAGER";
    else { family = "AE_OTHER"; adjacent = true; }
  }
  const stretch = family === "SALES_VP" || seniority === "EXEC" || (seniority === "VP" && family !== "SDR_LEADER");
  return { family, seniority, adjacent, stretch };
}

export function isRelevantFamily(f: RoleFamily) {
  return f !== "NOT_RELEVANT" && f !== "SDR_IC";
}

export const FAMILY_LABEL: Record<RoleFamily, string> = {
  STRATEGIC_AE: "Strategic Account Executive", ENTERPRISE_AE: "Enterprise Account Executive", ACCOUNT_DIRECTOR: "Account Director",
  SALES_DIRECTOR: "Sales Director", SALES_VP: "VP / Executive Sales", BD_LEADER: "Business Development Leadership",
  SDR_LEADER: "Sales Development Leadership", GTM_LEADER: "GTM / Growth Leadership", PARTNER_ALLIANCES: "Partnerships & Alliances",
  SALES_MANAGER: "Sales Management", AE_OTHER: "Account Executive (other segment)", SDR_IC: "SDR/BDR (individual)", NOT_RELEVANT: "Not relevant",
};
