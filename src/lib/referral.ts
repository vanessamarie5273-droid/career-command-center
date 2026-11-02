// Pure helpers shared by the My Network page and its client widgets (no database imports).

export type PersonType = "recruiter" | "exec" | "leader" | "sales" | "other";
export const PERSON_LABEL: Record<PersonType, string> = { recruiter: "Recruiting", exec: "Executives & VPs", leader: "Sales Leadership", sales: "Sales & GTM", other: "Other" };

/**
 * A short LinkedIn note about an opening, written from her resume facts only (PROFILE.facts), in her brief's voice:
 * direct, specific, an ask that creates the next conversation. She edits it before sending.
 */
export function referralNote(o: { first: string; company: string; type: PersonType; role?: string | null; applied?: boolean }) {
  const co = o.company || "your company";
  const proof = "9+ years at SAP, $8.5M closed in new and expansion revenue, and Winners Circle 2025";
  const about = o.role ? (o.applied ? `I applied for the ${o.role} role at ${co}` : `${co} is hiring ${/^[aeiou]/i.test(o.role) ? "an" : "a"} ${o.role}, and I'm going after it`) : `${co} is on my short list for my next enterprise sales role`;
  const body =
    o.type === "recruiter"
      ? `${about}. I bring ${proof}. Who is the hiring manager, and what does this hire need to deliver in the first two quarters? I can send a short point of view on the territory.`
      : o.type === "leader" || o.type === "exec"
        ? `${about}. I bring ${proof}, and I launched SAP's North America Digital Hub sales development team. Would you give me 15 minutes on what the team needs from this hire${o.role ? "" : " and where it's headed"}?`
        : `${about}. Quick background: ${proof}. Would you be open to 10 minutes on how the team runs${o.role ? ", and a referral if it looks like a fit" : ", and who I should talk to about open roles"}?`;
  return `Hi ${o.first},\n\n${body}\n\nVanessa`;
}
