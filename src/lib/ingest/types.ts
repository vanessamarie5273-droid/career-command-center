export type Provider = "GREENHOUSE" | "LEVER" | "ASHBY" | "SMARTRECRUITERS" | "WORKDAY" | "WORKABLE" | "AMAZON" | "ORACLE" | "GOOGLE_JOBS";

export type RawPosting = {
  provider: Provider;
  externalId: string;
  title: string;
  department?: string | null;
  location?: string | null;
  workplaceType?: string | null;
  isRemote?: boolean;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  applyUrl: string;
  postedAt?: Date | null;
  // Structured compensation published through the ATS (employer-provided)
  comp?: { salaryMin?: number; salaryMax?: number; oteMin?: number; oteMax?: number; summary?: string; equity?: boolean } | null;
};

export type BoardResult = { postings: RawPosting[]; total: number };

export class BoardNotFound extends Error {}

/** The job board's server answered 429 (too many requests) through every retry. Says nothing about whether the board exists. */
export class RateLimited extends Error {}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
