// Kit part names and result types, shared with client components (no SDK imports here).
export const KIT_PARTS = ["resume", "letter", "pov", "committee", "answers"] as const;
export type KitPart = (typeof KIT_PARTS)[number];
export type KitParts = Record<KitPart, string>;
export const KIT_LABEL: Record<KitPart, string> = { resume: "Tailored resume", letter: "Why Me letter", pov: "Point of view + 30-60-90", committee: "Buying committee notes", answers: "Application answers" };

export type KitIssue = { kind: "language" | "figure" | "length"; text: string; detail: string };
export type KitChecks = Record<KitPart, KitIssue[]>;
