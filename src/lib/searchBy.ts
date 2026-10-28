// Application search modes, shared with the client search form (no database imports here).
export const SEARCH_BY = { company: "Company name", position: "Position", date: "Date applied" } as const;
export type SearchBy = keyof typeof SEARCH_BY;
