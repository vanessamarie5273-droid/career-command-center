// The people in a hiring process, as her brief names them. Shared with client components.
export const PERSONAS = ["recruiter", "hiring_manager", "executive", "peer", "hr"] as const;
export type Persona = (typeof PERSONAS)[number];
export const PERSONA_LABEL: Record<Persona, string> = { recruiter: "Recruiter", hiring_manager: "Hiring manager", executive: "Executive leadership", peer: "Peer or cross-functional partner", hr: "HR" };

export type MockMessage = { role: "user" | "assistant"; content: string };
export const MOCK_OPENER = "Start the interview.";
export const MOCK_FINISH = "End the interview now. Give me an overall debrief.";
